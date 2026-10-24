import React, { Ref } from 'react';
import { StyleProp, StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Radius, Size, Space, Type } from '../tokens';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { IconName } from './iconPaths';
import { useI18n } from '../../i18n';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  icon?: IconName;
  onClear?: () => void;
  clearLabel?: string;
  invalid?: boolean;
  size?: 'md' | 'lg';
  inputRef?: Ref<TextInput>;
  style?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
}

const FIELD_ICON_SIZE = 20;
const CLEAR_ICON_SIZE = 18;
const LARGE_LETTER_SPACING = 8;

export function TextField({
  icon,
  onClear,
  clearLabel,
  invalid = false,
  size = 'md',
  inputRef,
  style,
  inputStyle,
  value,
  editable = true,
  ...inputProps
}: TextFieldProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const large = size === 'lg';
  const showClear = Boolean(onClear) && Boolean(value) && editable;

  return (
    <View
      style={[
        styles.field,
        {
          height: large ? Size.controlLg : Size.controlMd,
          backgroundColor: palette.surfaceRaised,
          borderColor: invalid ? palette.statusError : 'transparent',
          paddingLeft: Space.md,
          paddingRight: showClear ? Space.xs : Space.md,
        },
        !editable && styles.disabled,
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={FIELD_ICON_SIZE} color={palette.inkMuted} /> : null}
      <TextInput
        ref={inputRef}
        value={value}
        editable={editable}
        placeholderTextColor={palette.inkMuted}
        selectionColor={palette.accent}
        cursorColor={palette.accent}
        {...inputProps}
        style={[
          styles.input,
          { color: palette.ink },
          large ? styles.largeInput : styles.mediumInput,
          inputStyle,
        ]}
      />
      {showClear ? (
        <IconButton
          icon="close"
          label={clearLabel ?? t('Clear')}
          size="sm"
          iconSize={CLEAR_ICON_SIZE}
          color={palette.inkMuted}
          onPress={onClear}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    padding: 0,
  },
  mediumInput: {
    fontSize: Type.bodyStrong.fontSize,
    fontWeight: Type.body.fontWeight,
  },
  largeInput: {
    fontSize: Type.title.fontSize,
    fontWeight: Type.body.fontWeight,
    letterSpacing: LARGE_LETTER_SPACING,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  disabled: {
    opacity: 0.6,
  },
});
