import React from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { ColorScheme } from '../theme';

export interface PinDialogProps {
  visible: boolean;
  pinInput: string;
  error?: string | null;
  cooldownSeconds: number;
  colors: ColorScheme;
  onPinChange: (text: string) => void;
  onSubmit: () => void;
  onDismiss: () => void;
}

export const PinDialog: React.FC<PinDialogProps> = ({
  visible,
  pinInput,
  error,
  cooldownSeconds,
  colors,
  onPinChange,
  onSubmit,
  onDismiss,
}) => {
  const isCooldown = cooldownSeconds > 0;
  const canSubmit = !isCooldown && /^[0-9]{4,12}$/.test(pinInput);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.dialog,
            {
              backgroundColor: colors.surface,
              borderColor: colors.outline,
            },
          ]}
        >
          <Text style={[styles.title, { color: colors.onSurface }]}>
            Enter PIN
          </Text>
          <Text style={[styles.message, { color: colors.onSurfaceVariant }]}>
            Enter the 4-12 digit PIN displayed on the Compás player to pair.
          </Text>

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceVariant,
                color: colors.onSurface,
                borderColor: error ? '#E06C62' : colors.outline,
              },
            ]}
            value={pinInput}
            onChangeText={onPinChange}
            keyboardType="number-pad"
            secureTextEntry
            placeholder="PIN (4-12 digits)"
            placeholderTextColor={colors.onSurfaceVariant}
            maxLength={12}
            editable={!isCooldown}
            autoFocus
          />

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : isCooldown ? (
            <Text style={[styles.cooldownText, { color: colors.onSurfaceVariant }]}>
              Too many attempts. Try again in {cooldownSeconds}s
            </Text>
          ) : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onDismiss}
            >
              <Text style={[styles.buttonText, { color: colors.onSurfaceVariant }]}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.submitButton,
                {
                  backgroundColor: canSubmit ? colors.primary : colors.surfaceVariant,
                },
              ]}
              onPress={onSubmit}
              disabled={!canSubmit}
            >
              <Text
                style={[
                  styles.buttonText,
                  {
                    color: canSubmit ? colors.onPrimary : colors.onSurfaceVariant,
                    fontWeight: '600',
                  },
                ]}
              >
                Submit
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 8,
  },
  errorText: {
    color: '#E06C62',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  cooldownText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 12,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  cancelButton: {},
  submitButton: {},
  buttonText: {
    fontSize: 15,
  },
});
