import { createContext } from 'react';
import { DEFAULT_SWIPE_ACTIONS, SwipeAction, SwipeDirection } from '../swipeActions';

export interface SwipeActionsPreferenceValue {
  actions: Record<SwipeDirection, SwipeAction>;
  setAction(direction: SwipeDirection, action: SwipeAction): void;
}

export const SwipeActionsPreferenceContext = createContext<SwipeActionsPreferenceValue>({
  actions: DEFAULT_SWIPE_ACTIONS,
  setAction: () => undefined,
});
