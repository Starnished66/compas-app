import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  LayoutChangeEvent,
} from 'react-native';

export interface SlimSliderProps {
  value: number; // between 0 and 1 (or min and max)
  onValueChange: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  min?: number;
  max?: number;
  enabled?: boolean;
  activeColor?: string;
  inactiveColor?: string;
  thumbColor?: string;
  trackHeight?: number;
  thumbSize?: number;
}

export const SlimSlider: React.FC<SlimSliderProps> = ({
  value,
  onValueChange,
  onSlidingComplete,
  min = 0,
  max = 1,
  enabled = true,
  activeColor = '#B8BAC1',
  inactiveColor = '#37393E',
  thumbColor = '#B8BAC1',
  trackHeight = 4,
  thumbSize = 14,
}) => {
  const [sliderWidth, setSliderWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(value);
  const containerRef = useRef<View>(null);
  const sliderWidthRef = useRef(0);
  const windowXRef = useRef(0);
  const hasWindowXRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragValueRef = useRef(value);
  const gestureStartXRef = useRef(0);
  const propsRef = useRef({ min, max, enabled, onValueChange, onSlidingComplete });
  propsRef.current = { min, max, enabled, onValueChange, onSlidingComplete };

  useEffect(() => {
    if (!isDragging) {
      setDragValue(value);
      dragValueRef.current = value;
    }
  }, [value, isDragging]);

  const updateFromPosition = (pageX: number) => {
    const width = sliderWidthRef.current;
    if (width <= 0) return;
    const localX = hasWindowXRef.current ? pageX - windowXRef.current : pageX;
    const clampedX = Math.max(0, Math.min(width, localX));
    const ratio = clampedX / width;
    const { min: currentMin, max: currentMax } = propsRef.current;
    const computed = currentMin + ratio * (currentMax - currentMin);
    setDragValue(computed);
    dragValueRef.current = computed;
    propsRef.current.onValueChange(computed);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => propsRef.current.enabled,
      onMoveShouldSetPanResponder: () => propsRef.current.enabled,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        if (!propsRef.current.enabled) return;
        setIsDragging(true);
        isDraggingRef.current = true;
        if (!hasWindowXRef.current) {
          windowXRef.current = evt.nativeEvent.pageX - evt.nativeEvent.locationX;
          hasWindowXRef.current = true;
        }
        updateFromPosition(evt.nativeEvent.pageX);
        gestureStartXRef.current = evt.nativeEvent.pageX - windowXRef.current;
      },
      onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (!propsRef.current.enabled || !isDraggingRef.current) return;
        const localX = hasWindowXRef.current
          ? gestureState.moveX - windowXRef.current
          : gestureStartXRef.current + gestureState.dx;
        const width = sliderWidthRef.current;
        if (width <= 0) return;
        const ratio = Math.max(0, Math.min(width, localX)) / width;
        const { min: currentMin, max: currentMax } = propsRef.current;
        const computed = currentMin + ratio * (currentMax - currentMin);
        setDragValue(computed);
        dragValueRef.current = computed;
        propsRef.current.onValueChange(computed);
      },
      onPanResponderRelease: () => {
        if (!propsRef.current.enabled) return;
        setIsDragging(false);
        isDraggingRef.current = false;
        propsRef.current.onSlidingComplete?.(dragValueRef.current);
      },
      onPanResponderTerminate: () => {
        setIsDragging(false);
        isDraggingRef.current = false;
      },
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setSliderWidth(w);
    sliderWidthRef.current = w;
    containerRef.current?.measureInWindow((x) => {
      windowXRef.current = x;
      hasWindowXRef.current = true;
    });
  };

  const displayValue = isDragging ? dragValue : value;
  const clampedValue = Math.max(min, Math.min(max, displayValue));
  const range = max - min || 1;
  const progressRatio = (clampedValue - min) / range;
  const thumbLeft = Math.max(0, Math.min(sliderWidth - thumbSize, progressRatio * sliderWidth - thumbSize / 2));

  return (
    <View
      ref={containerRef}
      style={styles.container}
      onLayout={onLayout}
      {...(enabled ? panResponder.panHandlers : {})}
    >
      <View
        style={[
          styles.track,
          {
            height: trackHeight,
            backgroundColor: inactiveColor,
            borderRadius: trackHeight / 2,
          },
        ]}
      >
        <View
          style={[
            styles.activeTrack,
            {
              width: `${Math.round(progressRatio * 100)}%`,
              backgroundColor: activeColor,
              borderRadius: trackHeight / 2,
            },
          ]}
        />
      </View>
      {sliderWidth > 0 && (
        <View
          style={[
            styles.thumb,
            {
              left: thumbLeft,
              width: thumbSize,
              height: thumbSize,
              borderRadius: thumbSize / 2,
              backgroundColor: thumbColor,
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 36,
    justifyContent: 'center',
    width: '100%',
  },
  track: {
    overflow: 'hidden',
    width: '100%',
  },
  activeTrack: {
    height: '100%',
  },
  thumb: {
    position: 'absolute',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
});
