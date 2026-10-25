import { useContext } from 'react';
import { SwipeActionsPreferenceContext, SwipeActionsPreferenceValue } from './swipeActionsPreferenceContext';

export function useSwipeActionsPreference(): SwipeActionsPreferenceValue {
  return useContext(SwipeActionsPreferenceContext);
}
