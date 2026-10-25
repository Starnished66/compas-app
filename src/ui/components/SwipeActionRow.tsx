import React, { ReactNode, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { Distances, Durations, Easings } from '../motion';
import { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import { SwipeDirection } from '../swipeActions';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { IconName } from './iconPaths';

export interface SwipeActionVisual {
  label: string;
  icon: IconName;
}

export interface SwipeActionRowProps {
  /** Shown while swiping left to right; null disables that direction. */
  right: SwipeActionVisual | null;
  /** Shown while swiping right to left; null disables that direction. */
  left: SwipeActionVisual | null;
  onSwipe: (direction: SwipeDirection) => void;
  children: ReactNode;
}

const SWIPE_START_DISTANCE = 12;
const MAX_TRAVEL_RATIO = 0.6;
const ICON_SIZE = 20;

/**
 * A row that runs an action when dragged sideways past the swipe threshold, then springs back.
 * It only claims clearly horizontal drags, so taps, long-presses and vertical scrolling stay
 * with the row and the list underneath.
 */
export function SwipeActionRow({ right, left, onSwipe, children }: SwipeActionRowProps) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const [offset] = useState(() => new Animated.Value(0));
  const [revealed, setRevealed] = useState<SwipeDirection | null>(null);
  const widthRef = useRef(0);
  const latest = useRef({ right, left, onSwipe, reducedMotion });
  latest.current = { right, left, onSwipe, reducedMotion };

  const allowed = (dx: number) => (dx > 0 ? latest.current.right : latest.current.left) != null;

  const settle = () =>
    Animated.timing(offset, {
      toValue: 0,
      duration: latest.current.reducedMotion ? 0 : Durations.sheetSnapBack,
      easing: Easings.standard,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setRevealed(null);
    });

  const [panResponder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > SWIPE_START_DISTANCE &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2 &&
        allowed(gesture.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, gesture) => {
        const limit = Math.max(Distances.swipeThreshold * 1.5, widthRef.current * MAX_TRAVEL_RATIO);
        const dx = allowed(gesture.dx) ? Math.max(-limit, Math.min(limit, gesture.dx)) : 0;
        setRevealed(dx > 0 ? 'right' : dx < 0 ? 'left' : null);
        offset.setValue(dx);
      },
      onPanResponderRelease: (_, gesture) => {
        if (Math.abs(gesture.dx) >= Distances.swipeThreshold && allowed(gesture.dx)) {
          latest.current.onSwipe(gesture.dx > 0 ? 'right' : 'left');
        }
        settle();
      },
      onPanResponderTerminate: settle,
    }),
  );

  const visual = revealed === 'right' ? right : revealed === 'left' ? left : null;
  const backdropStyle = useMemo(
    () => ({
      backgroundColor: palette.accentContainer,
      opacity: offset.interpolate({
        inputRange: [-Distances.swipeThreshold, 0, Distances.swipeThreshold],
        outputRange: [1, 0, 1],
        extrapolate: 'clamp',
      }),
    }),
    [offset, palette.accentContainer],
  );
  // Opaque only while the action shows underneath; at rest the row keeps the list's own background.
  const contentStyle = useMemo(
    () => ({ backgroundColor: revealed ? palette.surface : undefined, transform: [{ translateX: offset }] }),
    [offset, palette.surface, revealed],
  );

  return (
    <View style={styles.root} onLayout={(event) => { widthRef.current = event.nativeEvent.layout.width; }}>
      {visual ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, revealed === 'left' ? styles.alignEnd : styles.alignStart, backdropStyle]}
        >
          <Icon name={visual.icon} size={ICON_SIZE} color={palette.onAccentContainer} />
          <AppText variant="bodyStrong" style={{ color: palette.onAccentContainer }}>
            {visual.label}
          </AppText>
        </Animated.View>
      ) : null}
      <Animated.View {...panResponder.panHandlers} style={contentStyle}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
  },
  alignStart: {
    justifyContent: 'flex-start',
  },
  alignEnd: {
    justifyContent: 'flex-end',
  },
});
