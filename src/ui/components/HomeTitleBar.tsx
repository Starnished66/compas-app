import React, { useMemo } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { between, CollapseProgress, fadeOnCollapse } from '../collapse';
import { Size, Space } from '../tokens';
import { AppText } from './AppText';
import { IconButton } from './IconButton';

export interface HomeTitleBarProps {
  onOpenSettings: () => void;
  collapse?: CollapseProgress;
  compact?: boolean;
  settingsOpen?: boolean;
}

const TITLE_LIFT = 48;
const SETTINGS_LIFT = 56;
const SETTINGS_TOP = (Size.bar - Size.controlSm) / 2;
const EXPANDED = new Animated.Value(0);

export function HomeTitleBar({ onOpenSettings, collapse = EXPANDED, compact = false, settingsOpen = false }: HomeTitleBarProps) {
  const animated = useMemo(() => {
    const opacity = fadeOnCollapse(collapse);
    return {
      title: { opacity, transform: [{ translateY: between(collapse, 0, -TITLE_LIFT) }] },
      settings: { opacity, transform: [{ translateY: between(collapse, 0, -SETTINGS_LIFT) }] },
    };
  }, [collapse]);

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.title, animated.title]}>
        <AppText variant="headline" accessibilityRole="header">
          Compás Remote
        </AppText>
      </Animated.View>
      <Animated.View pointerEvents={compact ? 'none' : 'box-none'} style={[styles.settings, animated.settings]}>
        <IconButton
          icon="settings"
          label="Settings"
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
