export const QUEUE_REFRESHING_MESSAGE = 'The queue changed. It is being refreshed.';

export interface QueueTarget {
  offset: number;
  revision: number;
  songIndex: number;
}
