export const PLAYLIST_NAME_MAX_BYTES = 127;

const RESERVED_NAMES = ['favorites', 'most played'];

export function playlistNameBytes(name: string): number {
  return new TextEncoder().encode(name).length;
}

export function playlistNameIssue(name: string, takenNames: readonly string[] = []): string | null {
  if (!name) return null;
  const lowered = name.trim().toLowerCase();
  if (playlistNameBytes(name) > PLAYLIST_NAME_MAX_BYTES) return 'Too long for the player. Shorten it a little.';
  if (/^[.@]/.test(name)) return 'Can’t start with . or @';
  if (/[\x00-\x1f\x7f]/.test(name)) return 'Can’t use line breaks or control characters';
  if (/[/\\:*?"<>|]/.test(name)) return 'Can’t use / \\ : * ? " < > |';
  if (name.includes('..')) return 'Can’t contain two dots in a row';
  if (/\.m3u8?$/i.test(name)) return 'Leave off the .m3u extension';
  if (/[ .]$/.test(name)) return 'Can’t end with a space or a dot';
  if (RESERVED_NAMES.includes(name.toLowerCase())) return 'That name is used by the player';
  if (takenNames.some((taken) => taken.trim().toLowerCase() === lowered)) {
    return 'You already have a playlist with this name';
  }
  return null;
}

export function playlistDisplayName(name: string): string {
  return name.replace(/\.m3u8?$/i, '');
}
