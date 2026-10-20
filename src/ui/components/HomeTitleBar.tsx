import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { between, CollapseProgress, fadeOnCollapse } from '../collapse';
import { Size, Space } from '../tokens';
import { AppText } from './AppText';
import { IconButton } from './IconButton';
import { useI18n } from '../../i18n';

export interface HomeTitleBarProps {
  onOpenSettings: () => void;
  collapse?: CollapseProgress;
  compact?: boolean;
  settingsOpen?: boolean;
}

const TITLE_LIFT = 48;
const SETTINGS_LIFT = 56;
const SETTINGS_TOP = (Size.bar - Size.controlSm) / 2;

export function HomeTitleBar({ onOpenSettings, collapse, compact = false, settingsOpen = false }: HomeTitleBarProps) {
  const { t } = useI18n();
  const expanded = useSharedValue(0);
  const progress = collapse ?? expanded;
  const titleStyle = useAnimatedStyle(() => ({
    opacity: fadeOnCollapse(progress.value),
    transform: [{ translateY: between(progress.value, 0, -TITLE_LIFT) }],
  }));
  const settingsStyle = useAnimatedStyle(() => ({
    opacity: fadeOnCollapse(progress.value),
    transform: [{ translateY: between(progress.value, 0, -SETTINGS_LIFT) }],
  }));

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.title, titleStyle]}>
        <AppText variant="headline" accessibilityRole="header">
          Compás Remote
        </AppText>
      </Animated.View>
      <Animated.View pointerEvents={compact ? 'none' : 'box-none'} style={[styles.settings, settingsStyle]}>
        <IconButton
          icon="settings"
          label={t('Settings')}
          size="sm"
          variant="outlined"
          active={settingsOpen}
          onPress={onOpenSettings}
        />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    position: 'absolute',
    left: Space.lg,
    top: 0,
    height: Size.bar,
    justifyContent: 'center',
  },
  settings: {
    position: 'absolute',
    top: SETTINGS_TOP,
    right: Space.lg,
  },
});
