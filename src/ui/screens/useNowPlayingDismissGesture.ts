import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { cancelAnimation, Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import {
  shouldCommitNowPlayingGestureClose,
  shouldDismissNowPlaying,
  shouldRequestNowPlayingGestureClose,
} from '../nowPlayingGesture';

export function useNowPlayingDismissState(visible: boolean, windowHeight: number, onClose: () => void) {
  const offset = useSharedValue(windowHeight);
  const targetOffset = useSharedValue(visible ? 0 : windowHeight);
  const gestureClosePending = useSharedValue(false);
  const gestureCloseToken = useSharedValue(0);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dragStart = useSharedValue(0);
  return { offset, targetOffset, gestureClosePending, gestureCloseToken, visibleRef, onCloseRef, dragStart };
}

type DismissState = ReturnType<typeof useNowPlayingDismissState>;

export function useNowPlayingDismissVisibility(
  state: DismissState, visible: boolean, windowHeight: number, reducedMotion: boolean,
  requestGestureClose: (token: number) => void,
) {
  const { offset, targetOffset, gestureClosePending, gestureCloseToken } = state;
  useEffect(() => {
    if (visible && gestureClosePending.value) {
      const closeToken = gestureCloseToken.value;
      targetOffset.value = windowHeight;
      if (reducedMotion) {
        offset.value = windowHeight;
        requestGestureClose(closeToken);
        return;
      }
      offset.value = withSpring(windowHeight, {
        damping: 38,
        stiffness: 500,
        mass: 0.75,
        overshootClamping: true,
      }, (finished) => {
        if (shouldCommitNowPlayingGestureClose(
          finished,
          gestureClosePending.value,
          closeToken,
          gestureCloseToken.value,
          targetOffset.value,
          windowHeight,
        )) {
          runOnJS(requestGestureClose)(closeToken);
        }
      });
      return;
    }
    if (visible) {
      gestureCloseToken.value += 1;
      gestureClosePending.value = false;
    }
    if (!visible && gestureClosePending.value) {
      gestureCloseToken.value += 1;
      gestureClosePending.value = false;
      targetOffset.value = windowHeight;
      offset.value = windowHeight;
      return;
    }
    if (!visible) {
      gestureCloseToken.value += 1;
      gestureClosePending.value = false;
    }
    targetOffset.value = visible ? 0 : windowHeight;
    if (reducedMotion) {
      offset.value = visible ? 0 : windowHeight;
      return;
    }
    offset.value = withSpring(visible ? 0 : windowHeight, {
      damping: 38,
      stiffness: 500,
      mass: 0.75,
      overshootClamping: true,
    });
  }, [gestureClosePending, gestureCloseToken, offset, reducedMotion, targetOffset, visible, windowHeight]);
}

function finishDismissGesture(
  event: { translationY: number; velocityY: number },
  offset: DismissState['offset'],
  targetOffset: DismissState['targetOffset'],
  gestureClosePending: DismissState['gestureClosePending'],
  gestureCloseToken: DismissState['gestureCloseToken'],
  windowHeight: number,
  reducedMotion: boolean,
  requestGestureClose: (token: number) => void,
) {
  'worklet';
  if (targetOffset.value !== 0) {
    offset.value = targetOffset.value;
    return;
  }
  if (shouldDismissNowPlaying(event.translationY, event.velocityY)) {
    const closeToken = gestureCloseToken.value + 1;
    gestureCloseToken.value = closeToken;
    targetOffset.value = windowHeight;
    gestureClosePending.value = true;
    if (reducedMotion) {
      offset.value = windowHeight;
      runOnJS(requestGestureClose)(closeToken);
      return;
    }
    offset.value = withSpring(windowHeight, {
      damping: 38,
      stiffness: 500,
      mass: 0.75,
      overshootClamping: true,
      velocity: Math.max(0, event.velocityY),
    }, (finished) => {
      if (shouldCommitNowPlayingGestureClose(
        finished,
        gestureClosePending.value,
        closeToken,
        gestureCloseToken.value,
        targetOffset.value,
        windowHeight,
      )) {
        runOnJS(requestGestureClose)(closeToken);
      }
    });
    return;
  }
  if (reducedMotion) {
    offset.value = 0;
    return;
  }
  offset.value = withSpring(0, {
    damping: 38,
    stiffness: 500,
    mass: 0.75,
    overshootClamping: true,
    velocity: event.velocityY,
  });
}

export function useNowPlayingDismissGesture(state: DismissState, visible: boolean, windowHeight: number, reducedMotion: boolean) {
  const { offset, targetOffset, gestureClosePending, gestureCloseToken, dragStart, visibleRef, onCloseRef } = state;
  // Stable so the memoized pan gesture can call it from the UI thread without capturing a stale onClose.
  const requestGestureClose = useCallback((token: number) => {
    if (shouldRequestNowPlayingGestureClose(
      visibleRef.current,
      gestureClosePending.value,
      token,
      gestureCloseToken.value,
      targetOffset.value,
      windowHeight,
    )) {
      onCloseRef.current();
    }
  }, [gestureClosePending, gestureCloseToken, targetOffset, windowHeight]);

  const panGesture = useMemo(() => Gesture.Pan()
    .enabled(visible)
    .activeOffsetY(10)
    .failOffsetX([-14, 14])
    .onBegin(() => {
      cancelAnimation(offset);
      if (gestureClosePending.value) {
        gestureCloseToken.value += 1;
        gestureClosePending.value = false;
        targetOffset.value = 0;
      }
      dragStart.value = offset.value;
    })
    .onUpdate((event) => {
      offset.value = Math.min(windowHeight, Math.max(0, dragStart.value + event.translationY));
    })
    .onEnd((event) => {
      finishDismissGesture(event, offset, targetOffset, gestureClosePending, gestureCloseToken, windowHeight, reducedMotion, requestGestureClose);
    })
    .onFinalize((_event, success) => {
      if (!success) {
        offset.value = reducedMotion
          ? targetOffset.value
          : withSpring(targetOffset.value, {
              damping: 38,
              stiffness: 500,
              mass: 0.75,
              overshootClamping: true,
            });
      }
    }), [dragStart, gestureClosePending, gestureCloseToken, offset, reducedMotion, requestGestureClose, targetOffset, visible, windowHeight]);

  const playerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));
  const scrimAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [0, Math.max(1, windowHeight)], [0.58, 0], Extrapolation.CLAMP),
  }));

  return { panGesture, playerAnimatedStyle, scrimAnimatedStyle, requestGestureClose };
}
