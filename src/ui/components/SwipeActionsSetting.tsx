import React from 'react';
import { SWIPE_ACTIONS, SWIPE_ACTION_LABELS, SwipeAction, SwipeDirection } from '../swipeActions';
import { useSwipeActionsPreference } from '../preferences/useSwipeActionsPreference';
import { PreferenceSetting } from './PreferenceSetting';
import { useI18n } from '../../i18n';

const TITLES: Record<SwipeDirection, string> = {
  right: 'Swipe a song left to right',
  left: 'Swipe a song right to left',
};

export function SwipeActionSetting({ direction }: { direction: SwipeDirection }) {
  const { t } = useI18n();
  const { actions, setAction } = useSwipeActionsPreference();
  return (
    <PreferenceSetting<SwipeAction>
      title={t(TITLES[direction])}
      options={SWIPE_ACTIONS.map((value) => ({ value, label: t(SWIPE_ACTION_LABELS[value]) }))}
      value={actions[direction]}
      onChange={(action) => setAction(direction, action)}
    />
  );
}
