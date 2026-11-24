import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addAppUpdateInstallListener, canInstallAppUpdates, consumePendingAppUpdateInstall, getAppVersion, getDeviceApiLevel, installAppUpdate, notificationsEnabled, notifyRelease, openAppUpdatePermissionSettings } from '../../modules/compas-updates/src';
import { checkReleaseUpdates, isFirmwareReleaseNewer, ReleaseNotice } from './releaseUpdates';
import { emptySaved, noticeKey, parseSavedUpdates } from './updatePreferences';
import appConfig from '../../app.json';
import { useI18n } from '../i18n';

const STORAGE_KEY = 'compas.releaseUpdates.v1';
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
const RETRY_INTERVAL = 15 * 60 * 1000;

function eligibleApplicationNotice(notice: ReleaseNotice | null, installedCode: number, apiLevel: number, betaEnabled: boolean): ReleaseNotice | null {
  if (!notice || notice.kind !== 'application' || notice.versionCode == null || notice.minSdk == null) return null;
  if (notice.channel !== (betaEnabled ? 'beta' : 'stable')) return null;
  return notice.versionCode > installedCode && apiLevel >= notice.minSdk ? notice : null;
}

interface UpdatesState {
  firmware: ReleaseNotice | null;
  application: ReleaseNotice | null;
  appVersion: string;
  checking: boolean;
  installing: boolean;
  installPermission: boolean;
  android: boolean;
  betaUpdates: boolean;
  checkedAt: number;
  error: string | null;
  alerts: boolean;
  unseen: ReleaseNotice[];
  check(): Promise<void>;
  setAlerts(enabled: boolean): Promise<void>;
  setBetaUpdates(enabled: boolean): Promise<void>;
  acknowledge(notices: ReleaseNotice[]): void;
  openRelease(notice: ReleaseNotice): Promise<void>;
  installApplicationUpdate(): Promise<void>;
  requestInstallPermission(): void;
}
const UpdatesContext = createContext<UpdatesState | null>(null);

function useReleaseState(playerVersion?: string | null) {
  const { t } = useI18n();
  const playerVersionRef = useRef(playerVersion ?? null);
  playerVersionRef.current = playerVersion ?? null;
  const firmwareUpdate = (notice: ReleaseNotice | null): ReleaseNotice | null =>
    notice && isFirmwareReleaseNewer(playerVersionRef.current, notice.version) ? notice : null;
  const firmwareUpdateRef = useRef(firmwareUpdate);
  firmwareUpdateRef.current = firmwareUpdate;
  const tRef = useRef(t);
  tRef.current = t;
  const saved = useRef(emptySaved());
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installPermission, setInstallPermission] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [permissionRetry, setPermissionRetry] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState(appConfig.expo.version);
  const [application, setApplication] = useState<ReleaseNotice | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const installInFlight = useRef(false);
  const deliveryInFlight = useRef(false);
  const channelRevision = useRef(0);
  const lastAttempt = useRef(0);
  const mounted = useRef(true);
  const writes = useRef(Promise.resolve());
  return {
    firmwareUpdate, firmwareUpdateRef, tRef, saved, revision, setRevision, ready, setReady, checking, setChecking,
    installing, setInstalling, installPermission, setInstallPermission, installError, setInstallError, permissionRetry,
    setPermissionRetry, error, setError, appVersion, setAppVersion, application, setApplication, inFlight,
    installInFlight, deliveryInFlight, channelRevision, lastAttempt, mounted, writes,
  };
}

type ReleaseState = ReturnType<typeof useReleaseState>;

function useReleaseStorage({ saved, writes, mounted, setRevision, deliveryInFlight }: ReleaseState) {
  const persist = useCallback(() => {
    const value = JSON.stringify(saved.current);
    writes.current = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(STORAGE_KEY, value)).catch(() => {});
    if (mounted.current) setRevision((v) => v + 1);
  }, []);

  const deliver = useCallback(async (notices: ReleaseNotice[]) => {
    if (!saved.current.alerts || deliveryInFlight.current) return;
    deliveryInFlight.current = true;
    try {
    for (const notice of notices) {
      const key = noticeKey(notice);
      if (saved.current.notified.includes(key)) continue;
      try {
        if (await notifyRelease(notice.kind, notice.version, notice.releaseUrl)) {
          saved.current.notified = [...saved.current.notified, key].slice(-20);
          persist();
        }
      } catch { /* In-app notices remain available if Android blocks notifications. */ }
    }
    } finally { deliveryInFlight.current = false; }
  }, [persist]);

  return { persist, deliver };
}

type ReleaseStorage = ReturnType<typeof useReleaseStorage>;

function useReleaseCheck(state: ReleaseState, { persist, deliver }: ReleaseStorage) {
  const { ready, inFlight, lastAttempt, saved, setChecking, setError, channelRevision, appVersion,
    mounted, setApplication, firmwareUpdateRef } = state;
  const check = useCallback((): Promise<void> => {
    if (!ready) return Promise.resolve();
    if (inFlight.current) return inFlight.current;
    lastAttempt.current = Date.now();
    saved.current.attemptedAt = lastAttempt.current;
    persist();
    setChecking(true);
    setError(null);
    const request = (async () => {
      try {
        const requestedChannel = saved.current.betaUpdates ? 'beta' : 'stable';
        const requestedChannelRevision = channelRevision.current;
        const nativeVersion = getAppVersion();
        const result = await checkReleaseUpdates(appVersion, nativeVersion?.versionCode ?? 0, Platform.OS === 'android' ? getDeviceApiLevel() : 0, undefined, requestedChannel);
        if (!mounted.current) return;
        if (!result.firmwareError) saved.current.firmware = result.firmware;
        const applicationResultCurrent = requestedChannelRevision === channelRevision.current && requestedChannel === (saved.current.betaUpdates ? 'beta' : 'stable');
        if (!result.applicationError && applicationResultCurrent) {
          saved.current.application = result.application;
          setApplication(eligibleApplicationNotice(result.application, nativeVersion?.versionCode ?? 0, Platform.OS === 'android' ? getDeviceApiLevel() : 0, saved.current.betaUpdates));
        }
        if (!result.firmwareError && !result.applicationError && applicationResultCurrent) saved.current.checkedAt = Date.now();
        setError(result.firmwareError || result.applicationError ? 'Could not check releases. Check your internet connection and try again.' : null);
        persist();
        await deliver([firmwareUpdateRef.current(result.firmwareError ? saved.current.firmware : result.firmware), result.applicationError || !applicationResultCurrent ? null : result.application].filter((n): n is ReleaseNotice => n != null));
      } catch {
        if (mounted.current) setError('Could not check releases. Check your internet connection and try again.');
      } finally {
        inFlight.current = null;
        if (mounted.current) setChecking(false);
      }
    })();
    inFlight.current = request;
    return request;
  }, [appVersion, deliver, persist, ready]);

  return check;
}

function useReleaseLifecycle(
  state: ReleaseState, playerVersion: string | null | undefined,
  check: ReturnType<typeof useReleaseCheck>, { deliver }: ReleaseStorage,
) {
  const { mounted, saved, lastAttempt, setApplication, setAppVersion, setReady, ready, firmwareUpdateRef } = state;
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    Promise.all([AsyncStorage.getItem(STORAGE_KEY), Promise.resolve(getAppVersion())]).then(([stored, info]) => {
      if (cancelled) return;
      saved.current = parseSavedUpdates(stored);
      lastAttempt.current = saved.current.attemptedAt;
      setApplication(eligibleApplicationNotice(saved.current.application, info?.versionCode ?? 0, Platform.OS === 'android' ? getDeviceApiLevel() : 0, saved.current.betaUpdates));
      if (info?.version) setAppVersion(info.version);
      setReady(true);
    }).catch(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const foregroundCheck = () => {
      if (AppState.currentState !== 'active') return;
      const installed = getAppVersion();
      setApplication(eligibleApplicationNotice(saved.current.application, installed?.versionCode ?? 0, Platform.OS === 'android' ? getDeviceApiLevel() : 0, saved.current.betaUpdates));
      if (Date.now() - saved.current.checkedAt >= CHECK_INTERVAL && Date.now() - lastAttempt.current >= RETRY_INTERVAL) void check();
      else {
        const update = firmwareUpdateRef.current(saved.current.firmware);
        if (update) void deliver([update]);
      }
    };
    foregroundCheck();
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') foregroundCheck(); });
    return () => { listener.remove(); };
  }, [check, deliver, ready]);

  // A player connecting (or reporting a new version) can make the cached release newly relevant.
  useEffect(() => {
    if (!ready || AppState.currentState !== 'active') return;
    const update = firmwareUpdateRef.current(saved.current.firmware);
    if (update) void deliver([update]);
  }, [deliver, playerVersion, ready]);

}

function useReleaseControls(state: ReleaseState, check: ReturnType<typeof useReleaseCheck>, { persist, deliver }: ReleaseStorage) {
  const { tRef, saved, firmwareUpdateRef, channelRevision, setApplication, inFlight } = state;
  const setAlerts = useCallback(async (enabled: boolean) => {
    try {
    if (enabled) {
      if (Platform.OS !== 'android') return;
      if (Number(Platform.Version) >= 33) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (!(await notificationsEnabled())) {
        Alert.alert(tRef.current('Notifications are off'), tRef.current('Allow notifications for Compás in Android Settings. Release notices will still appear in the app.'));
        return;
      }
    }
    saved.current.alerts = enabled;
    persist();
    const update = enabled ? firmwareUpdateRef.current(saved.current.firmware) : null;
    if (update) await deliver([update]);
    } catch { Alert.alert(tRef.current('Could not enable notifications'), tRef.current('Release notices will still appear inside Compás.')); }
  }, [deliver, persist]);
  const setBetaUpdates = useCallback(async (enabled: boolean) => {
    if (saved.current.betaUpdates === enabled) return;
    channelRevision.current += 1;
    saved.current.betaUpdates = enabled;
    setApplication(null);
    persist();
    if (inFlight.current) await inFlight.current;
    await check();
  }, [check, persist]);
  const acknowledge = useCallback((notices: ReleaseNotice[]) => {
    saved.current.seen = [...new Set([...saved.current.seen, ...notices.map(noticeKey)])].slice(-20);
    persist();
  }, [persist]);
  const openRelease = useCallback(async (notice: ReleaseNotice) => {
    const repo = notice.kind === 'firmware' ? 'compas-player' : 'compas-app';
    const tag = notice.kind === 'firmware' ? notice.version : `v${notice.version}`;
    if (notice.releaseUrl !== `https://github.com/Starnished66/${repo}/releases/tag/${encodeURIComponent(tag)}`) return;
    try { await Linking.openURL(notice.releaseUrl); }
    catch { Alert.alert(tRef.current('Could not open release'), tRef.current('Try again when a browser and internet connection are available.')); }
  }, []);
  return { setAlerts, setBetaUpdates, acknowledge, openRelease };
}

function currentEligibleApplication(saved: ReleaseState['saved']): ReleaseNotice | null {
  const installed = getAppVersion();
  return eligibleApplicationNotice(
    saved.current.application,
    installed?.versionCode ?? 0,
    Platform.OS === 'android' ? getDeviceApiLevel() : 0,
    saved.current.betaUpdates,
  );
}

function useReleaseInstallation(state: ReleaseState, check: ReturnType<typeof useReleaseCheck>) {
  const { application, saved, setApplication, setInstalling, setInstallError, setInstallPermission,
    setPermissionRetry, ready, permissionRetry, installInFlight, mounted } = state;

  const installNotice = useCallback(async (target: ReleaseNotice | null): Promise<'started' | 'permission' | 'error' | 'skipped'> => {
    if (Platform.OS !== 'android' || installInFlight.current || !target?.sha256 || target.versionCode == null || target.size == null) {
      return 'skipped';
    }
    installInFlight.current = true;
    setInstalling(true);
    setInstallError(null);
    try {
      await installAppUpdate(
        `https://github.com/Starnished66/compas-app/releases/download/v${target.version}/compas-${target.version}.apk`,
        target.sha256, target.versionCode, target.size,
      );
      if (mounted.current) setInstallPermission(canInstallAppUpdates());
      return 'started';
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const code = cause && typeof cause === 'object' && 'code' in cause ? String((cause as { code?: unknown }).code) : '';
      if (message.includes('ERR_INSTALL_PERMISSION') || code === 'ERR_INSTALL_PERMISSION') {
        if (mounted.current) {
          setInstallPermission(false);
          setInstallError('Allow Compás to install unknown apps, then try again.');
        }
        return 'permission';
      }
      if (mounted.current) setInstallError('Could not download or verify the update. Check your connection and try again.');
      return 'error';
    } finally {
      installInFlight.current = false;
      if (mounted.current) setInstalling(false);
    }
  }, [installInFlight, mounted, setInstallError, setInstallPermission, setInstalling]);

  const installApplicationUpdate = useCallback(async () => {
    await installNotice(application);
  }, [application, installNotice]);

  const requestInstallPermission = useCallback(() => {
    try { openAppUpdatePermissionSettings(); setPermissionRetry(true); }
    catch { setInstallError('Could not open Android install settings.'); }
  }, [setInstallError, setPermissionRetry]);

  // Notification taps only pass a boolean flag; always install from the verified manifest notice.
  const handleNotificationInstall = useCallback(async () => {
    if (Platform.OS !== 'android' || !ready) return;
    if (!consumePendingAppUpdateInstall()) return;
    let target = currentEligibleApplication(saved);
    if (!target) {
      await check();
      if (!mounted.current) return;
      target = currentEligibleApplication(saved);
    }
    if (!target) return;
    setApplication(target);
    const outcome = await installNotice(target);
    if (outcome === 'permission' && mounted.current) {
      requestInstallPermission();
    }
  }, [check, installNotice, mounted, ready, requestInstallPermission, saved, setApplication]);

  useEffect(() => { setInstallPermission(Platform.OS === 'android' && canInstallAppUpdates()); }, [ready, setInstallPermission]);
  useEffect(() => {
    if (!permissionRetry) return;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && canInstallAppUpdates()) {
        setPermissionRetry(false);
        setInstallPermission(true);
        void installApplicationUpdate();
      }
    });
    return () => sub.remove();
  }, [permissionRetry, installApplicationUpdate, setInstallPermission, setPermissionRetry]);
  useEffect(() => {
    if (Platform.OS !== 'android' || !ready) return;
    if (AppState.currentState === 'active') void handleNotificationInstall();
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void handleNotificationInstall();
    });
    const intentSub = addAppUpdateInstallListener(() => {
      void handleNotificationInstall();
    });
    return () => {
      appStateSub.remove();
      intentSub?.remove();
    };
  }, [handleNotificationInstall, ready]);
  return { installApplicationUpdate, requestInstallPermission };
}

/**
 * `playerVersion` is the connected player's reported version. The latest firmware release is always
 * listed, but it is announced (snackbar, Android notification) only when that version is known and older.
 */
export function UpdatesProvider({ playerVersion, children }: { playerVersion?: string | null; children: React.ReactNode }) {
  const state = useReleaseState(playerVersion);
  const storage = useReleaseStorage(state);
  const check = useReleaseCheck(state, storage);
  useReleaseLifecycle(state, playerVersion, check, storage);
  const { setAlerts, setBetaUpdates, acknowledge, openRelease } = useReleaseControls(state, check, storage);
  const { installApplicationUpdate, requestInstallPermission } = useReleaseInstallation(state, check);
  const { saved, firmwareUpdate, application, appVersion, revision, checking, installError, error, installing,
    installPermission, ready } = state;
  const notices = [firmwareUpdate(saved.current.firmware), application].filter((n): n is ReleaseNotice => n != null);
  void revision;
  return <UpdatesContext.Provider value={{ firmware: saved.current.firmware, application, appVersion, checking, checkedAt: saved.current.checkedAt,
    error: installError ?? error, alerts: saved.current.alerts, installing, installPermission, android: Platform.OS === 'android', betaUpdates: saved.current.betaUpdates, unseen: ready ? notices.filter((n) => !saved.current.seen.includes(noticeKey(n))) : [],
    check, setAlerts, setBetaUpdates, acknowledge, openRelease, installApplicationUpdate, requestInstallPermission }}>{children}</UpdatesContext.Provider>;
}

export function useUpdates(): UpdatesState {
  const value = useContext(UpdatesContext);
  if (!value) throw new Error('UpdatesProvider is missing');
  return value;
}
