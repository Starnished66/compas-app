import React from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { usePopAnimation } from '../usePopAnimation';
import { IconButton } from './IconButton';
import { useI18n } from '../../i18n';

export interface FavoriteButtonProps {
  rating: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function FavoriteButton({ rating, onChange, disabled = false, style }: FavoriteButtonProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const favorite = rating > 0;
  const pop = usePopAnimation(favorite);

  return (
    <Animated.View style={[pop, style]}>
      <IconButton
        icon="heart"
        filled={favorite}
        color={favorite ? palette.accent : palette.ink}
        label={favorite ? t('Remove from favorites') : t('Add to favorites')}
        onPress={() => onChange(favorite ? 0 : 5)}
        disabled={disabled}
      />
    </Animated.View>
  );
}
