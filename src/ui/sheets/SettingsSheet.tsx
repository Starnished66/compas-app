import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { ConnectionStatus, RemoteAction, RemoteTheme, RemoteUiState } from '../../data/types';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/BottomSheet';
import { Card } from '../components/Card';
import { DisconnectButton } from '../components/DisconnectButton';
import { Divider } from '../components/Divider';
import { Icon } from '../components/Icon';
import { LibrarySyncRow } from '../components/LibrarySyncRow';
import { ListRow } from '../components/ListRow';
import { MiniProgressSetting } from '../components/MiniProgressSetting';
import { PlayerCard } from '../components/PlayerCard';
import { PlayerFeatureList } from '../components/PlayerFeatureList';
import { SegmentedControl, SegmentedOption } from '../components/SegmentedControl';
import { connectionStatusView } from '../connectionSummary';
import { Space } from '../tokens';
import { useConnectedPlayer } from '../useConnectedPlayer';

export interface SettingsSheetProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  visible: boolean;
  onClose: () => void;
  onOpenConnection: () => void;
}

const THEME_OPTIONS: ReadonlyArray<SegmentedOption<RemoteTheme>> = [
  { value: RemoteTheme.Light, label: 'Light' },
  { value: RemoteTheme.Dark, label: 'Dark' },
  { value: RemoteTheme.System, label: 'System' },
];

const CHEVRON_SIZE = 18;

export function SettingsSheet({ state, onAction, visible, onClose, onOpenConnection }: SettingsSheetProps) {
  const player = useConnectedPlayer(state);
  const connected = state.connectionStatus === ConnectionStatus.Connected;
  const disconnected = state.connectionStatus === ConnectionStatus.Disconnected;
  const afterClose = useRef<RemoteAction | null>(null);
  const runAfterClose = () => {
    const action = afterClose.current;
    afterClose.current = null;
    if (action) onAction(action);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} onHidden={runAfterClose} title="Settings">
      <View style={styles.content}>
        <Card variant="surface">
          <PlayerCard
            variant="row"
            name={disconnected ? 'No player' : player.name}
            detail={connected ? player.detail : undefined}
            status={connectionStatusView(state)}
            trailing={
              connected ? (
                <DisconnectButton compact playerName={player.name} onDisconnect={() => onAction({ type: 'Disconnect' })} />
              ) : null
            }
          />
          {connected ? (
            <>
              <Divider />
              <ListRow
                variant="action"
                title="Update saved PIN"
                leading={<Icon name="key" />}
                onPress={() => {
                  afterClose.current = { type: 'ChangePin' };
                  onClose();
                }}
              />
            </>
          ) : null}
          <Divider />
          <ListRow
            variant="action"
            title="Connection and players"
            leading={<Icon name="wifi" />}
            trailing={<Icon name="chevronRight" size={CHEVRON_SIZE} />}
            onPress={() => {
              onClose();
              onOpenConnection();
            }}
          />
        </Card>

        <Card variant="surface">
          <View style={styles.appearance}>
            <AppText variant="body" style={styles.appearanceLabel}>
              Appearance
            </AppText>
            <SegmentedControl
              label="Appearance"
              options={THEME_OPTIONS}
              value={state.theme}
              onChange={(theme) => onAction({ type: 'SetTheme', theme })}
            />
          </View>
          <Divider />
          <MiniProgressSetting />
          {connected ? (
            <>
              <Divider />
              <LibrarySyncRow syncMessage={state.catalogSyncMessage} onSync={() => onAction({ type: 'SyncLibrary' })} />
              <Divider />
              <PlayerFeatureList supportedFeatures={state.supportedFeatures} />
            </>
          ) : null}
        </Card>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.lg,
    gap: Space.md,
  },
  appearance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  appearanceLabel: {
    flex: 1,
  },
});
