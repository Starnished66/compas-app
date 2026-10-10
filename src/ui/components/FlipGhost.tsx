import React, { useLayoutEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { FlipArtGhostSpec, FlipRect } from '../library/flipRegistry';
import { Durations, Easings } from '../motion';
import { ArtworkThumb } from './ArtworkThumb';

export interface FlipGhostProps {
  ghost: FlipArtGhostSpec;
  origin: FlipRect;
}

export function FlipGhost({ ghost, origin }: FlipGhostProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const { from, to, artwork } = ghost;
  const size = Math.max(from.width, to.width);

  useLayoutEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
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
  }, [ghost, progress]);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [from.x - to.x, 0] });
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [from.y - to.y, 0] });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [from.width / size, to.width / size] });

  return (
    <Animated.View
      style={[
        styles.ghost,
        {
          left: to.x - origin.x,
          top: to.y - origin.y,
          width: size,
          height: size,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    >
      <ArtworkThumb uri={artwork.uri} size={size} radius={artwork.radius} placeholderIcon={artwork.placeholderIcon} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ghost: {
    position: 'absolute',
    transformOrigin: 'left top',
  },
});
