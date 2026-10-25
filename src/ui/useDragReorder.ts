import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { moveSlot, shiftUpdates } from './dragShifts';
import { Durations, Easings, motionDuration } from './motion';
import { useReducedMotion } from './useReducedMotion';
import { useI18n } from '../i18n';

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

// Each row owns one translateY value that both shifts it and, while it is dragged, follows the finger. On drop the
// values and cached styles are moved with the reordered items, so every row view stays bound to the value that
// displaced it natively and the reset after the reorder commit reaches it. Handing a view another index's value
// instead left the native transform stale, because the React props it then received matched what was committed.
function createDragState() {
  return {
    shifts: [] as Animated.Value[],
    appliedShifts: new Map<number, number>(),
    displaced: new Set<Animated.Value>(),
    restingStyles: [] as (RowStyle | undefined)[],
    lift: new Animated.Value(1),
    responders: new Map<number, PanResponderInstance>(),
    handles: new Map<number, { up: boolean; down: boolean; props: DragHandleProps }>(),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function indexBounds({ minIndex = 0, maxIndex, itemCount }: DragReorderOptions): { min: number; max: number } {
  return { min: minIndex, max: Math.min(maxIndex ?? itemCount - 1, itemCount - 1) };
}

export function useDragReorder(options: DragReorderOptions): DragReorder {
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [{ shifts, appliedShifts, displaced, restingStyles, lift, responders, handles }] = useState(createDragState);
  const drag = useRef({ from: -1, target: -1 });
  const resetPending = useRef(false);
  const latest = useRef({ ...options, reducedMotion });
  latest.current = { ...options, reducedMotion };

  while (shifts.length < options.itemCount) {
    shifts.push(new Animated.Value(0));
    restingStyles.push(undefined);
  }

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
      if (!value || index === from) continue;
      appliedShifts.set(index, shift);
      displaced.add(value);
      Animated.timing(value, {
        toValue: shift,
        duration: motionDuration(reduced, Durations.rowShift),
        easing: Easings.standard,
        useNativeDriver: true,
      }).start();
    }
  };

  const resetPositions = () => {
    displaced.forEach((value) => value.setValue(0));
    displaced.clear();
    appliedShifts.clear();
    lift.setValue(1);
  };

  const begin = (index: number) => {
    drag.current = { from: index, target: index };
    const value = shifts[index];
    value?.setValue(0);
    if (value) displaced.add(value);
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
    shifts[from]?.setValue(clamped);
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
    const dragged = shifts[from];
    const settles = [settle(1, lift), ...(dragged ? [settle((target - from) * rowHeight, dragged)] : [])];
    Animated.parallel(settles).start(() => {
      if (target !== from) {
        moveSlot(shifts, from, target);
        moveSlot(restingStyles, from, target);
        latest.current.onMove(from, target);
      }
      resetPending.current = true;
      setDraggingIndex(null);
      latest.current.onDragStateChange?.(false);
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

  // Runs in the commit that applies the reorder (onMove and the drag end batch into one render), before paint,
  // so rows land on their new slots and lose their offsets in the same frame.
  useLayoutEffect(() => {
    if (draggingIndex !== null || !resetPending.current) return;
    resetPending.current = false;
    resetPositions();
  });

  const liftedStyle = useMemo<RowStyle | null>(() => {
    const shift = draggingIndex === null ? undefined : shifts[draggingIndex];
    if (!shift) return null;
    return {
      transform: [{ translateY: shift }, { scale: lift }],
      zIndex: LIFTED_Z_INDEX,
      elevation: LIFTED_ELEVATION,
      ...LIFTED_SHADOW,
    };
  }, [draggingIndex, lift, shifts]);

  const rowStyle = useCallback(
    (index: number): RowStyle => {
      if (index === draggingIndex && liftedStyle) return liftedStyle;
      const shift = shifts[index];
      if (!shift) return STILL_ROW_STYLE;
      const cached = restingStyles[index];
      if (cached) return cached;
      const style: RowStyle = { transform: [{ translateY: shift }, { scale: 1 }], zIndex: 0 };
      restingStyles[index] = style;
      return style;
    },
    [draggingIndex, liftedStyle, restingStyles, shifts],
  );

  const handleProps = useCallback((index: number): DragHandleProps => {
    const { min, max } = bounds();
    const up = index > min;
    const down = index < max;
    // Keyed on the actions the row offers rather than the bounds, so loading another page keeps every
    // row's props identical except the one that used to be last.
    const cached = handles.get(index);
    if (cached && cached.up === up && cached.down === down) return cached.props;
    const actions: AccessibilityActionInfo[] = [
      ...(up ? [{ name: 'moveUp', label: t('Move up') }] : []),
      ...(down ? [{ name: 'moveDown', label: t('Move down') }] : []),
    ];
    const props: DragHandleProps = {
      ...responderFor(index).panHandlers,
      accessible: true,
      accessibilityRole: 'button',
      accessibilityLabel: t('Reorder'),
      accessibilityHint: t('Drag up or down to move'),
      accessibilityActions: actions,
      onAccessibilityAction: (event) => {
        const step = event.nativeEvent.actionName === 'moveUp' ? -1 : event.nativeEvent.actionName === 'moveDown' ? 1 : 0;
        if (step !== 0) latest.current.onMove(index, index + step);
      },
    };
    handles.set(index, { up, down, props });
    return props;
  }, [minBound, maxBound, t]);

  return { rowStyle, handleProps, draggingIndex, scrollEnabled: draggingIndex === null };
}
