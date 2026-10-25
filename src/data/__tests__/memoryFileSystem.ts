/** In-memory stand-in for expo-file-system/legacy; flat file map keyed by URI, directories are implied. */
export function createMemoryFileSystem() {
  const files = new Map<string, { data: string; mtime: number }>();
  const calls = { readDirectory: 0, getInfo: 0 };
  const failWrites = { value: false };
  return {
    __reset() {
      files.clear();
      calls.readDirectory = 0;
      calls.getInfo = 0;
      failWrites.value = false;
    },
    __files: files,
    __calls: calls,
    __failWrites: failWrites,
    cacheDirectory: 'file:///cache/',
    documentDirectory: 'file:///docs/',
    EncodingType: { Base64: 'base64' },
    getInfoAsync: async (uri: string) => {
      calls.getInfo++;
      const file = files.get(uri);
      if (file) return { exists: true, isDirectory: false, size: file.data.length, modificationTime: file.mtime };
      const isDir = Array.from(files.keys()).some((name) => name.startsWith(`${uri}/`));
      return { exists: isDir, isDirectory: isDir };
    },
    makeDirectoryAsync: async () => {},
    readDirectoryAsync: async (uri: string) => {
      calls.readDirectory++;
      const children = Array.from(files.keys())
        .filter((name) => name.startsWith(`${uri}/`))
        .map((name) => name.substring(uri.length + 1).split('/')[0]);
      if (!children.length) throw new Error('missing directory');
      return Array.from(new Set(children));
    },
    writeAsStringAsync: async (uri: string, data: string) => {
      if (failWrites.value) throw new Error('disk full');
      files.set(uri, { data, mtime: files.size });
    },
    readAsStringAsync: async (uri: string) => {
      const file = files.get(uri);
      if (!file) throw new Error('missing');
      return file.data;
    },
    moveAsync: async ({ from, to }: { from: string; to: string }) => {
      const file = files.get(from);
      if (!file) throw new Error('missing');
      files.delete(from);
      files.set(to, file);
    },
    deleteAsync: async (uri: string) => {
      for (const name of Array.from(files.keys())) {
        if (name === uri || name.startsWith(`${uri}/`)) files.delete(name);
      }
    },
  };
}

export type MemoryFileSystem = ReturnType<typeof createMemoryFileSystem>;
