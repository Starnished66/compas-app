import React, { useLayoutEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { FlipContext, FlipRect, FlipRowGhostSpec } from '../library/flipRegistry';
import { Durations, Easings } from '../motion';

export interface FlipRowGhostProps {
  ghost: FlipRowGhostSpec;
  origin: FlipRect;
}

export function FlipRowGhost({ ghost, origin }: FlipRowGhostProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const { rect } = ghost;

  useLayoutEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      ghost.onDone();
    };
    Animated.timing(progress, {
      toValue: 1,
      duration: Durations.sortLeave,
      delay: ghost.delay,
      easing: Easings.standard,
      useNativeDriver: true,
    }).start(finish);
    return finish;
  }, [ghost, progress]);

  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [ghost.opacity, 0] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, ghost.drift] });

  return (
    <Animated.View
      style={[
        styles.ghost,
        {
          left: rect.x - origin.x,
          top: rect.y - origin.y,
          width: rect.width,
          height: rect.height,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <FlipContext.Provider value={null}>{ghost.content}</FlipContext.Provider>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ghost: {
    position: 'absolute',
  },
});
