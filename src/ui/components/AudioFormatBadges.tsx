import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { RemoteTrack } from '../../data/types';
import { describeAudioFormat } from '../audioFormat';
import { Palette } from '../palette';
import { usePalette } from '../PaletteProvider';
import { Radius, Space } from '../tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useI18n } from '../../i18n';

export interface AudioFormatBadgesProps {
  track: RemoteTrack | null | undefined;
  variant?: 'chips' | 'line';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const CHEVRON_SIZE = 14;
const CHEVRON_STROKE = 2;
const BADGE_VERTICAL_PADDING = 2;

function renderBadge(key: string, text: string, highlighted: boolean, palette: Palette) {
  return (
    <View
      key={key}
      style={[
        styles.badge,
        highlighted
          ? { backgroundColor: palette.accentContainer, borderColor: palette.accentContainer }
          : { borderColor: palette.outline },
      ]}
    >
      <AppText
        variant="micro"
        tone={highlighted ? 'onAccentContainer' : 'inkMuted'}
        tabular
        numberOfLines={1}
        style={highlighted && styles.highlightedText}
      >
        {text}
      </AppText>
    </View>
  );
}

export function AudioFormatBadges({ track, variant = 'chips', onPress, style }: AudioFormatBadgesProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const format = describeAudioFormat(track);
  if (!format) return null;

  const content =
    variant === 'line' ? (
      <>
        {renderBadge('line', format.hiRes ? `${t('Hi-res')} · ${format.line}` : format.line, format.hiRes, palette)}
        {onPress ? (
          <Icon name="chevronRight" size={CHEVRON_SIZE} strokeWidth={CHEVRON_STROKE} color={palette.inkMuted} />
        ) : null}
      </>
    ) : (
      <>
        {format.hiRes ? renderBadge('hires', t('Hi-res'), true, palette) : null}
        {format.parts.map((part) => renderBadge(part, part, false, palette))}
      </>
    );

  const rowStyle = [variant === 'line' ? styles.line : styles.chips, style];

  if (!onPress) return <View style={rowStyle}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Audio format details')}
      accessibilityHint={format.line}
      onPress={onPress}
      style={({ pressed }) => [rowStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Space.xs,
  },
  badge: {
    paddingHorizontal: Space.sm,
    paddingVertical: BADGE_VERTICAL_PADDING,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  highlightedText: {
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
