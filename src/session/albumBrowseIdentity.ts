export interface AlbumBrowseIdentity {
  name: string;
  albumArtist: string;
  representativeId?: number;
}

/** Empty album-artist filters are ignored by the legacy library endpoint. */
export async function exactAlbumBrowseKey(
  identity: AlbumBrowseIdentity | undefined,
  artist: string | null | undefined,
  albumKey: string | null,
  hasCatalog: boolean,
  keyForSong: (id: number) => Promise<string | null>,
  translate: (source: string) => string = (source) => source,
): Promise<string | null> {
  if (!identity || identity.albumArtist !== '' || artist != null) return albumKey;
  const unavailable = () => new Error(translate('Sync the player library before browsing this album.'));
  if (!hasCatalog) throw unavailable();
  if (albumKey) return albumKey;
  const id = identity.representativeId;
  if (id == null || !Number.isSafeInteger(id) || id < 1) throw unavailable();
  const resolved = await keyForSong(id);
  if (!resolved) throw unavailable();
  return resolved;
}
