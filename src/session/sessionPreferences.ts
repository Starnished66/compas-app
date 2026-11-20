import { RemoteTheme } from '../data/types';

export const PREF_THEME = 'compas_pref_theme';
export const THEME_PREFERENCES: Record<RemoteTheme, string> = {
  [RemoteTheme.Dark]: 'dark',
  [RemoteTheme.Light]: 'light',
  [RemoteTheme.System]: 'system',
};

export function themeFromPreference(saved: string | null): RemoteTheme {
  if (saved === 'dark') return RemoteTheme.Dark;
  if (saved === 'light') return RemoteTheme.Light;
  return RemoteTheme.System;
}
export const PREF_WIFI_ADDRESS = 'compas_pref_wifi_address';
export const PREF_BLUETOOTH_ID = 'compas_pref_bt_id';
export const PREF_LAST_TRANSPORT = 'compas_pref_last_transport';
export const PREF_AUTO_RECONNECT = 'compas_pref_auto_reconnect';
