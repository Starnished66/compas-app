import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ConnectionStatus, LibraryCategory, RemoteAction, RemoteUiState } from '../../data/types';
import { Size, Space } from '../tokens';
import { HomeTitleBar } from './HomeTitleBar';
import { MessageCard } from './MessageCard';
import { unclippedScroll } from '../unclippedScroll';
import { useI18n } from '../../i18n';
import { localizedMessage } from '../localizedLabels';

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

function emptyMessage(state: RemoteUiState, t: (source: string, variables?: Record<string, string | number>) => string): EmptyMessage {
  const playerName = state.playerName || t('the player');
  switch (state.connectionStatus) {
    case ConnectionStatus.Connected:
      return {
        eyebrow: t('Nothing playing'),
        title: t('The queue on the player is empty'),
        body: t('Pick an album, playlist or song to start playing on the player.'),
        actionLabel: t('Browse library'),
        action: { type: 'OpenLibrary', category: LibraryCategory.Albums },
      };
    case ConnectionStatus.Connecting:
      return {
        eyebrow: t('Connecting…'),
        title: t('Connecting to {name}…', { name: playerName }),
        body: t('Playback controls appear here once the player answers.'),
        actionLabel: t('Connection and players'),
        action: { type: 'OpenConnection' },
      };
    case ConnectionStatus.Error:
      return {
        eyebrow: t('Connection failed'),
        title: t('Couldn’t reach {name}', { name: playerName }),
        body: state.connectionMessage ? localizedMessage(state.connectionMessage, t) : t('Check that the player is on and nearby, then try again.'),
        actionLabel: t('Try again'),
        action: { type: 'RetryConnection' },
      };
    default:
      return {
        eyebrow: t('Not connected'),
        title: t('Connect to a player'),
        body: t('Find your player on Wi-Fi or Bluetooth to control what it plays.'),
        actionLabel: t('Choose a player'),
        action: { type: 'OpenConnection' },
      };
  }
}

export function HomeEmptyState({ state, onAction, onOpenSettings, settingsOpen, bottomInset }: HomeEmptyStateProps) {
  const { t } = useI18n();
  const message = emptyMessage(state, t);
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
