import React from 'react';
import { StyleSheet, View } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Radius, Size, Space } from '../tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { useI18n } from '../../i18n';

export interface ConnectFooterProps {
  label: string;
  showButton: boolean;
  disabled: boolean;
  connecting: boolean;
  connectingLabel: string;
  notice?: string | null;
  onConnect: () => void;
  onCancel: () => void;
}

export function ConnectFooter({
  label,
  showButton,
  disabled,
  connecting,
  connectingLabel,
  notice,
  onConnect,
  onCancel,
}: ConnectFooterProps) {
  const palette = usePalette();
  const { t } = useI18n();
  if (!connecting && !showButton && !notice) return null;

  return (
    <View style={[styles.footer, { borderTopColor: palette.outline, backgroundColor: palette.background }]}>
      {notice ? (
        <AppText variant="caption" tone="inkMuted" accessibilityLiveRegion="polite">
          {t(notice)}
        </AppText>
      ) : null}
      {connecting ? (
        <>
          <View
            accessible
            accessibilityLabel={connectingLabel}
            accessibilityLiveRegion="polite"
            style={[styles.progress, { backgroundColor: palette.accent }]}
          >
            <Spinner color={palette.onAccent} />
            <AppText variant="bodyStrong" tone="onAccent" numberOfLines={1}>
              {connectingLabel}
            </AppText>
          </View>
          <Button label={t('Cancel')} variant="plain" onPress={onCancel} />
        </>
      ) : showButton ? (
        <Button label={label} size="lg" disabled={disabled} onPress={onConnect} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    paddingBottom: Space.xl,
    gap: Space.sm,
  },
  progress: {
    height: Size.controlLg,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
  },
});
