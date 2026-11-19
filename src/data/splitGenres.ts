export function splitGenres(raw: string): string[] {
  if (!raw) return [];

  const parts: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[;,/]/)) {
    // The player trims ASCII control characters and spaces, then folds ASCII case.
    const name = part.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, '');
    if (!name) continue;
    const key = name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(name);
  }
  return parts.length ? parts : [raw];
}
