export interface LibrarySyncProgress {
  title: string;
  detail: string;
  progress: number | null;
  paused: boolean;
}

const COUNT_PATTERN = /(\d+)\/(\d+)\s*$/;

function countsOf(message: string): { done: number; total: number } | null {
  const match = COUNT_PATTERN.exec(message);
  if (!match) return null;
  return { done: Number(match[1]), total: Number(match[2]) };
}

export function describeLibrarySync(message: string): LibrarySyncProgress {
  const counts = countsOf(message);
  const progress = counts && counts.total > 0 ? counts.done / counts.total : null;
  const lower = message.toLowerCase();
  if (lower.startsWith('waiting')) {
    return { title: 'Library sync paused', detail: message, progress: null, paused: true };
  }
  if (lower.startsWith('syncing songs')) {
    return {
      title: 'Copying your library…',
      detail: counts
        ? `${counts.done} of ${counts.total} songs · you can browse while this runs`
        : 'You can browse while this runs',
      progress,
      paused: false,
    };
  }
  if (lower.includes('cover')) {
    return {
      title: 'Copying album covers…',
      detail: counts ? `${counts.done} of ${counts.total} covers` : 'You can browse while this runs',
      progress,
      paused: false,
    };
  }
  return { title: `${message}…`, detail: 'You can browse while this runs', progress, paused: false };
}

export function syncedSongTotal(message: string | null | undefined): number | null {
  if (!message || !message.toLowerCase().startsWith('syncing songs')) return null;
  return countsOf(message)?.total ?? null;
}

export function upToDateLabel(songCount: number | null): string {
  if (songCount == null) return 'Library up to date';
  return `Library up to date · ${songCount} ${songCount === 1 ? 'song' : 'songs'}`;
}
