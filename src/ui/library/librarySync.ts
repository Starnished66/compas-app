import { translate as translateEnglish } from '../../i18n/translate';

export interface LibrarySyncProgress {
  title: string;
  detail: string;
  progress: number | null;
  paused: boolean;
}

type Translate = (source: string, variables?: Record<string, string | number>) => string;

const COUNT_PATTERN = /(\d+)\/(\d+)\s*$/;

function countsOf(message: string): { done: number; total: number } | null {
  const match = COUNT_PATTERN.exec(message);
  if (!match) return null;
  return { done: Number(match[1]), total: Number(match[2]) };
}

export function describeLibrarySync(message: string, t: Translate = (source, variables) => translateEnglish(source, 'en', variables)): LibrarySyncProgress {
  const counts = countsOf(message);
  const progress = counts && counts.total > 0 ? counts.done / counts.total : null;
  const lower = message.toLowerCase();
  if (lower.startsWith('waiting')) {
    return { title: t('Library sync paused'), detail: message, progress: null, paused: true };
  }
  if (lower.startsWith('syncing songs')) {
    return {
      title: t('Copying your library…'),
      detail: counts
        ? t('{done} of {total} songs · you can browse while this runs', { done: counts.done, total: counts.total })
        : t('You can browse while this runs'),
      progress,
      paused: false,
    };
  }
  if (lower.includes('cover')) {
    return {
      title: t('Copying album covers…'),
      detail: counts ? t('{done} of {total} covers', { done: counts.done, total: counts.total }) : t('You can browse while this runs'),
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

export function upToDateLabel(songCount: number | null, t: Translate = (source, variables) => translateEnglish(source, 'en', variables)): string {
  if (songCount == null) return t('Library up to date');
  return t('Library up to date · {count} song', { count: songCount });
}
