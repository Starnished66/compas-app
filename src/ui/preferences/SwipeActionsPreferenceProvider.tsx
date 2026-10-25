import React, { useCallback, useMemo } from 'react';
import { DEFAULT_SWIPE_ACTIONS, SwipeAction, SwipeDirection, isSwipeAction } from '../swipeActions';
import { SwipeActionsPreferenceContext } from './swipeActionsPreferenceContext';
import { useStoredPreference } from './useStoredPreference';

const RIGHT_KEY = 'ui.swipeRightAction';
const LEFT_KEY = 'ui.swipeLeftAction';

export function SwipeActionsPreferenceProvider({ children }: { children: React.ReactNode }) {
  const [right, setRight] = useStoredPreference(RIGHT_KEY, DEFAULT_SWIPE_ACTIONS.right, isSwipeAction);
  const [left, setLeft] = useStoredPreference(LEFT_KEY, DEFAULT_SWIPE_ACTIONS.left, isSwipeAction);
  const setAction = useCallback(
    (direction: SwipeDirection, action: SwipeAction) => (direction === 'right' ? setRight(action) : setLeft(action)),
    [setLeft, setRight],
  );
  const value = useMemo(() => ({ actions: { right, left }, setAction }), [left, right, setAction]);
  return <SwipeActionsPreferenceContext.Provider value={value}>{children}</SwipeActionsPreferenceContext.Provider>;
}
