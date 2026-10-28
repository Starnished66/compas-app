import * as SecureStore from 'expo-secure-store';

/** Shown when a PIN worked but could not be kept, so the user knows the player will ask again. */
export const PIN_NOT_SAVED_MESSAGE = 'The PIN could not be saved on this phone. You will be asked for it again.';

export class SecurePinStore {
  private memoryStore = new Map<string, string>();

  private storageKey(playerId: string): string {
    // Generate a valid key for SecureStore (alphanumeric and ., -, _)
    // Convert playerId to a safe identifier
    const sanitized = playerId.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `compas_pin_${sanitized}`;
  }

  async get(playerId: string): Promise<string | null> {
    try {
      const key = this.storageKey(playerId);
      const val = await SecureStore.getItemAsync(key);
      if (val && /^[0-9]{4,12}$/.test(val)) {
        return val;
      }
      return this.memoryStore.get(playerId) || null;
    } catch {
      return this.memoryStore.get(playerId) || null;
    }
  }

  /** Resolves true when the PIN reached SecureStore, false when it only lives in memory until the app closes. */
  async put(playerId: string, pin: string): Promise<boolean> {
    if (!/^[0-9]{4,12}$/.test(pin)) {
      throw new Error('PIN must contain 4 to 12 digits');
    }
    this.memoryStore.set(playerId, pin);
    try {
      const key = this.storageKey(playerId);
      await SecureStore.setItemAsync(key, pin);
      return true;
    } catch {
      return false;
    }
  }

  async remove(playerId: string): Promise<void> {
    this.memoryStore.delete(playerId);
    try {
      const key = this.storageKey(playerId);
      await SecureStore.deleteItemAsync(key);
    } catch {
      // ignore
    }
  }
}
