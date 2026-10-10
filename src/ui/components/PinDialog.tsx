import React, { RefObject, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, TextInput, View } from 'react-native';
import { ConnectionStatus, RemoteAction, RemoteUiState } from '../../data/types';
import { Durations, Easings } from '../motion';
import { Space } from '../tokens';
import { useConnectedPlayer } from '../useConnectedPlayer';
import { useReducedMotion } from '../useReducedMotion';
import { AppText } from './AppText';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { InlineError } from './InlineError';
import { StatusIndicator } from './StatusIndicator';
import { TextField } from './TextField';

export interface PinDialogProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
}

const PIN_PATTERN = /^[0-9]{4,12}$/;
const PIN_MAX_LENGTH = 12;
const LOCK_MESSAGE_LINES = 2;
const SHAKE_STEPS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const SHAKE_OFFSETS = [0, -10, 8, -6, 4, 0];

function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function useOpenedWhileConnected(visible: boolean, connected: boolean): boolean {
  const [openedWhileConnected, setOpenedWhileConnected] = useState(connected);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setOpenedWhileConnected(connected);
  }
  return openedWhileConnected;
}

function useRejectedPinFeedback(
  visible: boolean,
  pinError: string | null | undefined,
  status: ConnectionStatus,
  pinLength: number,
  locked: boolean,
  inputRef: RefObject<TextInput | null>,
) {
  const reducedMotion = useReducedMotion();
  const shake = useRef(new Animated.Value(1)).current;
  const previous = useRef({ visible, pinError, status });

  useEffect(() => {
    const before = previous.current;
    previous.current = { visible, pinError, status };
    const attemptFinished = before.status === ConnectionStatus.Connecting && status !== ConnectionStatus.Connecting;
    const newRejection = !!pinError && (pinError !== before.pinError || attemptFinished);
    if (!visible || !before.visible || locked || !newRejection) return;
    inputRef.current?.focus();
    inputRef.current?.setSelection(0, pinLength);
    if (reducedMotion) return;
    shake.setValue(0);
    Animated.timing(shake, {
      toValue: 1,
      duration: Durations.pinShake,
      easing: Easings.easeOut,
      useNativeDriver: true,
    }).start();
  }, [inputRef, locked, pinError, pinLength, reducedMotion, shake, status, visible]);

  return { transform: [{ translateX: shake.interpolate({ inputRange: SHAKE_STEPS, outputRange: SHAKE_OFFSETS }) }] };
}

export function PinDialog({ state, onAction }: PinDialogProps) {
  const player = useConnectedPlayer(state);
  const updating = useOpenedWhileConnected(
    state.pinDialogVisible,
    state.connectionStatus === ConnectionStatus.Connected,
  );
  const lockSeconds = state.pinRetryDelaySeconds;
  const locked = lockSeconds > 0;
  const submitting = state.connectionStatus === ConnectionStatus.Connecting;
  const canSubmit = !locked && !submitting && PIN_PATTERN.test(state.pinInput);
  const inputRef = useRef<TextInput>(null);
  const shakeStyle = useRejectedPinFeedback(
    state.pinDialogVisible,
    state.pinError,
    state.connectionStatus,
    state.pinInput.length,
    locked,
    inputRef,
  );

  const submit = () => {
    if (canSubmit) onAction({ type: 'SubmitPin' });
  };
  const dismiss = () => onAction({ type: 'DismissPin' });

  const title = updating ? 'Update saved PIN' : 'Enter the player’s PIN';
  const message = updating
    ? `Enter the PIN set on ${player.name}. This changes the PIN this phone sends. It doesn’t change the PIN on the player.`
    : `${player.name} asks for a PIN before it accepts a remote. You’ll find it in the player’s remote control settings.`;
  const submitLabel = locked ? `Wait ${lockSeconds} s` : updating ? 'Save' : 'Connect';

  return (
    <Dialog
      visible={state.pinDialogVisible}
      onClose={dismiss}
      title={title}
      message={message}
      actions={
        <>
          <Button label="Cancel" variant="raised" fill onPress={dismiss} />
          <Button label={submitLabel} fill disabled={!canSubmit} busy={submitting} onPress={submit} />
        </>
      }
    >
      <View style={styles.field}>
        <Animated.View style={shakeStyle}>
          <TextField
            size="lg"
            value={state.pinInput}
            onChangeText={(text) =>
              onAction({ type: 'SetPinInput', value: text.replace(/\D/g, '').slice(0, PIN_MAX_LENGTH) })
            }
            invalid={!!state.pinError && !locked}
            editable={!locked}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={PIN_MAX_LENGTH}
            placeholder="••••"
            accessibilityLabel="PIN"
            textContentType="oneTimeCode"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            inputRef={inputRef}
          />
        </Animated.View>
        <AppText variant="caption" tone="inkMuted">
          4–12 digits. Saved on this phone once the player accepts it.
        </AppText>
        {locked ? (
          <StatusIndicator
            status="busy"
            pulse={false}
            dotSize="sm"
            numberOfLines={LOCK_MESSAGE_LINES}
            label={`Too many tries. Try again in ${formatCountdown(lockSeconds)}.`}
          />
        ) : state.pinError ? (
          <InlineError message={state.pinError} />
        ) : null}
      </View>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Space.sm,
  },
});
