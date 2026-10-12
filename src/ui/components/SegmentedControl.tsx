import React, { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useSharedValue, withTiming } from 'react-native-reanimated';
import { usePalette } from '../PaletteProvider';
import { Durations, motionDuration } from '../motion';
import { Radius, Size, Space, Type } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import { WorkletEasings } from '../workletEasings';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { IconName } from './iconPaths';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
  caption?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'lg';
  label?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

interface Segment {
  x: number;
  width: number;
}

const LARGE_GROUP_BORDER_WIDTH = 1;

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
  label,
  disabled = false,
  style,
}: SegmentedControlProps<T>) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const large = size === 'lg';
  const [segments, setSegments] = useState<Record<string, Segment>>({});
  const pillX = useSharedValue(0);
  const pillWidth = useSharedValue(0);
  const placedRef = useRef(false);
  const selected = segments[value];

  useEffect(() => {
    if (!selected) return;
    if (!placedRef.current) {
      pillX.value = selected.x;
      pillWidth.value = selected.width;
      placedRef.current = true;
      return;
    }
    const config = { duration: motionDuration(reducedMotion, Durations.pill), easing: WorkletEasings.overshoot };
    pillX.value = withTiming(selected.x, config);
    pillWidth.value = withTiming(selected.width, config);
  }, [pillWidth, pillX, reducedMotion, selected]);

  const onSegmentLayout = (key: T) => (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    const x = event.nativeEvent.layout.x - (large ? LARGE_GROUP_BORDER_WIDTH : 0);
    setSegments((previous) => {
      const current = previous[key];
      if (current && current.x === x && current.width === width) return previous;
      return { ...previous, [key]: { x, width } };
    });
  };

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[
        styles.group,
        large
          ? [styles.groupLarge, { backgroundColor: palette.surface, borderColor: palette.outline }]
          : [styles.groupSmall, { backgroundColor: palette.surfaceRaised }],
        disabled && styles.disabled,
        style,
      ]}
    >
      {selected ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            large ? styles.pillLarge : styles.pillSmall,
            { backgroundColor: palette.accentContainer, left: pillX, width: pillWidth },
          ]}
        />
      ) : null}
      {options.map((option) => {
        const isSelected = option.value === value;
        const foreground = isSelected ? palette.onAccentContainer : palette.ink;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.caption ? `${option.label}, ${option.caption}` : option.label}
            accessibilityState={{ checked: isSelected, disabled }}
            onPress={() => {
              if (!isSelected) onChange(option.value);
            }}
            disabled={disabled}
            onLayout={onSegmentLayout(option.value)}
            style={large ? styles.segmentLarge : styles.segmentSmall}
          >
            {option.icon ? <Icon name={option.icon} color={foreground} filled={isSelected} /> : null}
            {large ? (
              <View style={styles.largeText}>
                <AppText variant="bodyStrong" numberOfLines={1} style={{ color: foreground }}>
                  {option.label}
                </AppText>
                {option.caption ? (
                  <AppText variant="micro" numberOfLines={1} style={{ color: foreground }}>
                    {option.caption}
                  </AppText>
                ) : null}
              </View>
            ) : (
              <AppText variant="caption" numberOfLines={1} style={[styles.smallLabel, { color: foreground }]}>
                {option.label}
              </AppText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    padding: Space.xs,
    gap: Space.xs,
  },
  groupSmall: {
    borderRadius: Radius.md,
  },
  groupLarge: {
    borderRadius: Radius.lg,
    borderWidth: LARGE_GROUP_BORDER_WIDTH,
  },
  pill: {
    position: 'absolute',
    top: Space.xs,
    bottom: Space.xs,
  },
  pillSmall: {
    borderRadius: Radius.sm,
  },
  pillLarge: {
    borderRadius: Radius.md,
  },
  segmentSmall: {
    flexGrow: 1,
    height: Size.controlSm,
    paddingHorizontal: Space.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Space.xs,
  },
  segmentLarge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    minHeight: Size.controlMd,
  },
  largeText: {
    flex: 1,
    minWidth: 0,
  },
  smallLabel: {
    fontWeight: Type.micro.fontWeight,
  },
  disabled: {
    opacity: 0.4,
  },
});
