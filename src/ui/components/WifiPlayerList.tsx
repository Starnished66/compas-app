import React from 'react';
import { StyleSheet } from 'react-native';
import { ContentStatus, RemoteAction, RemoteUiState } from '../../data/types';
import { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';
import { Card } from './Card';
import { Collapsible } from './Collapsible';
import { DiscoveryHeader } from './DiscoveryHeader';
import { Divider } from './Divider';
import { EnterView } from './EnterView';
import { Icon } from './Icon';
import { ListNotice } from './ListNotice';
import { ListRow } from './ListRow';
import { ManualAddressEntry } from './ManualAddressEntry';
import { PlayerRow } from './PlayerRow';
import { useI18n } from '../../i18n';

export interface WifiPlayerListProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  connectedAddress: string | null;
  manualOpen: boolean;
  onManualOpenChange: (open: boolean) => void;
  onSubmitAddress: () => void;
}

export function WifiPlayerList({
  state,
  onAction,
  connectedAddress,
  manualOpen,
  onManualOpenChange,
  onSubmitAddress,
}: WifiPlayerListProps) {
  const palette = usePalette();
  const { t } = useI18n();
  const searching = state.wifiDiscoveryStatus === ContentStatus.Loading;
  const nothingFound = !searching && state.wifiPlayers.length === 0;
  const selectedAddress = state.wifiAddress.trim();

  return (
    <Card variant="surface" style={styles.card}>
      <DiscoveryHeader
        label={t('On this network')}
        searching={searching}
        onSearch={() => onAction({ type: 'RetryWifiDiscovery' })}
      />
      {state.wifiPlayers.map((player, index) => (
        <EnterView key={player.id} index={index}>
          <PlayerRow
            name={player.name}
            detail={player.address === connectedAddress ? `${player.address} · connected` : player.address}
            selected={!manualOpen && player.address === selectedAddress}
            onPress={() => {
              onManualOpenChange(false);
              onAction({ type: 'SelectWifiPlayer', id: player.id });
            }}
          />
        </EnterView>
      ))}
      {nothingFound && state.wifiDiscoveryStatus === ContentStatus.Error ? (
        <ListNotice
          title={t('Couldn’t search this network')}
          body={t('Check that Wi-Fi is on and that Compás Remote may use the local network, then search again.')}
        />
      ) : nothingFound ? (
        <ListNotice
          title={t('No players found')}
          body={t('Make sure the player is on, on the same Wi-Fi, and has remote control turned on.')}
        />
      ) : null}
      <Divider style={styles.divider} />
      <Collapsible open={!manualOpen}>
        <ListRow
          variant="action"
          title={t('Enter an address instead')}
          onPress={() => onManualOpenChange(true)}
          trailing={<Icon name="chevronRight" size={18} color={palette.ink} />}
        />
      </Collapsible>
      <Collapsible open={manualOpen}>
        <ManualAddressEntry
          active={manualOpen}
          address={state.wifiAddress}
          onChangeAddress={(address) => onAction({ type: 'SetWifiAddress', address })}
          onSubmit={onSubmitAddress}
          onCancel={() => onManualOpenChange(false)}
        />
      </Collapsible>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: Space.sm,
  },
  divider: {
    marginTop: Space.xs,
  },
});
