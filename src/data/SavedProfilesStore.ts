import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConnectionTransport } from './remoteUiState';

export const PREF_SAVED_PROFILES = 'compas_saved_profiles_v1';
const MAX_SAVED_PROFILES = 10;

export interface SavedPlayerProfile {
  id: string;
  name: string;
  transport: ConnectionTransport;
  /** Wi-Fi host/address or Bluetooth device id. */
  endpoint: string;
  deviceModel?: string | null;
  lastConnectedAt: number;
}

export function profileIdFor(transport: ConnectionTransport, endpoint: string): string {
  const normalized = endpoint.trim();
  return transport === ConnectionTransport.Wifi ? `wifi:${normalized}` : `bt:${normalized}`;
}

export function pinKeyForProfile(profile: Pick<SavedPlayerProfile, 'transport' | 'endpoint'>): string {
  return profile.transport === ConnectionTransport.Wifi ? profile.endpoint : `bt:${profile.endpoint}`;
}

export function upsertSavedProfile(
  profiles: readonly SavedPlayerProfile[],
  profile: SavedPlayerProfile,
  limit = MAX_SAVED_PROFILES,
): SavedPlayerProfile[] {
  const filtered = profiles.filter((item) => item.id !== profile.id);
  return [profile, ...filtered]
    .sort((a, b) => b.lastConnectedAt - a.lastConnectedAt)
    .slice(0, limit);
}

export function removeSavedProfile(
  profiles: readonly SavedPlayerProfile[],
  id: string,
): SavedPlayerProfile[] {
  return profiles.filter((item) => item.id !== id);
}

export function parseSavedProfiles(raw: string | null): SavedPlayerProfile[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedPlayerProfile =>
        item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        (item.transport === ConnectionTransport.Wifi || item.transport === ConnectionTransport.Bluetooth) &&
        typeof item.endpoint === 'string' &&
        item.endpoint.trim().length > 0 &&
        typeof item.lastConnectedAt === 'number',
      )
      .slice(0, MAX_SAVED_PROFILES);
  } catch {
    return [];
  }
}

export async function loadSavedProfiles(): Promise<SavedPlayerProfile[]> {
  try {
    return parseSavedProfiles(await AsyncStorage.getItem(PREF_SAVED_PROFILES));
  } catch {
    return [];
  }
}

export async function persistSavedProfiles(profiles: readonly SavedPlayerProfile[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PREF_SAVED_PROFILES, JSON.stringify(profiles.slice(0, MAX_SAVED_PROFILES)));
  } catch {
    // ignore storage failures
  }
}
