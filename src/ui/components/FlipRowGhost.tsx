import React, { memo, useLayoutEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { FlipContext, FlipRect, FlipRowGhostSpec } from '../library/flipRegistry';
import { Durations, Easings } from '../motion';

export interface FlipRowGhostProps {
  ghost: FlipRowGhostSpec;
  origin: FlipRect;
}

function createProgress() {
  return new Animated.Value(0);
}

function FlipRowGhostContent({ ghost, origin }: FlipRowGhostProps) {
  const [progress] = useState(createProgress);
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

  const style = useMemo(
    () => ({
      left: rect.x - origin.x,
      top: rect.y - origin.y,
      width: rect.width,
      height: rect.height,
      opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [ghost.opacity, 0] }),
      transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, ghost.drift] }) }],
    }),
    [ghost.drift, ghost.opacity, origin, progress, rect],
  );

  return (
    <Animated.View style={[styles.ghost, style]}>
      <FlipContext.Provider value={null}>{ghost.content}</FlipContext.Provider>
    </Animated.View>
  );
}

export const FlipRowGhost = memo(FlipRowGhostContent);

const styles = StyleSheet.create({
  ghost: {
    position: 'absolute',
  },
});
