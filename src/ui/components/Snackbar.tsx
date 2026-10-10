import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Distances, Durations, Easings } from '../motion';
import { usePalette } from '../PaletteProvider';
import { Radius, Space } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import { SnackbarEntry } from '../snackbar/snackbarContext';
import { AppText } from './AppText';
import { Button } from './Button';

export interface SnackbarProps {
  message: SnackbarEntry | null;
  onAction: () => void;
  style?: StyleProp<ViewStyle>;
}

const MIN_HEIGHT = 44;

export function Snackbar({ message, onAction, style }: SnackbarProps) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const [shown, setShown] = useState<SnackbarEntry | null>(message);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(Distances.snackIn)).current;

  useEffect(() => {
    if (message) {
      setShown(message);
      opacity.setValue(reducedMotion ? 1 : 0);
      translateY.setValue(reducedMotion ? 0 : Distances.snackIn);
      if (reducedMotion) return;
      const config = { toValue: 0, duration: Durations.snackIn, easing: Easings.standard, useNativeDriver: true };
      Animated.parallel([
        Animated.timing(opacity, { ...config, toValue: 1 }),
        Animated.timing(translateY, config),
      ]).start();
      return;
    }
    if (reducedMotion) {
      setShown(null);
      return;
    }
    const config = { duration: Durations.snackOut, easing: Easings.exit, useNativeDriver: true };
    Animated.parallel([
      Animated.timing(opacity, { ...config, toValue: 0 }),
      Animated.timing(translateY, { ...config, toValue: Distances.snackOut }),
    ]).start(({ finished }) => {
      if (finished) setShown(null);
    });
  }, [message, opacity, reducedMotion, translateY]);

  if (!shown) return null;

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      pointerEvents={message ? 'auto' : 'none'}
      style={[
        styles.toast,
        {
          backgroundColor: palette.surfaceRaised,
          borderColor: palette.outline,
          opacity,
          transform: [{ translateY }],
        },
        style,
      ]}
    >
      <View style={styles.text}>
        <AppText variant="body" numberOfLines={2}>
          {shown.text}
        </AppText>
      </View>
      {shown.actionLabel ? <Button label={shown.actionLabel} variant="plain" onPress={onAction} /> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_HEIGHT,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingTop: Space.xs,
    paddingRight: Space.xs,
    paddingBottom: Space.xs,
    paddingLeft: Space.lg,
    gap: Space.sm,
  },
  text: {
    flex: 1,
    minWidth: 0,
    paddingVertical: Space.sm,
  },
});
