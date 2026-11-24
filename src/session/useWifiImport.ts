import type { useQueuePages } from './useQueuePages';
import type { createLibraryLists } from './libraryLists';
import type { SessionState } from './useSessionRefs';
import { PREF_WIFI_ADDRESS } from './sessionPreferences';
import { useState, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ConnectionStatus,
  ConnectionTransport,
  WifiImportStatus,
  WifiImportDirectoryPage,
} from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { discoveryEndpoint } from './wifiDiscovery';
import { isCurrentWifiImportSession } from './wifiImportSession';
import {
  TransferSessionLeases,
  type AcquireTransferLeaseOptions,
  type TransferSessionLease,
} from './transferSessionLeases';
import { wifiImportErrorMessage } from './wifiImportError';
import {
  startDiscovery as startWifiDiscoveryModule,
  stopDiscovery as stopWifiDiscoveryModule,
  addDeviceFoundListener as addWifiDeviceFoundListener,
  DiscoveredWifiService,
} from '../../modules/compas-discovery/src/index';
import { getRequiredPermissionsForWifi, requestMissingPermissions } from './PermissionPolicy';
import { nextDiscoveryScanId } from './connectionDiscovery';

interface WifiImportDependencies extends
  Pick<ReturnType<typeof createLibraryLists>, 'loadLibraryCategory'>,
  Pick<ReturnType<typeof useQueuePages>, 'refreshQueue'> {
  shared: Pick<SessionState,
    'apiRef' | 'connectedPlayerKeyRef' | 'connectionAttemptRef' | 'currentLibraryCategoryRef'
    | 'featureSetRef' | 'stateRef'
  >;
  startCatalogSync: (api: RemoteApi, attempt: number, features: string[], refreshCoversManifest?: boolean) => Promise<void>;
  tryUpgradeToWifi: (currentApi: RemoteApi, candidateAddress?: string | undefined, explicit?: boolean, isStillRequested?: () => boolean, expectedPublicLibraryId?: string | undefined) => Promise<boolean>;
}

interface WifiImportCommandContext extends WifiImportDependencies {
  activeWifiEndpointRef: React.RefObject<string | null>;
  wifiImportOperationRef: React.RefObject<number>;
  wifiUpgradeScanCleanupRef: React.RefObject<(() => void) | null>;
  setWifiImportStatus: React.Dispatch<React.SetStateAction<WifiImportStatus>>;
  cancelWifiImportOperation: () => void;
}

const wifiImportSession = (deps: WifiImportCommandContext) => {
  const { activeWifiEndpointRef } = deps;
  const { apiRef, connectedPlayerKeyRef, connectionAttemptRef, featureSetRef, stateRef } = deps.shared;
  const api = apiRef.current;
  const endpoint = activeWifiEndpointRef.current;
  const attempt = connectionAttemptRef.current;
  const playerKey = connectedPlayerKeyRef.current;
  if (!api || !endpoint || !playerKey || stateRef.current.connectionStatus !== ConnectionStatus.Connected ||
      stateRef.current.connectionTransport !== ConnectionTransport.Wifi ||
      !featureSetRef.current.has('wifi_import') || !featureSetRef.current.has('wifi_import_files')) return null;
  return { api, endpoint, attempt, playerKey };
};

const ownsWifiImportSession = (deps: WifiImportCommandContext, session: NonNullable<ReturnType<typeof wifiImportSession>>) => {
  const { activeWifiEndpointRef } = deps;
  const { apiRef, connectedPlayerKeyRef, connectionAttemptRef, stateRef } = deps.shared;
  return isCurrentWifiImportSession(session, {
    api: apiRef.current,
    attempt: connectionAttemptRef.current,
    playerKey: connectedPlayerKeyRef.current,
    endpoint: activeWifiEndpointRef.current,
    connected: stateRef.current.connectionStatus === ConnectionStatus.Connected,
    transport: stateRef.current.connectionTransport === ConnectionTransport.Wifi ? 'wifi' : 'bluetooth',
  });
};

const refreshWifiImport = async (deps: WifiImportCommandContext) => {
  const { setWifiImportStatus, wifiImportOperationRef } = deps;
  const session = wifiImportSession(deps);
  if (!session) return;
  const operation = ++wifiImportOperationRef.current;
  try {
    const status = await session.api.importStatus();
    if (ownsWifiImportSession(deps, session) && operation === wifiImportOperationRef.current) setWifiImportStatus({
      ...status, error: status.error ? wifiImportErrorMessage(status.error) : null,
    });
  } catch (err: any) {
    if (ownsWifiImportSession(deps, session) && operation === wifiImportOperationRef.current) {
      setWifiImportStatus({ state: 'error', error: wifiImportErrorMessage(err) });
    }
  }
};

const scanForWifiImportPlayer = (deps: WifiImportCommandContext, currentApi: RemoteApi, expectedPublicLibraryId: string, isCurrent: () => boolean) => {
  const { tryUpgradeToWifi, wifiUpgradeScanCleanupRef } = deps;
  const scanId = nextDiscoveryScanId();
  return new Promise<void>((resolve, reject) => {
    let done = false;
    let scanActive = true;
    const attempted = new Set<string>();
    let candidateQueue = Promise.resolve();
    let timer: ReturnType<typeof setTimeout>;
    let cancelScan: () => void;
    const cleanup = () => {
      scanActive = false;
      subscription?.remove();
      void stopWifiDiscoveryModule().catch(() => {});
      clearTimeout(timer);
      if (wifiUpgradeScanCleanupRef.current === cancelScan) wifiUpgradeScanCleanupRef.current = null;
    };
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      cleanup();
      error ? reject(error) : resolve();
    };
    cancelScan = () => finish(new Error('Wi-Fi player search was cancelled.'));
    const subscription = addWifiDeviceFoundListener((service: DiscoveredWifiService) => {
      if (service.scanId !== scanId) return;
      const endpoint = discoveryEndpoint(service);
      if (!endpoint || attempted.has(endpoint) || attempted.size >= 64 || !isCurrent()) return;
      attempted.add(endpoint);
      candidateQueue = candidateQueue.then(async () => {
        if (!isCurrent() || done) return;
        if (await tryUpgradeToWifi(currentApi, endpoint, true, () => isCurrent() && scanActive, expectedPublicLibraryId)) finish();
      }).catch(() => {});
    });
    timer = setTimeout(() => finish(new Error('Could not find the matching player. Turn on Wi-Fi on the player and phone, then try again.')), 15000);
    wifiUpgradeScanCleanupRef.current = cancelScan;
    void startWifiDiscoveryModule(scanId).then((started) => {
      if (!started && !done) finish(new Error('Wi-Fi discovery is unavailable. Check Wi-Fi and local network permission, then try again.'));
    }).catch(() => finish(new Error('Could not search for the player on Wi-Fi.')));
  });
};

const startWifiImportUpgrade = async (deps: WifiImportCommandContext) => {
  const { cancelWifiImportOperation, tryUpgradeToWifi, wifiImportOperationRef } = deps;
  const { apiRef, connectedPlayerKeyRef, connectionAttemptRef, featureSetRef, stateRef } = deps.shared;
  const currentApi = apiRef.current;
  const attempt = connectionAttemptRef.current;
  const playerKey = connectedPlayerKeyRef.current;
  const ownsBluetoothSession = () => apiRef.current === currentApi && connectionAttemptRef.current === attempt &&
    connectedPlayerKeyRef.current === playerKey && stateRef.current.connectionStatus === ConnectionStatus.Connected &&
    stateRef.current.connectionTransport === ConnectionTransport.Bluetooth;
  if (!currentApi || !ownsBluetoothSession() ||
      !featureSetRef.current.has('wifi_import') || !featureSetRef.current.has('wifi_import_files') ||
      !featureSetRef.current.has(RemoteApi.CATALOG_SYNC_FEATURE)) {
    throw new Error('Update the player firmware to use Wi-Fi import.');
  }
  cancelWifiImportOperation();
  const operation = wifiImportOperationRef.current;
  const isCurrent = () => ownsBluetoothSession() && operation === wifiImportOperationRef.current;
  const wifiPerms = getRequiredPermissionsForWifi();
  if (wifiPerms.length > 0) {
    const permResult = await requestMissingPermissions(wifiPerms);
    if (!isCurrent()) throw new Error('Wi-Fi player search was cancelled.');
    if (!permResult.granted) throw new Error('Grant Local Network permission to find the player on Wi-Fi.');
  }

  let expectedPublicLibraryId: string | null = null;
  try {
    expectedPublicLibraryId = (await currentApi.capabilities({ omitPin: true })).libraryId ?? null;
    if (!isCurrent()) throw new Error('Wi-Fi player search was cancelled.');
  } catch (cause: any) {
    if (!isCurrent()) throw new Error('Wi-Fi player search was cancelled.');
    throw cause;
  }
  if (!expectedPublicLibraryId) throw new Error('The player does not expose a public library identity. Update the player firmware and try again.');

  const savedAddress = await AsyncStorage.getItem(PREF_WIFI_ADDRESS);
  if (!isCurrent()) throw new Error('Wi-Fi player search was cancelled.');
  if (savedAddress?.trim() && await tryUpgradeToWifi(currentApi, savedAddress, true, isCurrent, expectedPublicLibraryId)) return;
  if (!isCurrent()) throw new Error('Wi-Fi player search was cancelled.');

  await scanForWifiImportPlayer(deps, currentApi, expectedPublicLibraryId, isCurrent);
};

const startWifiImport = async (deps: WifiImportCommandContext) => {
  const { setWifiImportStatus, wifiImportOperationRef } = deps;
  const session = wifiImportSession(deps);
  if (!session) throw new Error('Connect to the player over Wi-Fi to start file import.');
  const operation = ++wifiImportOperationRef.current;
  const isCurrent = () => ownsWifiImportSession(deps, session) && operation === wifiImportOperationRef.current;
  try {
    let status = await session.api.importStatus();
    if (!isCurrent()) return;
    setWifiImportStatus({ ...status, error: status.error ? wifiImportErrorMessage(status.error) : null });
    if (status.state === 'stopped' || status.state === 'error') {
      await session.api.startImport();
      if (!isCurrent()) return;
    }
    setWifiImportStatus({ state: 'starting', error: null });
    for (let poll = 0; poll < 40; poll++) {
      if (!isCurrent()) return;
      status = await session.api.importStatus();
      if (!isCurrent()) return;
      setWifiImportStatus({ ...status, error: status.error ? wifiImportErrorMessage(status.error) : null });
      if (status.state === 'ready') return;
      if (status.state === 'error') throw new Error(status.error || 'The transfer service reported an error.');
      if (status.state === 'stopped') {
        await session.api.startImport();
        if (!isCurrent()) return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Wi-Fi import did not become ready in time.');
  } catch (err: any) {
    if (isCurrent()) setWifiImportStatus({ state: 'error', error: wifiImportErrorMessage(err) });
    throw err;
  }
};

const stopWifiImport = async (deps: WifiImportCommandContext) => {
  const { setWifiImportStatus, wifiImportOperationRef } = deps;
  const session = wifiImportSession(deps);
  if (!session) throw new Error('The Wi-Fi import session ended. Reconnect before finishing.');
  const operation = ++wifiImportOperationRef.current;
  const isCurrent = () => ownsWifiImportSession(deps, session) && operation === wifiImportOperationRef.current;
  setWifiImportStatus((previous) => ({ ...previous, state: 'stopping', error: null }));
  try {
    await session.api.stopImport();
    if (!isCurrent()) return;
    for (let poll = 0; poll < 40; poll++) {
      if (!isCurrent()) return;
      const status = await session.api.importStatus();
      if (!isCurrent()) return;
      setWifiImportStatus({ ...status, error: status.error ? wifiImportErrorMessage(status.error) : null });
      if (status.state === 'stopped') return;
      if (status.state === 'error') throw new Error(status.error || 'The transfer service reported an error.');
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('The Wi-Fi import page did not stop in time.');
  } catch (err: any) {
    if (isCurrent()) setWifiImportStatus({ state: 'error', error: wifiImportErrorMessage(err) });
    throw err;
  }
};

/** After uploads, reload the Library list, queue and catalog. Browsing in progress is left alone; the catalog sync updates it. */
const refreshAfterWifiUpload = async (deps: WifiImportCommandContext) => {
  const { loadLibraryCategory, refreshQueue, startCatalogSync } = deps;
  const { connectionAttemptRef, currentLibraryCategoryRef, featureSetRef, stateRef } = deps.shared;
  const session = wifiImportSession(deps);
  if (!session) return;
  const api = session.api;
  if (stateRef.current.screen.type !== 'Library') await loadLibraryCategory(currentLibraryCategoryRef.current, api);
  if (!ownsWifiImportSession(deps, session)) return;
  refreshQueue(api);
  if (featureSetRef.current.has(RemoteApi.CATALOG_SYNC_FEATURE)) {
    startCatalogSync(api, connectionAttemptRef.current, [...featureSetRef.current]);
  }
};

const requireWifiImportSession = (deps: WifiImportCommandContext) => {
  const session = wifiImportSession(deps);
  if (!session || !ownsWifiImportSession(deps, session)) throw new Error('The Wi-Fi import session ended. Reopen import for the connected player.');
  return session;
};

const listWifiImportFiles = async (deps: WifiImportCommandContext, path: string, offset: number, showHidden = false): Promise<WifiImportDirectoryPage> => {
  const session = requireWifiImportSession(deps);
  const page = await session.api.importFiles(path, offset, 50, showHidden);
  if (!ownsWifiImportSession(deps, session)) throw new Error('The Wi-Fi import session ended.');
  return page;
};

const downloadWifiImportFile = async (
  deps: WifiImportCommandContext,
  remotePath: string, destinationUri: string,
  onProgress: (received: number, total: number) => void, signal: AbortSignal,
): Promise<string | null> => {
  const session = requireWifiImportSession(deps);
  return session.api.downloadImportFile(
    session.endpoint, remotePath, destinationUri,
    ({ received, total }) => { if (ownsWifiImportSession(deps, session) && !signal.aborted) onProgress(received, total); },
    signal,
  );
  // Once saved the file is done, even if the session changed meanwhile; the next file checks the session again.
};

const uploadWifiImportFile = async (
  deps: WifiImportCommandContext,
  uri: string, path: string, name: string, onProgress: (sent: number, total: number) => void, signal: AbortSignal,
): Promise<void> => {
  const session = requireWifiImportSession(deps);
  await session.api.uploadImportFile(session.endpoint, uri, path, name,
    ({ sent, total }) => { if (ownsWifiImportSession(deps, session) && !signal.aborted) onProgress(sent, total); }, signal);
  if (!ownsWifiImportSession(deps, session)) throw new Error('The Wi-Fi import session ended.');
};

const renameWifiImportFile = async (deps: WifiImportCommandContext, path: string, name: string) => {
  const session = requireWifiImportSession(deps);
  await session.api.renameImportFile(path, name);
  if (!ownsWifiImportSession(deps, session)) throw new Error('The Wi-Fi import session ended.');
};

const deleteWifiImportFile = async (deps: WifiImportCommandContext, path: string) => {
  const session = requireWifiImportSession(deps);
  await session.api.deleteImportFile(path);
  if (!ownsWifiImportSession(deps, session)) throw new Error('The Wi-Fi import session ended.');
};

/** Creates an SD card folder; an existing folder of the same name is reused. */
const createWifiImportDirectory = async (deps: WifiImportCommandContext, path: string, name: string) => {
  const session = requireWifiImportSession(deps);
  try {
    await session.api.createImportDirectory(path, name);
  } catch (err: any) {
    if (err?.statusCode !== 409 || !String(err?.responseBody ?? '').includes('name_exists')) throw err;
  }
  if (!ownsWifiImportSession(deps, session)) throw new Error('The Wi-Fi import session ended.');
};

function createWifiImportCommands(deps: WifiImportCommandContext) {
  return {
    refreshWifiImport: refreshWifiImport.bind(undefined, deps),
    startWifiImportUpgrade: startWifiImportUpgrade.bind(undefined, deps),
    startWifiImport: startWifiImport.bind(undefined, deps),
    stopWifiImport: stopWifiImport.bind(undefined, deps),
    refreshAfterWifiUpload: refreshAfterWifiUpload.bind(undefined, deps),
    listWifiImportFiles: listWifiImportFiles.bind(undefined, deps),
    downloadWifiImportFile: downloadWifiImportFile.bind(undefined, deps),
    uploadWifiImportFile: uploadWifiImportFile.bind(undefined, deps),
    renameWifiImportFile: renameWifiImportFile.bind(undefined, deps),
    deleteWifiImportFile: deleteWifiImportFile.bind(undefined, deps),
    createWifiImportDirectory: createWifiImportDirectory.bind(undefined, deps),
  };
}

export function useWifiImport(deps: WifiImportDependencies) {
  // Stable owner token for UI work that spans an identity-verified BT → Wi-Fi upgrade.
  const wifiImportOwnerKeyRef = useRef<string | null>(null);

  const activeWifiEndpointRef = useRef<string | null>(null);

  const wifiImportOperationRef = useRef(0);

  const [wifiImportStatus, setWifiImportStatusState] = useState<WifiImportStatus>({ state: 'stopped', error: null });
  const wifiImportStatusRef = useRef<WifiImportStatus>(wifiImportStatus);
  wifiImportStatusRef.current = wifiImportStatus;
  const setWifiImportStatus: React.Dispatch<React.SetStateAction<WifiImportStatus>> = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(wifiImportStatusRef.current) : next;
    wifiImportStatusRef.current = resolved;
    setWifiImportStatusState(resolved);
  }, []);

  const wifiUpgradeScanCleanupRef = useRef<(() => void) | null>(null);
  const leasesRef = useRef<TransferSessionLeases | null>(null);

  const cancelWifiImportOperation = useCallback(() => {
    wifiImportOperationRef.current++;
    leasesRef.current?.invalidate();
    wifiUpgradeScanCleanupRef.current?.();
    wifiUpgradeScanCleanupRef.current = null;
  }, []);

  const { refreshWifiImport, ...commands } = createWifiImportCommands({
    ...deps, activeWifiEndpointRef, wifiImportOperationRef, wifiUpgradeScanCleanupRef,
    setWifiImportStatus, cancelWifiImportOperation,
  });
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  const depsRef = useRef(deps);
  depsRef.current = deps;
  if (!leasesRef.current) {
    leasesRef.current = new TransferSessionLeases({
      getSessionToken: () => {
        const { apiRef, stateRef } = depsRef.current.shared;
        if (stateRef.current.connectionStatus !== ConnectionStatus.Connected ||
            stateRef.current.connectionTransport !== ConnectionTransport.Wifi) return null;
        return apiRef.current;
      },
      getState: () => wifiImportStatusRef.current.state,
      start: () => commandsRef.current.startWifiImport(),
      stop: () => commandsRef.current.stopWifiImport(),
    });
  }
  const acquireWifiImportLease = useCallback(
    (signal?: AbortSignal, options?: AcquireTransferLeaseOptions): Promise<TransferSessionLease> =>
      leasesRef.current!.acquire(signal, options),
    [],
  );

  return {
    wifiImportStatus, wifiImportOwnerKeyRef, activeWifiEndpointRef, wifiImportOperationRef,
    wifiUpgradeScanCleanupRef, setWifiImportStatus,
    commands: { refreshWifiImport, cancelWifiImportOperation, acquireWifiImportLease, ...commands },
  };
}
