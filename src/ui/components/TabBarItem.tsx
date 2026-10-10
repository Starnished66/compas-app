import React from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Size, Type } from '../tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { IconName } from './iconPaths';

export interface TabBarItemProps {
  label: string;
  icon: IconName;
  selected: boolean;
  hidden: boolean;
  collapse: Animated.Value;
  othersOpacity: Animated.Value;
  onPress: () => void;
}

const TAB_CONTENT_GAP = 2;

export function TabBarItem({ label, icon, selected, hidden, collapse, othersOpacity, onPress }: TabBarItemProps) {
  const palette = usePalette();
  const tint = selected ? palette.onAccentContainer : palette.inkMuted;

  return (
    <Animated.View
      style={[
        styles.slot,
        { flexGrow: selected ? 1 : collapse.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' }) },
      ]}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={hidden}
    >
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        disabled={hidden}
        onPress={onPress}
        style={styles.tab}
      >
        <Animated.View style={[styles.content, { opacity: selected ? 1 : othersOpacity }]}>
          <Icon name={icon} size={Size.icon} color={tint} />
          <AppText variant="micro" numberOfLines={1} style={[styles.label, { color: tint }]}>
            {label}
          </AppText>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: TAB_CONTENT_GAP,
  },
  label: {
    fontWeight: Type.bodyStrong.fontWeight,
  },
});
