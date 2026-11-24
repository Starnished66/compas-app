import type { RemoteTrack } from '../data/types';

export const QUEUE_REFRESHING_MESSAGE = 'The queue changed. It is being refreshed.';

export const EMPTY_QUEUE_STATE = {
  queue: [] as RemoteTrack[],
  queuePlayed: [] as RemoteTrack[],
  queuePlayedHasMore: false,
  queuePlayedLoadingMore: false,
  queueTotal: 0,
  queueHasMore: false,
  queueLoadingMore: false,
};

export interface QueueTarget {
  offset: number;
  revision: number;
  songIndex: number;
  full?: boolean;
}
