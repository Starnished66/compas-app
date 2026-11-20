import React, { forwardRef, ReactNode } from 'react';
import {
  AccessibilityActionEvent,
  Animated,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useRemovableRow } from './useRemovableRow';
import { useI18n } from '../../i18n';

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
const REMOVE_ICON_SIZE = 20;

export const RemovableRow = forwardRef<RemovableRowHandle, RemovableRowProps>(function RemovableRow(props, ref) {
  const {
    rowHeight = DEFAULT_ROW_HEIGHT, swipeToRemove = false, removeLabel, onRemove, onTap, accessibilityLabel,
    extraActions = [], contentBackground, restoreAfterMs = DEFAULT_RESTORE_AFTER_MS, children, style,
  } = props;
  const { t } = useI18n();
  const palette = usePalette();
  const reducedMotion = useReducedMotion();
  const row = useRemovableRow({
    rowHeight, swipeToRemove, onRemove, onTap, contentBackground, restoreAfterMs, reducedMotion,
    surface: palette.surface, surfaceRaised: palette.surfaceRaised,
  }, ref);
  return renderRow({ swipeToRemove, removeLabel, onTap, accessibilityLabel, extraActions, children, style },
    row, palette.statusError, t);
});

function renderRow(
  { swipeToRemove, removeLabel, onTap, accessibilityLabel, extraActions = [], children, style }: Pick<RemovableRowProps, 'swipeToRemove' | 'removeLabel' | 'onTap' | 'accessibilityLabel' | 'extraActions' | 'children' | 'style'>,
  { remove, backdropShown, onLayout, collapsingStyle, backdropStyle, contentStyle, panResponder }: ReturnType<typeof useRemovableRow>,
  removeColor: string,
  t: ReturnType<typeof useI18n>['t'],
) {
  const actions: RowAccessibilityAction[] = [
    ...(onTap && accessibilityLabel ? [{ name: 'activate', label: accessibilityLabel, onAction: onTap }] : []),
    ...(swipeToRemove ? [{ name: 'remove', label: removeLabel, onAction: remove }] : []),
    ...extraActions,
  ];
  const handleAccessibilityAction = (event: AccessibilityActionEvent) =>
    actions.find((action) => action.name === event.nativeEvent.actionName)?.onAction();

  return (
    <Animated.View
      accessible={Boolean(accessibilityLabel)}
      accessibilityRole={accessibilityLabel && onTap ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={swipeToRemove && accessibilityLabel ? t('Swipe left to remove') : undefined}
      accessibilityActions={accessibilityLabel ? actions.map(({ name, label }) => ({ name, label })) : undefined}
      onAccessibilityAction={accessibilityLabel ? handleAccessibilityAction : undefined}
      onLayout={onLayout}
      style={[styles.root, collapsingStyle, style]}
    >
      {swipeToRemove && backdropShown ? (
        <Animated.View pointerEvents="none" style={[styles.backdrop, backdropStyle]}>
          <Icon name="trash" size={REMOVE_ICON_SIZE} color={removeColor} />
          <AppText variant="bodyStrong">{removeLabel}</AppText>
        </Animated.View>
      ) : null}
      <Animated.View {...panResponder.panHandlers} style={contentStyle}>
        {children}
      </Animated.View>
    </Animated.View>
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
    justifyContent: 'flex-end',
    gap: Space.sm,
    paddingHorizontal: Space.xl,
  },
});
