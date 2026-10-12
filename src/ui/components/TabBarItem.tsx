import React from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import Reanimated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { clampUnit } from '../collapse';
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
  collapse: SharedValue<number>;
  othersOpacity: Animated.Value;
  onPress: () => void;
}

const TAB_CONTENT_GAP = 2;

export function TabBarItem({ label, icon, selected, hidden, collapse, othersOpacity, onPress }: TabBarItemProps) {
  const palette = usePalette();
  const tint = selected ? palette.onAccentContainer : palette.inkMuted;
  const slotStyle = useAnimatedStyle(() => ({ flexGrow: selected ? 1 : clampUnit(1 - collapse.value) }));

  return (
    <Reanimated.View
      style={[styles.slot, slotStyle]}
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
    </Reanimated.View>
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
