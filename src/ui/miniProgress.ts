import { PlaybackMode } from '../data/types';

export type MiniProgressPreference = 'auto' | 'bar' | 'ring' | 'card';
export type MiniProgressStyle = Exclude<MiniProgressPreference, 'auto'>;

export const MINI_PROGRESS_PREFERENCES: ReadonlyArray<MiniProgressPreference> = ['auto', 'bar', 'ring', 'card'];

export const MINI_PROGRESS_LABELS: Record<MiniProgressPreference, string> = {
  auto: 'Auto',
  bar: 'Bar',
  ring: 'Ring',
  card: 'Card',
};

export const MINI_PROGRESS_HINTS: Record<MiniProgressPreference, string> = {
  auto: 'A bar, or a comet ring around the play button while repeating one song.',
  bar: 'A thin bar under the mini player.',
  ring: 'A comet ring around the play button.',
  card: 'A comet that travels around the mini player.',
};

export function isMiniProgressPreference(value: unknown): value is MiniProgressPreference {
  return typeof value === 'string' && (MINI_PROGRESS_PREFERENCES as ReadonlyArray<string>).includes(value);
}

export function resolveMiniProgressStyle(preference: MiniProgressPreference, playbackMode: PlaybackMode): MiniProgressStyle {
  if (preference !== 'auto') return preference;
  return playbackMode === PlaybackMode.RepeatOne ? 'ring' : 'bar';
}
