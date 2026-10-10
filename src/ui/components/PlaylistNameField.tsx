import React, { useEffect, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { PLAYLIST_NAME_MAX_BYTES, playlistNameBytes } from '../playlistName';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { InlineError } from './InlineError';
import { TextField } from './TextField';

export interface PlaylistNameFieldProps {
  value: string;
  issue: string | null;
  onChangeText: (name: string) => void;
  onSubmit: () => void;
  editable?: boolean;
}

const FOCUS_DELAY_MS = 50;

export function PlaylistNameField({ value, issue, onChangeText, onSubmit, editable = true }: PlaylistNameFieldProps) {
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.field}>
      <TextField
        inputRef={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder="Playlist name"
        accessibilityLabel="Playlist name"
        invalid={Boolean(issue)}
        editable={editable}
        autoFocus
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />
      <View style={styles.hintRow}>
        <View style={styles.issue}>{issue ? <InlineError message={issue} /> : null}</View>
        <AppText variant="caption" tone="inkMuted" tabular>
          {`${playlistNameBytes(value)} / ${PLAYLIST_NAME_MAX_BYTES} bytes`}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Space.md,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    minHeight: Space.lg,
  },
  issue: {
    flex: 1,
  },
});
