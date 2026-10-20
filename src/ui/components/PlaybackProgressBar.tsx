import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { usePlaybackFraction } from '../usePlaybackPosition';
import { ProgressBar } from './ProgressBar';
import { useI18n } from '../../i18n';

export interface PlaybackProgressBarProps {
  style?: StyleProp<ViewStyle>;
}

export function PlaybackProgressBar({ style }: PlaybackProgressBarProps) {
  const { t } = useI18n();
  return <ProgressBar value={usePlaybackFraction()} label={t('Song progress')} style={style} />;
}
