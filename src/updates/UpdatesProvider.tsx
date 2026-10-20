import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAppVersion, notificationsEnabled, notifyRelease } from '../../modules/compas-updates/src';
import { checkReleaseUpdates, ReleaseNotice } from './releaseUpdates';
import { emptySaved, noticeKey, parseSavedUpdates } from './updatePreferences';
import appConfig from '../../app.json';

const STORAGE_KEY = 'compas.releaseUpdates.v1';
const CHECK_INTERVAL = 6 * 60 * 60 * 1000;
const RETRY_INTERVAL = 15 * 60 * 1000;

interface UpdatesState {
  firmware: ReleaseNotice | null;
  application: ReleaseNotice | null;
  appVersion: string;
  checking: boolean;
  checkedAt: number;
  error: string | null;
  alerts: boolean;
  unseen: ReleaseNotice[];
  check(): Promise<void>;
  setAlerts(enabled: boolean): Promise<void>;
  acknowledge(notices: ReleaseNotice[]): void;
  openRelease(notice: ReleaseNotice): Promise<void>;
}
const UpdatesContext = createContext<UpdatesState | null>(null);

export function UpdatesProvider({ children }: { children: React.ReactNode }) {
  const saved = useRef(emptySaved());
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState(appConfig.expo.version);
  const [application, setApplication] = useState<ReleaseNotice | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const deliveryInFlight = useRef(false);
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
    setChecking(true);
    setError(null);
    const request = (async () => {
      try {
        const result = await checkReleaseUpdates(appVersion);
        if (!mounted.current) return;
        saved.current.firmware = result.firmware;
        saved.current.checkedAt = Date.now();
        setApplication(result.application);
        persist();
        await deliver([result.firmware, result.application].filter((n): n is ReleaseNotice => n != null));
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
      if (info?.version) setAppVersion(info.version);
      setReady(true);
    }).catch(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const foregroundCheck = () => {
      if (AppState.currentState !== 'active') return;
      if (Date.now() - saved.current.checkedAt >= CHECK_INTERVAL && Date.now() - lastAttempt.current >= RETRY_INTERVAL) void check();
      else if (saved.current.firmware) void deliver([saved.current.firmware]);
    };
    foregroundCheck();
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') foregroundCheck(); });
    const timer = setInterval(foregroundCheck, 60_000);
    return () => { listener.remove(); clearInterval(timer); };
  }, [check, deliver, ready]);

  const setAlerts = useCallback(async (enabled: boolean) => {
    try {
    if (enabled) {
      if (Platform.OS !== 'android') return;
      if (Number(Platform.Version) >= 33) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
      if (!(await notificationsEnabled())) {
        Alert.alert('Notifications are off', 'Allow notifications for Compás in Android Settings. Release notices will still appear in the app.');
        return;
      }
    }
    saved.current.alerts = enabled;
    persist();
    if (enabled && saved.current.firmware) await deliver([saved.current.firmware]);
    } catch { Alert.alert('Could not enable notifications', 'Release notices will still appear inside Compás.'); }
  }, [deliver, persist]);
  const acknowledge = useCallback((notices: ReleaseNotice[]) => {
    saved.current.seen = [...new Set([...saved.current.seen, ...notices.map(noticeKey)])].slice(-20);
    persist();
  }, [persist]);
  const openRelease = useCallback(async (notice: ReleaseNotice) => {
    const repo = notice.kind === 'firmware' ? 'compas-player' : 'compas-app';
    if (notice.releaseUrl !== `https://github.com/Starnished66/${repo}/releases/tag/${encodeURIComponent(notice.version)}`) return;
    try { await Linking.openURL(notice.releaseUrl); }
    catch { Alert.alert('Could not open release', 'Try again when a browser and internet connection are available.'); }
  }, []);
  const notices = [saved.current.firmware, application].filter((n): n is ReleaseNotice => n != null);
  void revision;
  return <UpdatesContext.Provider value={{ firmware: saved.current.firmware, application, appVersion, checking, checkedAt: saved.current.checkedAt,
    error, alerts: saved.current.alerts, unseen: ready ? notices.filter((n) => !saved.current.seen.includes(noticeKey(n))) : [],
    check, setAlerts, acknowledge, openRelease }}>{children}</UpdatesContext.Provider>;
}

export function useUpdates(): UpdatesState {
  const value = useContext(UpdatesContext);
  if (!value) throw new Error('UpdatesProvider is missing');
  return value;
}
