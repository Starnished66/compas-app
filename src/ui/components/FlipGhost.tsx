import React, { memo, useLayoutEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { FlipArtGhostSpec, FlipRect } from '../library/flipRegistry';
import { Durations, Easings } from '../motion';
import { ArtworkThumb } from './ArtworkThumb';

export interface FlipGhostProps {
  ghost: FlipArtGhostSpec;
  origin: FlipRect;
}

function createGhostValues() {
  return { progress: new Animated.Value(0), opacity: new Animated.Value(1) };
}

function FlipGhostContent({ ghost, origin }: FlipGhostProps) {
  const [{ progress, opacity }] = useState(createGhostValues);
  const { from, to, artwork } = ghost;
  const size = Math.max(from.width, to.width);

  useLayoutEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      // The layer unmounts ghosts in one batch later; hide this one now, in the same tick its real view is revealed.
      opacity.setValue(0);
      ghost.onDone();
    };
    Animated.timing(progress, {
      toValue: 1,
      duration: Durations.viewFlip,
      delay: ghost.delay,
      easing: Easings.standard,
      useNativeDriver: true,
    }).start(finish);
    return finish;
  }, [ghost, opacity, progress]);

  const style = useMemo(
    () => ({
      left: to.x - origin.x,
      top: to.y - origin.y,
      width: size,
      height: size,
      opacity,
      transform: [
        { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [from.x - to.x, 0] }) },
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [from.y - to.y, 0] }) },
        { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [from.width / size, to.width / size] }) },
      ],
    }),
    [from, opacity, origin, progress, size, to],
  );

  return (
    <Animated.View style={[styles.ghost, style]}>
      <ArtworkThumb uri={artwork.uri} size={size} radius={artwork.radius} placeholderIcon={artwork.placeholderIcon} />
    </Animated.View>
  );
}

export const FlipGhost = memo(FlipGhostContent);

const styles = StyleSheet.create({
  ghost: {
    position: 'absolute',
    transformOrigin: 'left top',
  },
});
