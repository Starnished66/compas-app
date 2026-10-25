jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: async () => '' }));
jest.mock('expo-file-system/legacy', () => require('./memoryFileSystem').createMemoryFileSystem());

import * as FileSystem from 'expo-file-system/legacy';
import { SyncedCoverStore } from '../SyncedCoverStore';
import type { MemoryFileSystem } from './memoryFileSystem';

const fs = FileSystem as unknown as MemoryFileSystem;
const ROOT = 'file:///docs/covers';

beforeEach(() => fs.__reset());

describe('SyncedCoverStore', () => {
  it('prunes cover files that left the manifest and stale temporaries', async () => {
    const store = new SyncedCoverStore(ROOT);
    await expect(store.put('lib', 'keep', 'AAAA')).resolves.toBe(true);
    await expect(store.put('lib', 'old', 'AAAA')).resolves.toBe(true);
    const libDir = `${ROOT}/${SyncedCoverStore.digest('lib')}`;
    fs.__files.set(`${libDir}/.123.abc.tmp`, { data: 'x', mtime: 0 });

    await expect(store.pruneLibrary('lib', ['keep'])).resolves.toBe(2);
    expect(Array.from(fs.__files.keys())).toEqual([store.fileFor('lib', 'keep')]);
  });

  it('purges the directories of libraries that are no longer retained', async () => {
    const store = new SyncedCoverStore(ROOT);
    await store.put('a', 'k', 'AAAA');
    await store.put('b', 'k', 'AAAA');
    await store.put('c', 'k', 'AAAA');

    await expect(store.purgeLibrariesExcept(['a', 'c'])).resolves.toBe(1);
    expect(Array.from(fs.__files.keys()).sort()).toEqual([store.fileFor('a', 'k'), store.fileFor('c', 'k')].sort());
  });

  it('reports a failed disk write and keeps only a bounded memory fallback', async () => {
    const store = new SyncedCoverStore(ROOT);
    fs.__failWrites.value = true;
    await expect(store.put('lib', 'k0', 'AAAA')).resolves.toBe(false);
    await expect(store.contains('lib', 'k0')).resolves.toBe(false);
    await expect(store.getUri('lib', 'k0')).resolves.toBe('data:image/jpeg;base64,AAAA');

    for (let i = 1; i <= 100; i++) await store.put('lib', `k${i}`, 'AAAA');
    await expect(store.get('lib', 'k0')).resolves.toBeNull();
    await expect(store.get('lib', 'k100')).resolves.toBe('AAAA');
    expect(fs.__files.size).toBe(0);
  });
});
