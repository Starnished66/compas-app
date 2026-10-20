import React, { useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Size, Space } from '../tokens';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { Slider } from './Slider';
import { useI18n } from '../../i18n';

export interface VolumeRowProps {
  volume: number;
  onChange: (volume: number) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

function percent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function VolumeRow({ volume, onChange, disabled = false, style }: VolumeRowProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const [dragVolume, setDragVolume] = useState<number | null>(null);
  const shown = dragVolume ?? volume;

  const commit = (value: number) => {
    setDragVolume(null);
    onChange(value);
  };

  return (
    <View style={[styles.row, style]}>
      <Icon name="volume" color={palette.inkMuted} />
      <Slider
        value={shown}
        label={t('Player volume')}
        disabled={disabled}
        formatValue={percent}
        showValueBubble={false}
        onChange={setDragVolume}
        onCommit={commit}
        style={styles.slider}
      />
      <AppText variant="caption" tone="inkMuted" tabular style={styles.value}>
        {percent(shown)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  slider: {
    flex: 1,
  },
  value: {
    width: Size.controlSm,
    textAlign: 'right',
  },
});
