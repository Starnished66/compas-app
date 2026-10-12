import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { SharedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Durations, Easings, motionDuration } from '../motion';
import { useReducedMotion } from '../useReducedMotion';
import { WorkletEasings } from '../workletEasings';

export interface TabBarMotion {
  slot: Animated.Value;
  collapse: SharedValue<number>;
  othersOpacity: Animated.Value;
  tabSquash: Animated.Value;
  minimizeSquash: Animated.Value;
  detach: Animated.Value;
  pillOpacity: Animated.Value;
  beginDrag(): void;
  dragTo(slot: number): void;
  endDrag(slot: number): void;
}

const MINIMIZE_SQUASH_MS = 480;
const DETACH_MS = 300;

export function useTabBarMotion(activeIndex: number, minimized: boolean, onCollapseSettled: () => void): TabBarMotion {
  const reducedMotion = useReducedMotion();
  const restSlot = minimized ? 0 : Math.max(0, activeIndex);
  const slot = useRef(new Animated.Value(restSlot)).current;
  const collapse = useSharedValue(minimized ? 1 : 0);
  const othersOpacity = useRef(new Animated.Value(minimized ? 0 : 1)).current;
  const tabSquash = useRef(new Animated.Value(1)).current;
  const minimizeSquash = useRef(new Animated.Value(1)).current;
  const detach = useRef(new Animated.Value(0)).current;
  const pillOpacity = useRef(new Animated.Value(activeIndex < 0 ? 0 : 1)).current;
  const dragging = useRef(false);
  const previous = useRef({ activeIndex, minimized });
  const latest = useRef({ reducedMotion, activeIndex, onCollapseSettled });
  latest.current = { reducedMotion, activeIndex, onCollapseSettled };

  const timing = (value: Animated.Value, toValue: number, duration: number, easing: (t: number) => number) =>
    Animated.timing(value, {
      toValue,
      duration: motionDuration(latest.current.reducedMotion, duration),
      easing,
      useNativeDriver: true,
    });
  const settleCollapse = () => latest.current.onCollapseSettled();

  const replay = (value: Animated.Value, duration: number) => {
    if (latest.current.reducedMotion) return;
    value.setValue(0);
    timing(value, 1, duration, Easings.easeOut).start();
  };

  useEffect(() => {
    if (dragging.current) return;
    timing(pillOpacity, activeIndex < 0 ? 0 : 1, Durations.editLabel, Easings.ease).start();
  }, [activeIndex, pillOpacity]);

  useEffect(() => {
    const before = previous.current;
    previous.current = { activeIndex, minimized };
    const tabChanged = before.activeIndex !== activeIndex && activeIndex >= 0;
    const minimizedChanged = before.minimized !== minimized;
    if (!tabChanged && !minimizedChanged) return;
    if (!dragging.current) {
      timing(slot, restSlot, Durations.pill, minimizedChanged ? Easings.overshootSoft : Easings.overshoot).start();
    }
    if (tabChanged) replay(tabSquash, Durations.tabSquash);
    if (!minimizedChanged) return;
    replay(minimizeSquash, MINIMIZE_SQUASH_MS);
    timing(othersOpacity, minimized ? 0 : 1, Durations.chromeFade, Easings.ease).start();
    collapse.value = withTiming(
      minimized ? 1 : 0,
      { duration: motionDuration(latest.current.reducedMotion, Durations.pill), easing: WorkletEasings.overshootSoft },
      (finished) => {
        if (finished) scheduleOnRN(settleCollapse);
      },
    );
  }, [activeIndex, collapse, minimizeSquash, minimized, othersOpacity, restSlot, slot, tabSquash]);

  const beginDrag = () => {
    dragging.current = true;
    slot.stopAnimation();
    timing(detach, 1, DETACH_MS, Easings.overshoot).start();
    timing(pillOpacity, 1, Durations.editLabel, Easings.ease).start();
  };

  const dragTo = (value: number) => slot.setValue(value);

  const endDrag = (target: number) => {
    dragging.current = false;
    timing(detach, 0, DETACH_MS, Easings.overshoot).start();
    timing(slot, target, Durations.pill, Easings.overshoot).start();
    if (latest.current.activeIndex < 0) timing(pillOpacity, 0, Durations.editLabel, Easings.ease).start();
  };

  return { slot, collapse, othersOpacity, tabSquash, minimizeSquash, detach, pillOpacity, beginDrag, dragTo, endDrag };
}
