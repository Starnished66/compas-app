import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { canInstallAppUpdates, getAppVersion, getDeviceApiLevel, installAppUpdate, notificationsEnabled, notifyRelease, openAppUpdatePermissionSettings } from '../../modules/compas-updates/src';
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

/**
 * `playerVersion` is the connected player's reported version. The latest firmware release is always
 * listed, but it is announced (snackbar, Android notification) only when that version is known and older.
 */
export function UpdatesProvider({ playerVersion, children }: { playerVersion?: string | null; children: React.ReactNode }) {
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
  const deliveryInFlight = useRef(false);
  const channelRevision = useRef(0);
  const lastAttempt = useRef(0);
  const mounted = useRef(true);
  const writes = useRef(Promise.resolve());
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
  const installApplicationUpdate = useCallback(async () => {
    if (Platform.OS !== 'android' || !application?.sha256 || application.versionCode == null || application.size == null) return;
    setInstalling(true);
    setInstallError(null);
    try {
      await installAppUpdate(
        `https://github.com/Starnished66/compas-app/releases/download/v${application.version}/compas-${application.version}.apk`,
        application.sha256, application.versionCode, application.size,
      );
      setInstallPermission(canInstallAppUpdates());
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const code = cause && typeof cause === 'object' && 'code' in cause ? String((cause as { code?: unknown }).code) : '';
      if (message.includes('ERR_INSTALL_PERMISSION') || code === 'ERR_INSTALL_PERMISSION') {
        setInstallPermission(false);
        setInstallError('Allow Compás to install unknown apps, then try again.');
      } else setInstallError('Could not download or verify the update. Check your connection and try again.');
    } finally { setInstalling(false); }
  }, [application]);
  const requestInstallPermission = useCallback(() => {
    try { openAppUpdatePermissionSettings(); setPermissionRetry(true); }
    catch { setInstallError('Could not open Android install settings.'); }
  }, []);
  useEffect(() => { setInstallPermission(Platform.OS === 'android' && canInstallAppUpdates()); }, [ready]);
  useEffect(() => {
    if (!permissionRetry) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && canInstallAppUpdates()) {
        setPermissionRetry(false);
        setInstallPermission(true);
        void installApplicationUpdate();
      }
    });
    return () => sub.remove();
  }, [permissionRetry, installApplicationUpdate]);
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
