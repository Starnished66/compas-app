import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '../components/Button';
import { PlaylistNameField } from '../components/PlaylistNameField';
import { SheetStepTitle } from '../components/SheetStepTitle';
import { Space } from '../tokens';
import { usePlaylistNameInput } from '../usePlaylistNameInput';

export interface PlaylistNameStepProps {
  title: string;
  message?: string;
  initialName?: string;
  confirmLabel: string;
  takenNames?: readonly string[];
  busy?: boolean;
  requireChange?: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

export function PlaylistNameStep({
  title,
  message,
  initialName = '',
  confirmLabel,
  takenNames,
  busy = false,
  requireChange = true,
  onSubmit,
  onCancel,
}: PlaylistNameStepProps) {
  const { name, setName, issue, canSubmit } = usePlaylistNameInput(
    true,
    initialName,
    takenNames,
    requireChange,
  );

  const submit = () => {
    if (canSubmit && !busy) onSubmit(name);
  };

  return (
    <View style={styles.step}>
      <SheetStepTitle title={title} caption={message} style={styles.title} />
      <PlaylistNameField value={name} issue={issue} onChangeText={setName} onSubmit={submit} editable={!busy} />
      <View style={styles.actions}>
        <Button label="Cancel" variant="raised" fill onPress={onCancel} />
        <Button label={confirmLabel} fill disabled={!canSubmit} busy={busy} onPress={submit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: {
    gap: Space.md,
    paddingHorizontal: Space.xl,
    paddingBottom: Space.sm,
  },
  title: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.md,
  },
});
