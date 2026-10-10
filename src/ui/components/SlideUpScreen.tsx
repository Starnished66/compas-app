import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, StyleProp, StyleSheet, useWindowDimensions, ViewStyle } from 'react-native';
import { Distances, Durations, Easings } from '../motion';
import { usePalette } from '../PaletteProvider';
import { useReducedMotion } from '../useReducedMotion';

export interface SlideUpScreenProps {
  visible: boolean;
  children: ReactNode;
  onHidden?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SlideUpScreen({ visible, children, onHidden, style }: SlideUpScreenProps) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(visible ? 0 : windowHeight)).current;
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const onHiddenRef = useRef(onHidden);
  onHiddenRef.current = onHidden;
  const wasVisible = useRef(visible);

  useEffect(() => {
    const changed = wasVisible.current !== visible;
    wasVisible.current = visible;
    if (visible) {
      setMounted(true);
      if (!changed) return;
      opacity.setValue(1);
      if (reducedMotion) {
        translateY.setValue(0);
        return;
      }
      translateY.setValue(windowHeight);
      Animated.timing(translateY, {
        toValue: 0,
        duration: Durations.connectionOpen,
        easing: Easings.standard,
        useNativeDriver: true,
      }).start();
      return;
    }
    if (!changed) return;
    const hide = () => {
      setMounted(false);
      onHiddenRef.current?.();
    };
    if (reducedMotion) {
      hide();
      return;
    }
    const config = { duration: Durations.connectionClose, easing: Easings.exit, useNativeDriver: true };
    Animated.parallel([
      Animated.timing(translateY, { ...config, toValue: Distances.connectionExit }),
      Animated.timing(opacity, { ...config, toValue: 0 }),
    ]).start(({ finished }) => {
      if (finished) hide();
    });
  }, [opacity, reducedMotion, translateY, visible, windowHeight]);

  if (!mounted) return null;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: palette.background, opacity, transform: [{ translateY }] },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
