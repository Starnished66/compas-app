import React from 'react';
import { StyleSheet } from 'react-native';
import { BluetoothPlayer, ContentStatus, RemoteAction, RemoteUiState } from '../../data/types';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import { DiscoveryHeader } from './DiscoveryHeader';
import { EnterView } from './EnterView';
import { ListNotice } from './ListNotice';
import { PlayerRow } from './PlayerRow';
import { Spinner } from './Spinner';
import { useI18n } from '../../i18n';

export interface BluetoothPlayerListProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  connectedId: string | null;
  onPairAndConnect: (id: string) => void;
}

function pairingDetail(player: BluetoothPlayer, connected: boolean, t: (source: string) => string): string {
  if (player.bonding) return t('Pairing…');
  if (!player.paired) return t('Not paired');
  return connected ? t('Paired · connected') : t('Paired');
}

export function BluetoothPlayerList({ state, onAction, connectedId, onPairAndConnect }: BluetoothPlayerListProps) {
  const { t } = useI18n();
  const searching = state.bluetoothScanStatus === ContentStatus.Loading;
  const nothingFound = !searching && state.bluetoothPlayers.length === 0;

  return (
    <Card variant="surface" style={styles.card}>
      <DiscoveryHeader
        label={t('Nearby players')}
        searching={searching}
        onSearch={() => onAction({ type: 'ScanBluetoothPlayers' })}
      />
      {state.bluetoothPlayers.map((player, index) => {
        const selected = player.paired && player.id === state.selectedBluetoothPlayerId;
        const connected = !!connectedId && player.id.toLowerCase() === connectedId.toLowerCase();
        return (
          <EnterView key={player.id} index={index}>
            <PlayerRow
              name={player.name}
              detail={pairingDetail(player, connected, t)}
              selected={selected}
              onPress={() => {
                if (player.paired) onAction({ type: 'SelectBluetoothPlayer', id: player.id });
                else if (!player.bonding) onPairAndConnect(player.id);
              }}
              trailing={
                player.bonding ? (
                  <Spinner />
                ) : !player.paired ? (
                  <Button
                    label={t('Pair & connect')}
                    variant="container"
                    size="sm"
                    accessibilityLabel={t('Pair and connect to {name}', { name: player.name })}
                    onPress={() => onPairAndConnect(player.id)}
                  />
                ) : undefined
              }
            />
          </EnterView>
        );
      })}
      {nothingFound && state.bluetoothScanStatus === ContentStatus.Error ? (
        <ListNotice
          title={t('Couldn’t search for players')}
          body={t('Turn Bluetooth on and allow Nearby devices for Compás Remote, then search again.')}
        />
      ) : nothingFound ? (
        <ListNotice
          title={t('No players found')}
          body={t('Turn on remote control on the player, then search again. If it still doesn’t appear, pair it in Android Settings.')}
        />
      ) : null}
      <AppText variant="caption" tone="inkMuted" style={styles.footnote}>
        {t('Only Compás players with remote control turned on are listed.')}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: Space.sm,
  },
  footnote: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
  },
});
