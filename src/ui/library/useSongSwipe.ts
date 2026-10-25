import { useCallback, useMemo, useRef } from 'react';
import { ContentStatus, LibraryEntry, RemoteAction } from '../../data/types';
import { SwipeActionVisual } from '../components/SwipeActionRow';
import { useSwipeActionsPreference } from '../preferences/useSwipeActionsPreference';
import { useOptimisticErrorSnackbar } from '../sheets/useOptimisticErrorSnackbar';
import { SWIPE_ACTION_LABELS, SwipeAction, SwipeDirection } from '../swipeActions';
import { useI18n } from '../../i18n';

export interface SongSwipe {
  right: SwipeActionVisual | null;
  left: SwipeActionVisual | null;
  onSwipe(entry: LibraryEntry, direction: SwipeDirection): void;
}

const ICONS = { queue: 'queueAdd', next: 'queue' } as const;

/** The configured swipe actions for song rows, or null when both directions do nothing. */
export function useSongSwipe(
  onAction: (action: RemoteAction) => void,
  connectionMessage: string | null | undefined,
  queueStatus: ContentStatus,
  enabled: boolean,
): SongSwipe | null {
  const { t } = useI18n();
  const { actions } = useSwipeActionsPreference();
  const watchResult = useOptimisticErrorSnackbar(connectionMessage, queueStatus);
  const latest = useRef({ actions, onAction, t, watchResult });
  latest.current = { actions, onAction, t, watchResult };

  const onSwipe = useCallback((entry: LibraryEntry, direction: SwipeDirection) => {
    const current = latest.current;
    const action = current.actions[direction];
    if (action === 'none') return;
    // The session refreshes the queue once the player applied the change (Loading, then settled).
    let refreshing = false;
    current.watchResult({
      message: {
        text: action === 'next'
          ? current.t('“{title}” plays next', { title: entry.title })
          : current.t('Added “{title}” to the queue', { title: entry.title }),
      },
      confirmed: (status) => {
        if (status === ContentStatus.Loading) refreshing = true;
        return refreshing && status !== ContentStatus.Loading;
      },
    });
    current.onAction({ type: 'SwipeSongAction', id: entry.id, action });
  }, []);

  const visual = useCallback(
    (action: SwipeAction): SwipeActionVisual | null =>
      action === 'none' ? null : { label: t(SWIPE_ACTION_LABELS[action]), icon: ICONS[action] },
    [t],
  );

  return useMemo(() => {
    if (!enabled || (actions.right === 'none' && actions.left === 'none')) return null;
    return { right: visual(actions.right), left: visual(actions.left), onSwipe };
  }, [actions.left, actions.right, enabled, onSwipe, visual]);
}
