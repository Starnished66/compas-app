import React from 'react';
import {
  AccessibilityActionEvent,
  I18nManager,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { usePalette } from '../PaletteProvider';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useDerivedValue } from 'react-native-reanimated';
import { Radius, Space, Type } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import { AppText } from './AppText';
import { clampUnit, useSliderDrag } from './useSliderDrag';

export interface SliderProps {
  value: number;
  label: string;
  onChange?: (value: number) => void;
  onCommit: (value: number) => void;
  formatValue?: (value: number) => string;
  showValueBubble?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TOUCH_HEIGHT = 24;
const TRACK_HEIGHT = 4;
const TRACK_HEIGHT_DRAGGING = 8;
const THUMB_SIZE = 14;
const THUMB_SIZE_DRAGGING = 22;

export const SLIDER_THUMB_OVERHANG = THUMB_SIZE_DRAGGING / 2;
const BUBBLE_OFFSET = 20;
const BUBBLE_ANCHOR_WIDTH = 120;
const ACCESSIBILITY_STEP = 0.05;

export function Slider({
  value,
  label,
  onChange,
  onCommit,
  formatValue,
  showValueBubble = true,
  disabled = false,
  style,
}: SliderProps) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const mirrored = I18nManager.isRTL && I18nManager.doLeftAndRightSwapInRTL;
  const { commit, dragValue, fraction, gesture, grow, width } = useSliderDrag(
    value, disabled, reducedMotion, mirrored, onChange, onCommit,
  );
  const shown = dragValue ?? clampUnit(value);
  const { trackStyle, fillStyle, thumbStyle, bubbleStyle } = useSliderStyles(grow, fraction, width, mirrored);
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const delta = event.nativeEvent.actionName === 'increment' ? ACCESSIBILITY_STEP : -ACCESSIBILITY_STEP;
    commit(clampUnit(value + delta));
  };

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(shown * 100),
          text: formatValue?.(shown),
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAccessibilityAction}
        onLayout={(event) => { width.value = event.nativeEvent.layout.width; }}
        style={[styles.touchArea, disabled && styles.disabled, style]}
      >
        <Animated.View pointerEvents="none" style={[styles.track, { backgroundColor: palette.surfaceRaised }, trackStyle]}>
          <Animated.View style={[styles.fill, { backgroundColor: palette.accent }, fillStyle]} />
          <Animated.View style={[styles.thumb, { backgroundColor: palette.accent }, thumbStyle]} />
          {dragValue !== null && formatValue && showValueBubble ? (
            <Animated.View style={[styles.bubbleAnchor, bubbleStyle]}>
              <View style={[styles.bubble, { backgroundColor: palette.accent }]}>
                <AppText variant="caption" tone="onAccent" tabular style={styles.bubbleText} numberOfLines={1}>
                  {formatValue(shown)}
                </AppText>
              </View>
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

type SliderDrag = ReturnType<typeof useSliderDrag>;

function useSliderStyles(grow: SliderDrag['grow'], fraction: SliderDrag['fraction'], width: SliderDrag['width'], mirrored: boolean) {
  const trackStyle = useAnimatedStyle(() => ({
    height: interpolate(grow.value, [0, 1], [TRACK_HEIGHT, TRACK_HEIGHT_DRAGGING]),
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: fraction.value * width.value }));
  const offset = useDerivedValue(() => (mirrored ? -1 : 1) * fraction.value * width.value);
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offset.value },
      { scale: interpolate(grow.value, [0, 1], [1, THUMB_SIZE_DRAGGING / THUMB_SIZE]) },
    ],
  }));
  const bubbleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return { trackStyle, fillStyle, thumbStyle, bubbleStyle };
}

const styles = StyleSheet.create({
  touchArea: {
    height: TOUCH_HEIGHT,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: Radius.full,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: Radius.full,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    top: '50%',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    marginLeft: -THUMB_SIZE / 2,
    marginTop: -THUMB_SIZE / 2,
    borderRadius: Radius.full,
  },
  bubbleAnchor: {
    position: 'absolute',
    left: 0,
    bottom: BUBBLE_OFFSET,
    width: BUBBLE_ANCHOR_WIDTH,
    marginLeft: -BUBBLE_ANCHOR_WIDTH / 2,
    alignItems: 'center',
  },
  bubble: {
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.sm,
  },
  bubbleText: {
    fontWeight: Type.bodyStrong.fontWeight,
  },
  disabled: {
    opacity: 0.4,
  },
});
