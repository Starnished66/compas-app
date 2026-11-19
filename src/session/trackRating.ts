import { useRef } from 'react';
import type { RemoteApi } from '../data/RemoteApi';
import type { PlaybackStatus, RatingWriteResult, RemoteTrack, RemoteUiState } from '../data/types';
import { sameSong, trackKey } from '../ui/trackKey';

const RATING_TIMEOUT_MS = 15000;
const HEART_OPTIMISTIC_MS = 4000;
export const RATING_TIMEOUT_ERROR = 'No response from the player. Check whether the change was applied.';

export function ratingFromStatus(status: PlaybackStatus, stars: boolean): number {
  return stars ? status.rating ?? 0 : status.favorite ? 5 : 0;
}

export async function readSongRating(api: RemoteApi, index: number, stars: boolean): Promise<number> {
  if (stars) return (await api.ratingStates([index])).get(index) ?? 0;
  return (await api.favoriteStates([index])).get(index) ? 5 : 0;
}

interface CurrentRatingEditOptions {
  current: () => { playerSession: number | undefined; track: RemoteTrack | null; stars: boolean };
  publish: (pending?: RemoteUiState['pendingCurrentRating']) => void;
  reportTimeout: (error: string) => void;
  /** expired: the edit already ended (timed out, replaced or cancelled), so a late reply is dropped. */
  write: (rating: number, track: RemoteTrack, reportError: boolean, signal: AbortSignal,
    confirm: () => boolean, expired: () => boolean) => Promise<RatingWriteResult | undefined>;
}

interface SongEdits {
  latest: number;
  confirmed: number;
  writing: number;
  cancel?: () => void;
}

export function useCurrentRatingEdit({ current, publish, reportTimeout, write }: CurrentRatingEditOptions) {
  const active = useRef(new Map<string, SongEdits>());
  const visible = useRef<() => void>(null);

  const edit = (rating: number, expectedTrack?: RemoteTrack, onSettled?: (result: RatingWriteResult) => void) => {
    const { playerSession, track: playing, stars } = current();
    const track = expectedTrack ?? playing;
    const key = trackKey(track);
    if (playerSession == null || !track || !key || !sameSong(track, playing)) return;
    const ownsPlayer = () => current().playerSession === playerSession;
    const controller = new AbortController();
    const edits: SongEdits = active.current.get(key) ?? { latest: 0, confirmed: 0, writing: 0 };
    const order = ++edits.latest;
    let expired = false;
    const deadline = Date.now() + RATING_TIMEOUT_MS;
    const confirm = () => {
      // A write past its deadline must not overwrite newer status, even after a newer tap replaced it.
      if (Date.now() >= deadline || active.current.get(key) !== edits || order <= edits.confirmed) return false;
      edits.confirmed = order;
      return true;
    };
    const hidePending = () => {
      if (visible.current !== hidePending) return;
      visible.current = null;
      publish();
    };
    const hold = stars ? undefined : setTimeout(hidePending, HEART_OPTIMISTIC_MS);
    const cancel = () => {
      expired = true;
      controller.abort();
      clearTimeout(hold);
      clearTimeout(timeout);
    };
    const finish = (result?: RatingWriteResult) => {
      if (edits.cancel !== cancel) return;
      edits.cancel = undefined;
      cancel();
      hidePending();
      if (!result || !ownsPlayer()) return;
      if ('error' in result || sameSong(current().track, track)) onSettled?.(result);
    };
    const timeout = setTimeout(() => {
      if (sameSong(current().track, track)) {
        finish({ error: RATING_TIMEOUT_ERROR });
        if (!onSettled && ownsPlayer()) reportTimeout(RATING_TIMEOUT_ERROR);
      } else {
        // Another song is playing now: a write still queued must not reach it.
        controller.abort();
        hidePending();
      }
    }, RATING_TIMEOUT_MS);
    edits.cancel?.();
    edits.cancel = cancel;
    edits.writing++;
    active.current.set(key, edits);
    visible.current = hidePending;
    publish({ track, rating });
    void write(rating, track, !onSettled, controller.signal, confirm, () => expired).then((result) => {
      if (--edits.writing === 0 && active.current.get(key) === edits) active.current.delete(key);
      finish(result);
    });
  };

  const cancel = () => {
    for (const edits of active.current.values()) {
      edits.cancel?.();
      edits.cancel = undefined;
    }
    active.current.clear();
    // Nothing is pending any more, so the screen must not keep showing an unsent rating.
    if (visible.current) {
      visible.current = null;
      publish();
    }
  };

  return { edit, cancel };
}
