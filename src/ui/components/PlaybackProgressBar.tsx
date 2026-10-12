import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { usePlaybackFraction } from '../usePlaybackPosition';
import { ProgressBar } from './ProgressBar';

export interface PlaybackProgressBarProps {
  style?: StyleProp<ViewStyle>;
}

export function PlaybackProgressBar({ style }: PlaybackProgressBarProps) {
  return <ProgressBar value={usePlaybackFraction()} label="Song progress" style={style} />;
}
