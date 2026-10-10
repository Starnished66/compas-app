import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  Animated,
  LayoutChangeEvent,
  PanResponder,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Durations, Easings, motionDuration } from '../motion';
import { Radius, Space, Type } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import { AppText } from './AppText';

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

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

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
  const [dragValue, setDragValue] = useState<number | null>(null);
  const grow = useRef(new Animated.Value(0)).current;
  const widthRef = useRef(0);
  const startXRef = useRef(0);
  const dragValueRef = useRef(0);
  const callbacksRef = useRef({ onChange, onCommit, disabled });
  callbacksRef.current = { onChange, onCommit, disabled };

  const updateDrag = (x: number) => {
    const width = widthRef.current;
    if (width <= 0) return;
    const next = clampUnit(x / width);
    dragValueRef.current = next;
    setDragValue(next);
    callbacksRef.current.onChange?.(next);
  };

  const endDrag = (commit: boolean) => {
    setDragValue(null);
    if (commit) callbacksRef.current.onCommit(dragValueRef.current);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !callbacksRef.current.disabled,
      onMoveShouldSetPanResponder: () => !callbacksRef.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        startXRef.current = event.nativeEvent.locationX;
        updateDrag(startXRef.current);
      },
      onPanResponderMove: (_, gesture) => updateDrag(startXRef.current + gesture.dx),
      onPanResponderRelease: () => endDrag(true),
      onPanResponderTerminate: () => endDrag(true),
    }),
  ).current;

  const onLayout = (event: LayoutChangeEvent) => {
    widthRef.current = event.nativeEvent.layout.width;
  };

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    const delta = event.nativeEvent.actionName === 'increment' ? ACCESSIBILITY_STEP : -ACCESSIBILITY_STEP;
    onCommit(clampUnit(value + delta));
  };

  const dragging = dragValue !== null;
  const shown = clampUnit(dragging ? dragValue : value);
  const percent = `${shown * 100}%` as const;

  useEffect(() => {
    Animated.timing(grow, {
      toValue: dragging ? 1 : 0,
      duration: motionDuration(reducedMotion, Durations.sliderGrow),
      easing: Easings.standard,
      useNativeDriver: false,
    }).start();
  }, [dragging, grow, reducedMotion]);

  const trackHeight = grow.interpolate({ inputRange: [0, 1], outputRange: [TRACK_HEIGHT, TRACK_HEIGHT_DRAGGING] });
  const thumbSize = grow.interpolate({ inputRange: [0, 1], outputRange: [THUMB_SIZE, THUMB_SIZE_DRAGGING] });
  const thumbOffset = grow.interpolate({ inputRange: [0, 1], outputRange: [-THUMB_SIZE / 2, -THUMB_SIZE_DRAGGING / 2] });

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityValue={{
        min: 0,
        max: 100,
        now: Math.round(shown * 100),
        text: formatValue ? formatValue(shown) : undefined,
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
      onLayout={onLayout}
      style={[styles.touchArea, disabled && styles.disabled, style]}
      {...panResponder.panHandlers}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.track, { height: trackHeight, backgroundColor: palette.surfaceRaised }]}
      >
        <View style={[styles.fill, { width: percent, backgroundColor: palette.accent }]} />
        <Animated.View
          style={[
            styles.thumb,
            {
              left: percent,
              width: thumbSize,
              height: thumbSize,
              marginLeft: thumbOffset,
              marginTop: thumbOffset,
              backgroundColor: palette.accent,
            },
          ]}
        />
        {dragging && formatValue && showValueBubble ? (
          <View style={[styles.bubbleAnchor, { left: percent }]}>
            <View style={[styles.bubble, { backgroundColor: palette.accent }]}>
              <AppText variant="caption" tone="onAccent" tabular style={styles.bubbleText} numberOfLines={1}>
                {formatValue(shown)}
              </AppText>
            </View>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: {
    height: TOUCH_HEIGHT,
    justifyContent: 'center',
  },
  track: {
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
    top: '50%',
    borderRadius: Radius.full,
  },
  bubbleAnchor: {
    position: 'absolute',
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
