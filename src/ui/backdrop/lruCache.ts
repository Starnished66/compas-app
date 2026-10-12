export interface LruCache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  delete(key: K): void;
}

export function createLruCache<K, V>(capacity: number): LruCache<K, V> {
  const entries = new Map<K, V>();
  return {
    get(key) {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key)!;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      if (entries.size > capacity) entries.delete(entries.keys().next().value!);
    },
    delete(key) {
      entries.delete(key);
    },
  };
}
