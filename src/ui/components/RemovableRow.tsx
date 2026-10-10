import React, { forwardRef, ReactNode, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  Animated,
  LayoutChangeEvent,
  PanResponder,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Distances, Durations, Easings } from '../motion';
import { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface RowAccessibilityAction {
  name: string;
  label: string;
  onAction: () => void;
}

export interface RemovableRowHandle {
  remove(): void;
  peek(): void;
}

export interface RemovableRowProps {
  rowHeight?: number;
  swipeToRemove?: boolean;
  removeLabel: string;
  onRemove: () => void;
  onTap?: () => void;
  accessibilityLabel?: string;
  extraActions?: RowAccessibilityAction[];
  contentBackground?: string;
  restoreAfterMs?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const DEFAULT_ROW_HEIGHT = 56;
const DEFAULT_RESTORE_AFTER_MS = 2500;
const SWIPE_START_DISTANCE = 8;
const SWIPE_OUT_RATIO = 1.1;
const BACKDROP_REVEAL_DISTANCE = 40;
const REMOVE_ICON_SIZE = 20;

export const RemovableRow = forwardRef<RemovableRowHandle, RemovableRowProps>(function RemovableRow(
  {
    rowHeight = DEFAULT_ROW_HEIGHT,
    swipeToRemove = false,
    removeLabel,
    onRemove,
    onTap,
    accessibilityLabel,
    extraActions = [],
    contentBackground,
    restoreAfterMs = DEFAULT_RESTORE_AFTER_MS,
    children,
    style,
  },
  ref,
) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const offset = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const collapse = useRef(new Animated.Value(1)).current;
  const [collapsing, setCollapsing] = useState(false);
  const measuredHeight = useRef(rowHeight);
  const widthRef = useRef(0);
  const removingRef = useRef(false);
  const mountedRef = useRef(true);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ onRemove, onTap, swipeToRemove, reducedMotion, restoreAfterMs });
  latest.current = { onRemove, onTap, swipeToRemove, reducedMotion, restoreAfterMs };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
    };
  }, []);

  const restore = () => {
    removingRef.current = false;
    setCollapsing(false);
    collapse.setValue(1);
    offset.setValue(0);
    contentOpacity.setValue(1);
  };

  const finishRemoval = () => {
    latest.current.onRemove();
    if (restoreTimer.current) clearTimeout(restoreTimer.current);
    restoreTimer.current = setTimeout(() => {
      if (mountedRef.current) restore();
    }, latest.current.restoreAfterMs);
  };

  const collapseRow = (duration: number, delay: number) =>
    Animated.timing(collapse, { toValue: 0, duration, delay, easing: Easings.standard, useNativeDriver: false });

  const startRemoval = (slide: Animated.CompositeAnimation, collapseDuration: number, collapseDelay: number) => {
    if (removingRef.current) return;
    removingRef.current = true;
    if (latest.current.reducedMotion) {
      finishRemoval();
      return;
    }
    setCollapsing(true);
    Animated.parallel([slide, collapseRow(collapseDuration, collapseDelay)]).start(() => finishRemoval());
  };

  const remove = () => {
    const config = { duration: Durations.rowSlideOut, easing: Easings.exit, useNativeDriver: true };
    startRemoval(
      Animated.parallel([
        Animated.timing(offset, { ...config, toValue: -Distances.rowSlideOut }),
        Animated.timing(contentOpacity, { ...config, toValue: 0 }),
      ]),
      Durations.rowCollapse,
      Durations.rowCollapseDelay,
    );
  };

  const swipeOut = () => {
    startRemoval(
      Animated.timing(offset, {
        toValue: -Math.max(widthRef.current, rowHeight) * SWIPE_OUT_RATIO,
        duration: Durations.swipeOut,
        easing: Easings.exit,
        useNativeDriver: true,
      }),
      Durations.swipeCollapse,
      Durations.swipeCollapseDelay,
    );
  };

  const settleBack = () =>
    Animated.timing(offset, {
      toValue: 0,
      duration: latest.current.reducedMotion ? 0 : Durations.sheetSnapBack,
      easing: Easings.standard,
      useNativeDriver: true,
    }).start();

  const peek = () => {
    if (latest.current.reducedMotion || removingRef.current) return;
    const half = { duration: Durations.peek / 2, easing: Easings.easeInOut, useNativeDriver: true };
    Animated.sequence([
      Animated.timing(offset, { ...half, toValue: -Distances.peek }),
      Animated.timing(offset, { ...half, toValue: 0 }),
    ]).start();
  };

  useImperativeHandle(ref, () => ({ remove, peek }));

  const swipingRef = useRef(false);
  const grantedByMoveRef = useRef(false);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => {
        grantedByMoveRef.current = false;
        return Boolean(latest.current.onTap) && !removingRef.current;
      },
      onMoveShouldSetPanResponder: (_, gesture) => {
        const claim =
          latest.current.swipeToRemove &&
          !removingRef.current &&
          gesture.dx < -SWIPE_START_DISTANCE &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2;
        if (claim) grantedByMoveRef.current = true;
        return claim;
      },
      onShouldBlockNativeResponder: () => grantedByMoveRef.current,
      onPanResponderGrant: () => {
        swipingRef.current = false;
      },
      onPanResponderTerminationRequest: () => !swipingRef.current,
      onPanResponderMove: (_, gesture) => {
        if (!latest.current.swipeToRemove) return;
        if (!swipingRef.current && gesture.dx < -Distances.tapSlop && Math.abs(gesture.dx) > Math.abs(gesture.dy)) {
          swipingRef.current = true;
        }
        if (swipingRef.current) offset.setValue(Math.min(0, gesture.dx));
      },
      onPanResponderRelease: (_, gesture) => {
        const swiping = swipingRef.current;
        swipingRef.current = false;
        if (swiping && gesture.dx < -Distances.swipeThreshold) {
          swipeOut();
          return;
        }
        if (swiping) settleBack();
        const moved = Math.hypot(gesture.dx, gesture.dy);
        if (!swiping && moved < Distances.tapSlop) latest.current.onTap?.();
      },
      onPanResponderTerminate: () => {
        swipingRef.current = false;
        settleBack();
      },
    }),
  ).current;

  const actions: RowAccessibilityAction[] = [
    ...(onTap && accessibilityLabel ? [{ name: 'activate', label: accessibilityLabel, onAction: onTap }] : []),
    { name: 'remove', label: removeLabel, onAction: remove },
    ...extraActions,
  ];
  const handleAccessibilityAction = (event: AccessibilityActionEvent) =>
    actions.find((action) => action.name === event.nativeEvent.actionName)?.onAction();

  const onLayout = (event: LayoutChangeEvent) => {
    widthRef.current = event.nativeEvent.layout.width;
    if (!collapsing) measuredHeight.current = event.nativeEvent.layout.height || rowHeight;
  };

  const height = collapse.interpolate({ inputRange: [0, 1], outputRange: [0, measuredHeight.current] });
  const backdropOpacity = offset.interpolate({
    inputRange: [-BACKDROP_REVEAL_DISTANCE, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel && onTap ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={swipeToRemove && accessibilityLabel ? 'Swipe left to remove' : undefined}
      accessibilityActions={accessibilityLabel ? actions.map(({ name, label }) => ({ name, label })) : undefined}
      onAccessibilityAction={accessibilityLabel ? handleAccessibilityAction : undefined}
      onLayout={onLayout}
      style={[styles.root, collapsing && { height }, style]}
    >
      {swipeToRemove ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.backdrop, { backgroundColor: palette.surfaceRaised, opacity: backdropOpacity }]}
        >
          <Icon name="trash" size={REMOVE_ICON_SIZE} color={palette.statusError} />
          <AppText variant="bodyStrong">{removeLabel}</AppText>
        </Animated.View>
      ) : null}
      <Animated.View
        {...panResponder.panHandlers}
        style={{
          backgroundColor: contentBackground ?? (swipeToRemove ? palette.surface : undefined),
          opacity: contentOpacity,
          transform: [{ translateX: offset }],
        }}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Space.sm,
    paddingHorizontal: Space.xl,
  },
});
