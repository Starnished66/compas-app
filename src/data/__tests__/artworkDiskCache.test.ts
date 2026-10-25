jest.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: async () => '' }));
jest.mock('expo-file-system/legacy', () => require('./memoryFileSystem').createMemoryFileSystem());

import * as FileSystem from 'expo-file-system/legacy';
import { ArtworkDiskCache } from '../ArtworkDiskCache';
import type { MemoryFileSystem } from './memoryFileSystem';

const fs = FileSystem as unknown as MemoryFileSystem;
const DIR = 'file:///cache/art';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const artNames = () => Array.from(fs.__files.keys()).filter((name) => name.endsWith('.art')).sort();
const nameFor = (key: string) => `${DIR}/${ArtworkDiskCache.hashKey(key)}.art`;

beforeEach(() => fs.__reset());

describe('ArtworkDiskCache', () => {
  it('scans the directory once and does not stat every file per write', async () => {
    const cache = new ArtworkDiskCache(DIR, 512);
    for (let i = 0; i < 20; i++) {
      await cache.put(`k${i}`, 'AAAA');
      await flush();
    }
    expect(fs.__calls.readDirectory).toBe(1);
    // One directory check per write plus the one-time scan of the first file.
    expect(fs.__calls.getInfo).toBeLessThanOrEqual(21);
    expect(artNames()).toHaveLength(20);
  });

  it('evicts the least recently used entry, counting reads as use', async () => {
    const cache = new ArtworkDiskCache(DIR, 2);
    await cache.put('a', 'AAAA');
    await flush();
    await cache.put('b', 'AAAA');
    await flush();
    await expect(cache.get('a')).resolves.toBe('AAAA');
    await cache.put('c', 'AAAA');
    await flush();
    expect(artNames()).toEqual([nameFor('a'), nameFor('c')].sort());
  });

  it('evicts by byte budget', async () => {
    const cache = new ArtworkDiskCache(DIR, 100, 5);
    await cache.put('a', 'AAAA');
    await flush();
    await cache.put('b', 'AAAA');
    await flush();
    expect(artNames()).toEqual([nameFor('b')]);
  });

  it('removes its temporary file when a write fails', async () => {
    const cache = new ArtworkDiskCache(DIR);
    fs.__failWrites.value = true;
    await cache.put('a', 'AAAA');
    expect(Array.from(fs.__files.keys())).toEqual([]);
    await expect(cache.get('a')).resolves.toBe('AAAA');
  });

  it('sweeps stale temporary files when it first indexes the directory', async () => {
    fs.__files.set(`${DIR}/old.art.tmp`, { data: 'x', mtime: 0 });
    const cache = new ArtworkDiskCache(DIR);
    await cache.put('a', 'AAAA');
    await flush();
    expect(Array.from(fs.__files.keys())).toEqual([nameFor('a')]);
  });
});
