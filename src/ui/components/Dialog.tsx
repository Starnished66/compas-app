import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Durations, Easings, motionDuration } from '../motion';
import { Radius, Space } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import { AppText } from './AppText';

export interface DialogProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  children?: ReactNode;
  actions?: ReactNode;
  dismissable?: boolean;
}

const OPEN_FROM_SCALE = 0.94;
const CLOSE_TO_SCALE = 0.96;
const SHADOW_OFFSET_Y = 16;
const SHADOW_RADIUS = 24;
const SHADOW_ELEVATION = 16;

export function Dialog({ visible, onClose, title, message, children, actions, dismissable = true }: DialogProps) {
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const scrim = useRef(new Animated.Value(0)).current;
  const boxOpacity = useRef(new Animated.Value(0)).current;
  const boxScale = useRef(new Animated.Value(OPEN_FROM_SCALE)).current;

  useEffect(() => {
    const timing = (value: Animated.Value, toValue: number, duration: number, easing: (t: number) => number) =>
      Animated.timing(value, { toValue, duration: motionDuration(reducedMotion, duration), easing, useNativeDriver: true });
    if (visible) {
      setMounted(true);
      boxScale.setValue(OPEN_FROM_SCALE);
      Animated.parallel([
        timing(scrim, 1, Durations.dialogScrim, Easings.standard),
        timing(boxOpacity, 1, Durations.dialogOpen, Easings.standard),
        timing(boxScale, 1, Durations.dialogOpen, Easings.standard),
      ]).start();
      return;
    }
    Animated.parallel([
      timing(scrim, 0, Durations.dialogClose, Easings.exit),
      timing(boxOpacity, 0, Durations.dialogClose, Easings.exit),
      timing(boxScale, CLOSE_TO_SCALE, Durations.dialogClose, Easings.exit),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
  }, [boxOpacity, boxScale, reducedMotion, scrim, visible]);

  if (!mounted) return null;

  return (
    <Modal transparent statusBarTranslucent animationType="none" visible onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: scrim }]}>
          <Pressable
            accessibilityRole={dismissable ? 'button' : undefined}
            accessibilityLabel={dismissable ? 'Close' : undefined}
            disabled={!dismissable}
            onPress={onClose}
            style={[StyleSheet.absoluteFill, { backgroundColor: palette.scrim }]}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          accessibilityRole="alert"
          style={[
            styles.card,
            {
              backgroundColor: palette.surface,
              borderColor: palette.outline,
              shadowColor: palette.scrim,
              opacity: boxOpacity,
              transform: [{ scale: boxScale }],
            },
          ]}
        >
          <View style={styles.header}>
            <AppText variant="title" accessibilityRole="header">
              {title}
            </AppText>
            {message ? (
              <AppText variant="body" tone="inkMuted">
                {message}
              </AppText>
            ) : null}
          </View>
          {children}
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.xl,
  },
  card: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: Space.xl,
    gap: Space.lg,
    shadowOffset: { width: 0, height: SHADOW_OFFSET_Y },
    shadowOpacity: 1,
    shadowRadius: SHADOW_RADIUS,
    elevation: SHADOW_ELEVATION,
  },
  header: {
    gap: Space.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.md,
  },
});
