import React, { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Distances, Durations, Easings, motionDuration } from '../motion';
import { SnackbarHost } from '../snackbar/SnackbarHost';
import { Radius, Space } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import { AppText } from './AppText';
import { SheetHandle } from './SheetHandle';
import { useScreenInsets } from '../useScreenInsets';
import { insetBeyond } from '../insetBeyond';
import { useI18n } from '../../i18n';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  scrollable?: boolean;
  fullHeight?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  contentKey?: string;
  onHidden?: () => void;
}

const TOP_GAP = Space.xl + Space.sm;
const SWAP_START_OPACITY = 0.3;

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  scrollable = true,
  fullHeight = false,
  contentStyle,
  contentKey,
  onHidden,
}: BottomSheetProps) {
  const palette = usePalette();
  const { t } = useI18n();
  const reducedMotion = useReducedMotion();
  const insets = useScreenInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  const scrim = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const swap = useRef(new Animated.Value(1)).current;
  const sheetHeightRef = useRef(windowHeight);
  const closingRef = useRef(false);
  const previousContentKey = useRef(contentKey);
  const onCloseRef = useRef(onClose);
  const onHiddenRef = useRef(onHidden);
  onHiddenRef.current = onHidden;
  onCloseRef.current = onClose;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

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

  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    onCloseRef.current();
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

  if (!mounted) return null;

  const maxHeight = windowHeight - insets.top - TOP_GAP;
  const slide = progress.interpolate({ inputRange: [0, 1], outputRange: [sheetHeightRef.current, 0] });
  const fillsSheet = fullHeight && !scrollable;
  const swapStyle = {
    opacity: swap.interpolate({ inputRange: [0, 1], outputRange: [SWAP_START_OPACITY, 1] }),
    transform: [{ translateY: swap.interpolate({ inputRange: [0, 1], outputRange: [Distances.sheetSwap, 0] }) }],
  };
  const body = (
    <Animated.View style={[styles.content, fillsSheet && styles.fill, contentStyle, swapStyle]}>{children}</Animated.View>
  );

  return (
    <Modal transparent statusBarTranslucent animationType="none" visible onRequestClose={requestClose}>
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrim }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Close')}
            style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }]}
            onPress={requestClose}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          onLayout={(event) => {
            sheetHeightRef.current = event.nativeEvent.layout.height;
          }}
          style={[
            styles.sheet,
            {
              backgroundColor: palette.surface,
              borderColor: palette.outline,
              maxHeight,
              paddingBottom: insetBeyond(insets.bottom, Space.lg),
              transform: [{ translateY: Animated.add(slide, dragY) }],
            },
            fullHeight && { height: maxHeight },
          ]}
        >
          <View>
            <SheetHandle
              label={t('Drag down to close')}
              onClose={requestClose}
              dragHandlers={handleResponder.panHandlers}
            />
            {title ? (
              <View {...titleResponder.panHandlers}>
                <AppText variant="title" accessibilityRole="header" style={styles.title}>
                  {title}
                </AppText>
              </View>
            ) : null}
          </View>
          {scrollable ? (
            <ScrollView
              style={styles.scroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {body}
            </ScrollView>
          ) : (
            <View style={[styles.scroll, fillsSheet && styles.fill]}>{body}</View>
          )}
        </Animated.View>
        <SnackbarHost bottomOffset={Space.lg + insetBeyond(insets.bottom, Space.lg)} active={visible} />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    overflow: 'hidden',
  },
  title: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.sm,
  },
  scroll: {
    flexShrink: 1,
  },
  content: {
    paddingBottom: Space.lg,
  },
  fill: {
    flex: 1,
  },
});
