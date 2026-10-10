export function formatPlaybackTime(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`;
  return `${minutes}:${seconds}`;
}

export function formatRemainingTime(positionMs: number, durationMs: number): string {
  return `-${formatPlaybackTime(Math.max(0, durationMs - positionMs))}`;
}

export function playbackFraction(positionMs: number, durationMs: number): number {
  return durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
}
