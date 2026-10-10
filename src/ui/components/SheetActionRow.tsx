import React from 'react';
import { usePalette } from '../PaletteProvider';
import { Size } from '../tokens';
import { Icon } from './Icon';
import { IconName } from './iconPaths';
import { ListRow } from './ListRow';
import { Spinner } from './Spinner';

export interface SheetActionRowProps {
  icon: IconName;
  label: string;
  subtitle?: string;
  onPress: () => void;
  iconColor?: string;
  iconFilled?: boolean;
  disabled?: boolean;
  busy?: boolean;
}

export function SheetActionRow({
  icon,
  label,
  subtitle,
  onPress,
  iconColor,
  iconFilled = false,
  disabled = false,
  busy = false,
}: SheetActionRowProps) {
  const palette = usePalette();
  return (
    <ListRow
      variant="action"
      title={label}
      subtitle={subtitle}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={subtitle ? `${label}. ${subtitle}` : label}
      trailing={busy ? <Spinner /> : undefined}
      leading={<Icon name={icon} size={Size.icon} color={iconColor ?? palette.ink} filled={iconFilled} />}
    />
  );
}
