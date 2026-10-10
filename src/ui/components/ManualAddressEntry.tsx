import React, { useEffect, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { checkPlayerAddress, playerAddressHint } from '../playerAddress';
import { Space, Type } from '../tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { StatusIndicator } from './StatusIndicator';
import { TextField } from './TextField';

export interface ManualAddressEntryProps {
  active: boolean;
  address: string;
  onChangeAddress: (address: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const ADDRESS_HINT_LINES = 2;

export function ManualAddressEntry({ active, address, onChangeAddress, onSubmit, onCancel }: ManualAddressEntryProps) {
  const invalid = checkPlayerAddress(address) === 'invalid';
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (active) inputRef.current?.focus();
    else inputRef.current?.blur();
  }, [active]);

  return (
    <View style={styles.entry}>
      <View style={styles.labelRow}>
        <AppText variant="caption" style={styles.label}>
          Player address
        </AppText>
        <Button label="Cancel" variant="plain" size="sm" onPress={onCancel} />
      </View>
      <TextField
        value={address}
        onChangeText={onChangeAddress}
        onClear={() => onChangeAddress('')}
        invalid={invalid}
        placeholder="192.168.1.20:8899"
        accessibilityLabel="Player address"
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        inputRef={inputRef}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      <StatusIndicator
        status={invalid ? 'error' : 'idle'}
        label={playerAddressHint(address)}
        dotSize="sm"
        tone="inkMuted"
        numberOfLines={ADDRESS_HINT_LINES}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  entry: {
    gap: Space.sm,
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    paddingBottom: Space.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    flex: 1,
    fontWeight: Type.micro.fontWeight,
  },
});
