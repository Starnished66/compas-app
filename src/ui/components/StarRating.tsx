import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useI18n } from '../../i18n';
import { usePalette } from '../PaletteProvider';
import { Radius, Size, Space } from '../tokens';
import { Icon } from './Icon';
import { Spinner } from './Spinner';

interface StarRatingProps {
  rating: number;
  onChange?: (rating: number) => void;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}

const STARS = [1, 2, 3, 4, 5];

export function StarRating({ rating, onChange, disabled = false, busy = false, style }: StarRatingProps) {
  const { t } = useI18n();
  const palette = usePalette();

  return (
    <View style={[styles.row, style]} accessible={!onChange}
      accessibilityLabel={onChange ? undefined : t('{count} stars', { count: rating })}>
      {STARS.map((count) => {
        const filled = count <= rating;
        const selected = count === rating;
        const glyph = <Icon name="star" size={onChange ? 22 : 14} color={filled ? palette.accent : palette.inkMuted} filled={filled} />;
        return onChange ? (
          <Pressable
            key={count}
            accessibilityRole="button"
            accessibilityLabel={t('{count} stars', { count })}
            accessibilityHint={selected ? t('Clear rating') : undefined}
            accessibilityState={{ disabled: disabled || busy, selected, busy }}
            disabled={disabled || busy}
            onPress={() => onChange(selected ? 0 : count)}
            style={({ pressed }) => [styles.button, pressed && { backgroundColor: palette.surfaceRaised }]}
          >
            {glyph}
          </Pressable>
        ) : <React.Fragment key={count}>{glyph}</React.Fragment>;
      })}
      {onChange && busy ? <Spinner style={styles.spinner} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  spinner: { marginStart: Space.sm },
  button: {
    width: Size.hitTarget,
    height: Size.hitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
});
