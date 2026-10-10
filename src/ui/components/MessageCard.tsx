import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { Button, ButtonVariant } from './Button';
import { Card } from './Card';
import { IconName } from './iconPaths';

export interface MessageCardProps {
  title: string;
  eyebrow?: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: IconName;
  actionVariant?: ButtonVariant;
  actionBusy?: boolean;
  variant?: 'frost' | 'surface';
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function MessageCard({
  title,
  eyebrow,
  body,
  actionLabel,
  onAction,
  actionIcon,
  actionVariant = 'accent',
  actionBusy,
  variant = 'frost',
  children,
  style,
}: MessageCardProps) {
  return (
    <Card variant={variant} style={[styles.card, style]}>
      {eyebrow ? (
        <AppText variant="eyebrow" tone="accent">
          {eyebrow}
        </AppText>
      ) : null}
      <AppText variant="title" accessibilityRole="header">
        {title}
      </AppText>
      {body ? (
        <AppText variant="body" tone="inkMuted">
          {body}
        </AppText>
      ) : null}
      {children}
      {actionLabel ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          icon={actionIcon}
          variant={actionVariant}
          busy={actionBusy}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Space.xl,
    gap: Space.md,
    alignItems: 'flex-start',
  },
});
