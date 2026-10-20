import { CollectionJob } from '../data/types';

export function collectionJobSettled(id: number, startedAt: number, job: CollectionJob | null | undefined, now: number): boolean {
  // A newer job means this one ended before the next poll. A restart or a
  // missing response must not leave the app's controls locked indefinitely.
  return !!job && (job.id !== id || job.state !== 'pending') || now - startedAt > 120000;
}
