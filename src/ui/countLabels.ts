type Translate = (source: string, variables?: Record<string, string | number>) => string;

export function songCount(count: number): string {
  return `${count} ${count === 1 ? 'song' : 'songs'}`;
}

/** Localize known count-only UI labels while leaving any trailing user name untouched. */
export function localizedCountLabel(label: string | null | undefined, t: Translate): string {
  if (label == null) return '';
  const source = label;
  if (!source.trim()) return source;

  const shown = source.match(/^Showing (\d+) of (\d+) tracks$/);
  if (shown) return t('Showing {shown} of {total} tracks', { shown: Number(shown[1]), total: Number(shown[2]) });

  const albumTracks = source.match(/^(\d+) albums · (\d+) tracks$/);
  if (albumTracks) return t('{albums} albums · {tracks} tracks', { albums: Number(albumTracks[1]), tracks: Number(albumTracks[2]) });

  const groupsTracks = source.match(/^(\d+) groups · (\d+) tracks$/);
  if (groupsTracks) return t('{groups} groups · {tracks} tracks', { groups: Number(groupsTracks[1]), tracks: Number(groupsTracks[2]) });

  const countAndSuffix = source.match(/^(\d+) (tracks|songs|albums|artists|album artists|genres|items|folders|playlists|favorites|recently played tracks|recently played songs|songs?)$/);
  if (countAndSuffix) {
    const count = Number(countAndSuffix[1]);
    const suffix = countAndSuffix[2];
    const sourceTemplate = suffix === 'recently played tracks' || suffix === 'recently played songs' ? '{count} recently played tracks' : `{count} ${suffix}`;
    return t(sourceTemplate, { count });
  }

  // Playlist names and other user supplied text after this separator stay verbatim.
  const withTrailingName = source.match(/^(\d+) (tracks|songs|items) · (.+)$/);
  if (withTrailingName) {
    const count = Number(withTrailingName[1]);
    return `${t(`{count} ${withTrailingName[2]}`, { count })} · ${withTrailingName[3]}`;
  }
  return source;
}
