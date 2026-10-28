const mockSecureStore = {
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
};
jest.mock('expo-secure-store', () => mockSecureStore);

import { SecurePinStore as DataStore } from '../SecurePinStore';
import { SecurePinStore as StorageStore } from '../../storage/securePinStore';

const FAKE_PIN = '000000';

describe.each([
  ['src/data', DataStore],
  ['src/storage', StorageStore],
])('%s SecurePinStore.put', (_name, Store) => {
  beforeEach(() => {
    mockSecureStore.setItemAsync.mockReset();
    mockSecureStore.getItemAsync.mockReset().mockResolvedValue(null);
  });

  it('reports true when the PIN reached SecureStore', async () => {
    mockSecureStore.setItemAsync.mockResolvedValue(undefined);
    await expect(new Store().put('player', FAKE_PIN)).resolves.toBe(true);
  });

  it('reports false when SecureStore fails, yet keeps the PIN for this session', async () => {
    mockSecureStore.setItemAsync.mockRejectedValue(new Error('keystore unavailable'));
    const store = new Store();
    await expect(store.put('player', FAKE_PIN)).resolves.toBe(false);
    await expect(store.get('player')).resolves.toBe(FAKE_PIN);
  });
});
