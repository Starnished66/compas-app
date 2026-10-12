export function boundedMemo<V>(compute: (key: string) => V, limit: number): (key: string) => V {
  const cache = new Map<string, V>();
  return (key) => {
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const value = compute(key);
    if (cache.size >= limit) cache.delete(cache.keys().next().value as string);
    cache.set(key, value);
    return value;
  };
}
