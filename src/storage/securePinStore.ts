/**
 * Secure storage for Compás player PINs.
 * Uses expo-secure-store on device with an in-memory/fallback mechanism for testing/environments.
 */

let SecureStore: typeof import('expo-secure-store') | null = null;
try {
  SecureStore = require('expo-secure-store');
} catch {
  // Not linked in current runtime (e.g. Node tests)
}

export class SecurePinStore {
  private fallbackStore = new Map<string, string>();

  private storageKey(playerId: string): string {
    const cleanId = playerId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `compas_pin_${cleanId}`;
  }

  async get(playerId: string): Promise<string | null> {
    if (!playerId) return null;
    const key = this.storageKey(playerId);
    if (SecureStore && typeof SecureStore.getItemAsync === 'function') {
      try {
        const val = await SecureStore.getItemAsync(key);
        if (val && /^[0-9]{4,12}$/.test(val)) {
          return val;
        }
      } catch {
        // Fallback
      }
    }
    const fallback = this.fallbackStore.get(key) || null;
    return fallback && /^[0-9]{4,12}$/.test(fallback) ? fallback : null;
  }

  /** Resolves true when the PIN reached SecureStore, false when it only lives in memory until the app closes. */
  async put(playerId: string, pin: string): Promise<boolean> {
    if (!playerId) throw new Error('Player ID must not be empty');
    if (!/^[0-9]{4,12}$/.test(pin)) {
      throw new Error('PIN must contain 4 to 12 digits');
    }
    const key = this.storageKey(playerId);
    if (SecureStore && typeof SecureStore.setItemAsync === 'function') {
      try {
        await SecureStore.setItemAsync(key, pin);
        return true;
      } catch {
        // Fallback
      }
    }
    this.fallbackStore.set(key, pin);
    return false;
  }

  async remove(playerId: string): Promise<void> {
    if (!playerId) return;
    const key = this.storageKey(playerId);
    if (SecureStore && typeof SecureStore.deleteItemAsync === 'function') {
      try {
        await SecureStore.deleteItemAsync(key);
      } catch {
        // Fallback
      }
    }
    this.fallbackStore.delete(key);
  }
}
