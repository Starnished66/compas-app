import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ConnectionStatus, LibraryCategory, RemoteAction, RemoteUiState } from '../../data/types';
import { Size, Space } from '../tokens';
import { HomeTitleBar } from './HomeTitleBar';
import { MessageCard } from './MessageCard';
import { unclippedScroll } from '../unclippedScroll';

export interface HomeEmptyStateProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  onOpenSettings: () => void;
  settingsOpen?: boolean;
  bottomInset: number;
}

const CARD_OFFSET = 120;

interface EmptyMessage {
  eyebrow: string;
  title: string;
  body: string;
  actionLabel: string;
  action: RemoteAction;
}

function emptyMessage(state: RemoteUiState): EmptyMessage {
  const playerName = state.playerName || 'the player';
  switch (state.connectionStatus) {
    case ConnectionStatus.Connected:
      return {
        eyebrow: 'Nothing playing',
        title: 'The queue on the player is empty',
        body: 'Pick an album, playlist or song to start playing on the player.',
        actionLabel: 'Browse library',
        action: { type: 'OpenLibrary', category: LibraryCategory.Albums },
      };
    case ConnectionStatus.Connecting:
      return {
        eyebrow: 'Connecting…',
        title: `Connecting to ${playerName}…`,
        body: 'Playback controls appear here once the player answers.',
        actionLabel: 'Connection and players',
        action: { type: 'OpenConnection' },
      };
    case ConnectionStatus.Error:
      return {
        eyebrow: 'Connection failed',
        title: `Couldn’t reach ${playerName}`,
        body: state.connectionMessage || 'Check that the player is on and nearby, then try again.',
        actionLabel: 'Try again',
        action: { type: 'RetryConnection' },
      };
    default:
      return {
        eyebrow: 'Not connected',
        title: 'Connect to a player',
        body: 'Find your player on Wi-Fi or Bluetooth to control what it plays.',
        actionLabel: 'Choose a player',
        action: { type: 'OpenConnection' },
      };
  }
}

export function HomeEmptyState({ state, onAction, onOpenSettings, settingsOpen, bottomInset }: HomeEmptyStateProps) {
  const message = emptyMessage(state);
  return (
    <View style={styles.root}>
      <ScrollView
        style={unclippedScroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        <MessageCard
          eyebrow={message.eyebrow}
          title={message.title}
          body={message.body}
          actionLabel={message.actionLabel}
          onAction={() => onAction(message.action)}
        />
      </ScrollView>
      <HomeTitleBar onOpenSettings={onOpenSettings} settingsOpen={settingsOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingTop: Size.bar + CARD_OFFSET,
    paddingHorizontal: Space.lg,
  },
});
