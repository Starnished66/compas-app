import React, { useEffect, useState } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { usePopAnimation } from '../usePopAnimation';
import { IconButton } from './IconButton';
import { useI18n } from '../../i18n';

export interface FavoriteButtonProps {
  favorite: boolean;
  onChange: (favorite: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const OPTIMISTIC_HOLD_MS = 4000;

export function FavoriteButton({ favorite, onChange, disabled = false, style }: FavoriteButtonProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const shown = optimistic ?? favorite;
  const pop = usePopAnimation(shown);

  useEffect(() => setOptimistic(null), [favorite]);

  useEffect(() => {
    if (optimistic === null) return;
    const timer = setTimeout(() => setOptimistic(null), OPTIMISTIC_HOLD_MS);
    return () => clearTimeout(timer);
  }, [optimistic]);

  const toggle = () => {
    const next = !shown;
    setOptimistic(next);
    onChange(next);
  };

  return (
    <Animated.View style={[pop, style]}>
      <IconButton
        icon="heart"
        filled={shown}
        color={shown ? palette.accent : palette.ink}
        label={shown ? t('Remove from favorites') : t('Add to favorites')}
        onPress={toggle}
        disabled={disabled}
      />
    </Animated.View>
  );
}
