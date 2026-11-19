export const LIBRARY_SORT_SECTIONS = {
  albums: { key: 'albums', title: 'Album sort', slots: [3, 9] },
  artists: { key: 'artists', title: 'Artist albums', slots: [3] },
  album_artists: { key: 'albumArtists', title: 'Album artist albums', slots: [3] },
} as const;

export type LibrarySortScope = keyof typeof LIBRARY_SORT_SECTIONS;
export const LIBRARY_SORT_SCOPES = Object.keys(LIBRARY_SORT_SECTIONS) as LibrarySortScope[];

interface SortMode {
  label: string;
  albumOnly?: boolean;
  minReplySlots?: number;
  forwardOnly?: boolean;
}

// Base values on the wire. Reverse is a separate flag.
export const LIBRARY_SORT_MODES = {
  0: { label: 'Name (A–Z)' },
  1: { label: 'Recently Added' },
  2: { label: 'Release Year (oldest first)' },
  // v1.5.1 can report mode 3 set on the player without advertising its slot.
  3: { label: 'Album Artist, then Year', albumOnly: true },
  8: { label: 'Rating', albumOnly: true, minReplySlots: 9, forwardOnly: true },
} satisfies Record<number, SortMode>;

export type LibrarySortMode = keyof typeof LIBRARY_SORT_MODES;
const sortModes: Record<LibrarySortMode, SortMode> = LIBRARY_SORT_MODES;
const modeIds = Object.keys(sortModes).map(Number) as LibrarySortMode[];

export function isLibrarySortScope(scope: string): scope is LibrarySortScope {
  return LIBRARY_SORT_SCOPES.some((candidate) => candidate === scope);
}

export function isLibrarySortMode(scope: LibrarySortScope, mode: unknown, replySlots?: number): mode is LibrarySortMode {
  return modeIds.some((id) => {
    const { albumOnly, minReplySlots } = sortModes[id];
    return mode === id && (!albumOnly || scope === 'albums') &&
      (replySlots === undefined || replySlots >= (minReplySlots ?? 0));
  });
}

export function librarySortOptions(scope: LibrarySortScope, available: readonly boolean[]) {
  return modeIds.flatMap((mode) => {
    const slot = available[mode];
    return slot === undefined || !isLibrarySortMode(scope, mode)
      ? []
      : [{ mode, label: sortModes[mode].label, available: slot }];
  });
}

export function expectedLibrarySortReverse(mode: LibrarySortMode, reverse?: boolean): boolean {
  return !sortModes[mode].forwardOnly && reverse === true;
}
