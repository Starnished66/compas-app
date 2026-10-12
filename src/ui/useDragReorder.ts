import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  AccessibilityActionInfo,
  AccessibilityRole,
  Animated,
  GestureResponderHandlers,
  PanResponder,
  PanResponderInstance,
  ViewStyle,
} from 'react-native';
import { shiftUpdates } from './dragShifts';
import { Durations, Easings, motionDuration } from './motion';
import { useReducedMotion } from './useReducedMotion';

export interface DragReorderOptions {
  itemCount: number;
  rowHeight: number;
  enabled: boolean;
  minIndex?: number;
  maxIndex?: number;
  onMove(from: number, to: number): void;
  onDragStateChange?(active: boolean): void;
}

export interface DragHandleProps extends GestureResponderHandlers {
  accessible: boolean;
  accessibilityRole: AccessibilityRole;
  accessibilityLabel: string;
  accessibilityHint: string;
  accessibilityActions: AccessibilityActionInfo[];
  onAccessibilityAction(event: AccessibilityActionEvent): void;
}

export interface DragReorder {
  rowStyle(index: number): Animated.WithAnimatedValue<ViewStyle>;
  handleProps(index: number): DragHandleProps;
  draggingIndex: number | null;
  scrollEnabled: boolean;
}

const LIFT_SCALE = 1.03;
const LIFTED_Z_INDEX = 10;
const LIFTED_ELEVATION = 12;
const LIFTED_SHADOW = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.32,
  shadowRadius: 14,
} as const;
const STILL_ROW_STYLE: ViewStyle = { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0 };

type RowStyle = Animated.WithAnimatedValue<ViewStyle>;

function createDragState() {
  return {
    shifts: [] as Animated.Value[],
    appliedShifts: new Map<number, number>(),
    restingStyles: new Map<number, RowStyle>(),
    dragY: new Animated.Value(0),
    lift: new Animated.Value(1),
    responders: new Map<number, PanResponderInstance>(),
    handles: new Map<number, { min: number; max: number; props: DragHandleProps }>(),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function indexBounds({ minIndex = 0, maxIndex, itemCount }: DragReorderOptions): { min: number; max: number } {
  return { min: minIndex, max: Math.min(maxIndex ?? itemCount - 1, itemCount - 1) };
}

export function useDragReorder(options: DragReorderOptions): DragReorder {
  const reducedMotion = useReducedMotion();
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [{ shifts, appliedShifts, restingStyles, dragY, lift, responders, handles }] = useState(createDragState);
  const drag = useRef({ from: -1, target: -1 });
  const latest = useRef({ ...options, reducedMotion });
  latest.current = { ...options, reducedMotion };

  while (shifts.length < options.itemCount) shifts.push(new Animated.Value(0));

  const bounds = () => indexBounds(latest.current);
  const { min: minBound, max: maxBound } = indexBounds(options);

  const applyTarget = (target: number) => {
    const { from, target: previous } = drag.current;
    if (target === previous) return;
    drag.current.target = target;
    const { rowHeight, reducedMotion: reduced } = latest.current;
    const updates = shiftUpdates(from, previous, target, rowHeight, (index) => appliedShifts.get(index) ?? 0);
    for (const { index, shift } of updates) {
      const value = shifts[index];
      if (!value) continue;
      appliedShifts.set(index, shift);
      Animated.timing(value, {
        toValue: shift,
        duration: motionDuration(reduced, Durations.rowShift),
        easing: Easings.standard,
        useNativeDriver: true,
      }).start();
    }
  };

  const resetPositions = () => {
    appliedShifts.forEach((_, index) => shifts[index]?.setValue(0));
    appliedShifts.clear();
    dragY.setValue(0);
    lift.setValue(1);
  };

  const begin = (index: number) => {
    drag.current = { from: index, target: index };
    dragY.setValue(0);
    setDraggingIndex(index);
    latest.current.onDragStateChange?.(true);
    Animated.timing(lift, {
      toValue: LIFT_SCALE,
      duration: motionDuration(latest.current.reducedMotion, Durations.rowShift),
      easing: Easings.standard,
      useNativeDriver: true,
    }).start();
  };

  const move = (dy: number) => {
    const { from } = drag.current;
    if (from < 0) return;
    const { rowHeight } = latest.current;
    const { min, max } = bounds();
    const clamped = clamp(dy, (min - from) * rowHeight, (max - from) * rowHeight);
    dragY.setValue(clamped);
    applyTarget(clamp(from + Math.round(clamped / rowHeight), min, max));
  };

  const finish = () => {
    const { from, target } = drag.current;
    if (from < 0) return;
    drag.current = { from: -1, target: -1 };
    const { rowHeight, reducedMotion: reduced } = latest.current;
    const settle = (toValue: number, value: Animated.Value) =>
      Animated.timing(value, {
        toValue,
        duration: motionDuration(reduced, Durations.rowSettle),
        easing: Easings.standard,
        useNativeDriver: true,
      });
    Animated.parallel([settle((target - from) * rowHeight, dragY), settle(1, lift)]).start(() => {
      if (target !== from) latest.current.onMove(from, target);
      setDraggingIndex(null);
      latest.current.onDragStateChange?.(false);
      requestAnimationFrame(resetPositions);
    });
  };

  const responderFor = (index: number) => {
    const existing = responders.get(index);
    if (existing) return existing;
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.enabled,
      onMoveShouldSetPanResponder: () => latest.current.enabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => begin(index),
      onPanResponderMove: (_, gesture) => move(gesture.dy),
      onPanResponderRelease: finish,
      onPanResponderTerminate: finish,
    });
    responders.set(index, responder);
    return responder;
  };

  useEffect(() => {
    if (!options.enabled && drag.current.from >= 0) finish();
  });

  const liftedStyle = useMemo<RowStyle>(
    () => ({
      transform: [{ translateY: dragY }, { scale: lift }],
      zIndex: LIFTED_Z_INDEX,
      elevation: LIFTED_ELEVATION,
      ...LIFTED_SHADOW,
    }),
    [dragY, lift],
  );

  const rowStyle = useCallback(
    (index: number): RowStyle => {
      if (index === draggingIndex) return liftedStyle;
      const shift = shifts[index];
      if (!shift) return STILL_ROW_STYLE;
      const cached = restingStyles.get(index);
      if (cached) return cached;
      const style: RowStyle = { transform: [{ translateY: shift }, { scale: 1 }], zIndex: 0 };
      restingStyles.set(index, style);
      return style;
    },
    [draggingIndex, liftedStyle, restingStyles, shifts],
  );

  const handleProps = useCallback((index: number): DragHandleProps => {
    const { min, max } = bounds();
    const cached = handles.get(index);
    if (cached && cached.min === min && cached.max === max) return cached.props;
    const actions: AccessibilityActionInfo[] = [
      ...(index > min ? [{ name: 'moveUp', label: 'Move up' }] : []),
      ...(index < max ? [{ name: 'moveDown', label: 'Move down' }] : []),
    ];
    const props: DragHandleProps = {
      ...responderFor(index).panHandlers,
      accessible: true,
      accessibilityRole: 'button',
      accessibilityLabel: 'Reorder',
      accessibilityHint: 'Drag up or down to move',
      accessibilityActions: actions,
      onAccessibilityAction: (event) => {
        const step = event.nativeEvent.actionName === 'moveUp' ? -1 : event.nativeEvent.actionName === 'moveDown' ? 1 : 0;
        if (step !== 0) latest.current.onMove(index, index + step);
      },
    };
    handles.set(index, { min, max, props });
    return props;
  }, [minBound, maxBound]);

  return { rowStyle, handleProps, draggingIndex, scrollEnabled: draggingIndex === null };
}
