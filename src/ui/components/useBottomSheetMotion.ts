import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, ScrollView } from 'react-native';
import { Distances, Durations, Easings, motionDuration } from '../motion';
import type { BottomSheetProps } from './BottomSheet';

type SheetOptions = Pick<BottomSheetProps, 'visible' | 'onClose' | 'onHidden' | 'onBackPress' | 'contentKey'> & {
  reducedMotion: boolean;
  windowHeight: number;
};

function useSheetAnimationState({ visible, windowHeight, contentKey, onClose, onHidden, onBackPress, reducedMotion }: SheetOptions) {
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const scrim = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const swap = useRef(new Animated.Value(1)).current;
  const sheetHeightRef = useRef(windowHeight);
  const closingRef = useRef(false);
  const previousContentKey = useRef(contentKey);
  const scrollRef = useRef<ScrollView>(null);
  const onCloseRef = useRef(onClose);
  const onHiddenRef = useRef(onHidden);
  onHiddenRef.current = onHidden;
  onCloseRef.current = onClose;
  const onBackPressRef = useRef(onBackPress);
  onBackPressRef.current = onBackPress;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  return {
    mounted, setMounted, progress, scrim, dragY, swap, sheetHeightRef, closingRef,
    previousContentKey, scrollRef, onCloseRef, onHiddenRef, onBackPressRef, reducedMotionRef,
  };
}

type AnimationState = ReturnType<typeof useSheetAnimationState>;

function useSheetAnimations(state: AnimationState, { visible, reducedMotion, contentKey }: SheetOptions) {
  const { closingRef, setMounted, dragY, progress, scrim, onHiddenRef, previousContentKey, scrollRef, swap } = state;

  useEffect(() => {
    const timing = (value: Animated.Value, toValue: number, duration: number, easing: (t: number) => number) =>
      Animated.timing(value, { toValue, duration: motionDuration(reducedMotion, duration), easing, useNativeDriver: true });
    if (visible) {
      closingRef.current = false;
      setMounted(true);
      dragY.setValue(0);
      Animated.parallel([
        timing(progress, 1, Durations.sheetOpen, Easings.standard),
        timing(scrim, 1, Durations.sheetScrim, Easings.standard),
      ]).start();
      return;
    }
    Animated.parallel([
      timing(progress, 0, Durations.sheetClose, Easings.exit),
      timing(scrim, 0, Durations.sheetScrim, Easings.exit),
    ]).start(({ finished }) => {
      if (!finished) return;
      setMounted(false);
      onHiddenRef.current?.();
    });
  }, [dragY, progress, reducedMotion, scrim, visible]);

  useEffect(() => {
    if (previousContentKey.current === contentKey) return;
    previousContentKey.current = contentKey;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    if (reducedMotion) {
      swap.setValue(1);
      return;
    }
    swap.setValue(0);
    Animated.timing(swap, {
      toValue: 1,
      duration: Durations.sheetContentSwap,
      easing: Easings.standard,
      useNativeDriver: true,
    }).start();
  }, [contentKey, reducedMotion, swap]);
}

function useSheetResponders(state: AnimationState) {
  const { closingRef, onCloseRef, onBackPressRef, dragY, reducedMotionRef } = state;
  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    onCloseRef.current();
  };
  // A Modal swallows BackHandler, so back reaches the sheet only through onRequestClose.
  const handleBackPress = () => {
    if (onBackPressRef.current?.()) return;
    requestClose();
  };

  const settleBack = () =>
    Animated.timing(dragY, {
      toValue: 0,
      duration: motionDuration(reducedMotionRef.current, Durations.sheetSnapBack),
      easing: Easings.standard,
      useNativeDriver: true,
    }).start();

  const createDragResponder = (closeOnTap: boolean) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => dragY.setValue(Math.max(0, gesture.dy)),
      onPanResponderRelease: (_, gesture) => {
        const tapped = Math.abs(gesture.dx) < Distances.sheetTap && Math.abs(gesture.dy) < Distances.sheetTap;
        if ((closeOnTap && tapped) || gesture.dy > Distances.sheetClose) {
          requestClose();
          return;
        }
        settleBack();
      },
      onPanResponderTerminate: () => settleBack(),
    });
  const handleResponder = useRef(createDragResponder(true)).current;
  const titleResponder = useRef(createDragResponder(false)).current;

  return { requestClose, handleBackPress, handleResponder, titleResponder };
}

export function useBottomSheetMotion(options: SheetOptions) {
  const state = useSheetAnimationState(options);
  useSheetAnimations(state, options);
  const { mounted, progress, scrim, dragY, swap, sheetHeightRef, scrollRef } = state;
  const responders = useSheetResponders(state);
  return { mounted, progress, scrim, dragY, swap, sheetHeightRef, scrollRef, ...responders };
}
