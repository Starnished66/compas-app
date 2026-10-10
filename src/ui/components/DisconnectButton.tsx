import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { usePalette } from '../PaletteProvider';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { IconButton } from './IconButton';

export interface DisconnectButtonProps {
  playerName: string;
  onDisconnect: () => void;
  compact?: boolean;
}

const COMPACT_ICON_SIZE = 20;
const COMPACT_PRESS_SCALE = 0.92;

export function DisconnectButton({ playerName, onDisconnect, compact = false }: DisconnectButtonProps) {
  const palette = usePalette();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      {compact ? (
        <IconButton
          icon="power"
          label="Disconnect"
          variant="raised"
          iconSize={COMPACT_ICON_SIZE}
          pressScale={COMPACT_PRESS_SCALE}
          color={palette.statusError}
          style={[styles.compact, { borderColor: palette.outline }]}
          onPress={() => setConfirming(true)}
        />
      ) : (
        <Button
          label="Disconnect"
          icon="power"
          iconColor={palette.statusError}
          variant="raised"
          fill
          onPress={() => setConfirming(true)}
        />
      )}
      <ConfirmDialog
        visible={confirming}
        title={`Disconnect from ${playerName}?`}
        message="Automatic reconnect turns off until you connect again."
        confirmLabel="Disconnect"
        destructive
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          onDisconnect();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  compact: {
    borderWidth: 1,
  },
});
