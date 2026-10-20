import React, { ReactNode, useEffect, useMemo, useRef } from 'react';
import { Animated, LayoutChangeEvent, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Durations, Easings } from '../motion';
import { useReducedMotion } from '../useReducedMotion';

export interface CollapsibleProps {
  open: boolean;
  children: ReactNode;
  onOpened?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Collapsible({ open, children, onOpened, style }: CollapsibleProps) {
  const reducedMotion = useReducedMotion();
  const expansion = useRef(new Animated.Value(open ? 1 : 0)).current;
  const opacity = useRef(new Animated.Value(open ? 1 : 0)).current;
  const contentHeight = useRef(new Animated.Value(0)).current;
  const onOpenedRef = useRef(onOpened);
  onOpenedRef.current = onOpened;
  const firstRun = useRef(true);

  useEffect(() => {
    const target = open ? 1 : 0;
    if (open) onOpenedRef.current?.();
    if (firstRun.current || reducedMotion) {
      firstRun.current = false;
      expansion.setValue(target);
      opacity.setValue(target);
      return;
    }
    const grow = Animated.timing(expansion, {
      toValue: target,
      duration: Durations.expand,
      easing: Easings.responsive,
      useNativeDriver: false,
    });
    const fade = Animated.timing(opacity, {
      toValue: target,
      duration: Durations.expandFade,
      easing: Easings.ease,
      useNativeDriver: true,
    });
    grow.start();
    fade.start();
    return () => {
      grow.stop();
      fade.stop();
    };
  }, [expansion, open, opacity, reducedMotion]);

  const onContentLayout = (event: LayoutChangeEvent) => contentHeight.setValue(event.nativeEvent.layout.height);

  const height = useMemo(() => Animated.multiply(expansion, contentHeight), [contentHeight, expansion]);

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      style={[styles.clip, { height }, style]}
    >
      <Animated.View onLayout={onContentLayout} style={[styles.content, { opacity }]}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  content: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});
