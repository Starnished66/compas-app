import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ConnectionStatus, ConnectionTransport, RemoteAction, RemoteUiState } from '../../data/types';
import { AppText } from '../components/AppText';
import { BluetoothPlayerList } from '../components/BluetoothPlayerList';
import { Button } from '../components/Button';
import { ConnectFooter } from '../components/ConnectFooter';
import { ConnectionErrorCard } from '../components/ConnectionErrorCard';
import { DisconnectButton } from '../components/DisconnectButton';
import { EnterView } from '../components/EnterView';
import { IconButton } from '../components/IconButton';
import { PlayerCard } from '../components/PlayerCard';
import { SegmentedControl, SegmentedOption } from '../components/SegmentedControl';
import { StatusIndicator } from '../components/StatusIndicator';
import { WifiPlayerList } from '../components/WifiPlayerList';
import { connectedPlayerKey, ConnectTarget, connectTarget } from '../connectTarget';
import { connectionStatusView } from '../connectionSummary';
import { usePalette } from '../PaletteProvider';
import { Size, Space } from '../tokens';
import { useConnectedPlayer } from '../useConnectedPlayer';
import { usePairThenConnect } from '../usePairThenConnect';
import { useScreenInsets } from '../useScreenInsets';
import { insetBeyond } from '../insetBeyond';
import { useI18n } from '../../i18n';
import { localizedMessage } from '../localizedLabels';

export interface ConnectionScreenProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
}

const TRANSPORT_OPTIONS: ReadonlyArray<SegmentedOption<ConnectionTransport>> = [
  { value: ConnectionTransport.Wifi, label: 'Wi-Fi', icon: 'wifi', caption: 'Same network · fastest' },
  { value: ConnectionTransport.Bluetooth, label: 'Bluetooth', icon: 'bluetooth', caption: 'No network needed' },
];

const BLUETOOTH_AVAILABLE = Platform.OS === 'android';
const BACK_BUTTON_OFFSET = -(Size.controlMd - Size.icon) / 2;

function failureAdvice(transport: ConnectionTransport, t: (source: string) => string): string {
  return transport === ConnectionTransport.Bluetooth
    ? t('Check that the player is on and that remote control is turned on in its settings. Being paired for calls or audio isn’t enough.')
    : t('Check that the player is on, on the same Wi-Fi as this phone, and that remote control is turned on.');
}

function connectingLabel(target: ConnectTarget | null, message: string | null | undefined, t: (source: string, variables?: Record<string, string | number>) => string): string {
  if (target) return t('Contacting {name}…', { name: target.name });
  return message ? localizedMessage(message, t) : t('Connecting…');
}

export function ConnectionScreen({ state, onAction }: ConnectionScreenProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const insets = useScreenInsets();
  const [manualOpen, setManualOpen] = useState(false);
  const player = useConnectedPlayer(state);
  const pairAndConnect = usePairThenConnect(state.bluetoothPlayers, onAction);

  const connected = state.connectionStatus === ConnectionStatus.Connected;
  const connecting = state.connectionStatus === ConnectionStatus.Connecting;
  const failed = state.connectionStatus === ConnectionStatus.Error;
  const transport = BLUETOOTH_AVAILABLE ? state.selectedConnectionTransport : ConnectionTransport.Wifi;
  const bluetooth = transport === ConnectionTransport.Bluetooth;
  const status = connectionStatusView(state);

  const target = connectTarget(state, transport, manualOpen);
  const currentKey = connectedPlayerKey(state, player);
  const alreadyConnected = !!target && target.key === currentKey && transport === state.connectionTransport;
  const retryDelay = state.pinRetryDelaySeconds;
  const connect = () => {
    if (target && retryDelay === 0 && !connecting) onAction({ type: 'Connect' });
  };

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: palette.background,
          paddingTop: insets.top,
          paddingBottom: insetBeyond(insets.bottom, Space.xl),
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <View style={styles.header}>
        <IconButton
          icon="chevronLeft"
          label={t('Back')}
          onPress={() => onAction({ type: 'Back' })}
          style={styles.back}
        />
        <AppText variant="title" accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {t('Connect a player')}
        </AppText>
        <StatusIndicator status={status.status} label={t(status.label)} strong />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {connected ? (
          <>
            <PlayerCard name={player.name} detail={player.detail}>
              <View style={styles.playerActions}>
                <Button
                  label={t('Change PIN')}
                  accessibilityLabel={t('Update saved PIN')}
                  variant="container"
                  fill
                  onPress={() => onAction({ type: 'ChangePin' })}
                />
                <DisconnectButton playerName={player.name} onDisconnect={() => onAction({ type: 'Disconnect' })} />
              </View>
            </PlayerCard>
            <AppText variant="eyebrow" tone="inkMuted" style={styles.eyebrow}>
              {t('Switch player')}
            </AppText>
          </>
        ) : null}

        {BLUETOOTH_AVAILABLE ? (
          <SegmentedControl
            size="lg"
            label={t('Connect over')}
            options={TRANSPORT_OPTIONS.map((option) => ({ ...option, caption: t(option.caption ?? '') }))}
            value={transport}
            onChange={(next) => onAction({ type: 'SelectConnectionTransport', transport: next })}
          />
        ) : null}

        {failed ? (
          <EnterView>
            <ConnectionErrorCard
              title={t('Couldn’t connect')}
              message={state.connectionMessage ? localizedMessage(state.connectionMessage, t) : failureAdvice(transport, t)}
              retryDelaySeconds={retryDelay}
              onRetry={() => onAction({ type: 'RetryConnection' })}
            />
          </EnterView>
        ) : null}

        {bluetooth ? (
          <BluetoothPlayerList
            state={state}
            onAction={onAction}
            connectedId={connected && state.connectionTransport === ConnectionTransport.Bluetooth ? player.bluetoothId ?? null : null}
            onPairAndConnect={pairAndConnect}
          />
        ) : (
          <WifiPlayerList
            state={state}
            onAction={onAction}
            connectedAddress={connected && state.connectionTransport === ConnectionTransport.Wifi ? player.wifiAddress : null}
            manualOpen={manualOpen}
            onManualOpenChange={setManualOpen}
            onSubmitAddress={connect}
          />
        )}
      </ScrollView>

      <ConnectFooter
        label={retryDelay > 0
          ? t('Wait {seconds} s', { seconds: retryDelay })
          : target
            ? t(connected ? 'Switch to {name}' : 'Connect to {name}', { name: target.name })
            : t(!bluetooth && manualOpen ? 'Enter an address' : 'Choose a player')}
        showButton={!alreadyConnected}
        disabled={!target || retryDelay > 0}
        connecting={connecting}
        connectingLabel={connectingLabel(target, state.connectionMessage, t)}
        notice={state.connectionStatus === ConnectionStatus.Disconnected ? state.connectionMessage : null}
        onConnect={connect}
        onCancel={() => onAction({ type: 'Disconnect' })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    height: Size.bar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.lg,
  },
  back: {
    marginLeft: BACK_BUTTON_OFFSET - Space.xs,
  },
  title: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.lg,
    gap: Space.md,
  },
  playerActions: {
    flexDirection: 'row',
    gap: Space.md,
  },
  eyebrow: {
    paddingTop: Space.xs,
  },
});
