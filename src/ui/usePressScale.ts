import { useCallback, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { Durations, Easings } from './motion';
import { useReducedMotion } from './useReducedMotion';

export function usePressScale(pressedScale: number) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);

  const animateTo = useCallback(
    (toValue: number) => {
      if (reducedMotion) {
        scale.setValue(1);
        return;
      }
      Animated.timing(scale, {
        toValue,
        duration: Durations.press,
        easing: Easings.standard,
        useNativeDriver: true,
      }).start();
    },
    [reducedMotion, scale],
  );

  const onPressIn = useCallback(() => {
    setPressed(true);
    animateTo(pressedScale);
  }, [animateTo, pressedScale]);

  const onPressOut = useCallback(() => {
    setPressed(false);
    animateTo(1);
  }, [animateTo]);

  return { scale, pressed, onPressIn, onPressOut };
}
