import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {
  RemoteUiState,
  RemoteAction,
  ConnectionStatus,
  ConnectionTransport,
  ContentStatus,
  WifiPlayer,
  BluetoothPlayer,
} from '../../data/types';
import { ColorScheme } from '../theme';
import { CardSurface } from '../components/CardSurface';
import { Glyph } from '../components/Glyph';

export interface ConnectionScreenProps {
  state: RemoteUiState;
  colors: ColorScheme;
  onAction: (action: RemoteAction) => void;
}

function statusColor(status: ConnectionStatus): string {
  switch (status) {
    case ConnectionStatus.Connected:
      return '#8DBB50';
    case ConnectionStatus.Connecting:
      return '#E5B65B';
    case ConnectionStatus.Disconnected:
      return '#9CA0A6';
    case ConnectionStatus.Error:
      return '#E06C62';
  }
}

function connectionLabel(status: ConnectionStatus): string {
  switch (status) {
    case ConnectionStatus.Connected:
      return 'Connected';
    case ConnectionStatus.Connecting:
      return 'Connecting…';
    case ConnectionStatus.Disconnected:
      return 'Not connected';
    case ConnectionStatus.Error:
      return 'Connection failed';
  }
}

const ConnectionScreenContent: React.FC<ConnectionScreenProps> = ({
  state,
  colors,
  onAction,
}) => {
  const isWifi = state.selectedConnectionTransport === ConnectionTransport.Wifi;
  const isConnected = state.connectionStatus === ConnectionStatus.Connected;
  const isConnecting = state.connectionStatus === ConnectionStatus.Connecting;
  const isError = state.connectionStatus === ConnectionStatus.Error;

  const canConnect =
    !isConnecting &&
    (isWifi
      ? state.wifiAddress.trim().length > 0
      : state.selectedBluetoothPlayerId != null);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: 'transparent' }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { borderColor: colors.outline }]}
          onPress={() => onAction({ type: 'Back' })}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Glyph name="back" size={20} tint={colors.onSurface} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.onSurface }]}>
          Player connection
        </Text>
      </View>

      <CardSurface colors={colors} style={styles.mainCard}>
        {/* Device Icon & Status */}
        <View style={styles.deviceStatusContainer}>
          <Glyph name="device" size={48} tint={colors.primary} />
          <Text style={[styles.playerName, { color: colors.onSurface }]}>
            {state.playerName}
          </Text>
          <Text
            style={[
              styles.connectionStatus,
              { color: statusColor(state.connectionStatus) },
            ]}
          >
            {connectionLabel(state.connectionStatus)}
          </Text>
          {state.connectionStatus !== ConnectionStatus.Error && !!state.connectionMessage && (
            <Text style={[styles.connectionMessage, { color: colors.onSurfaceVariant }]}>
              {state.connectionMessage}
            </Text>
          )}
        </View>

        {/* Transport Switcher: Wi-Fi / Bluetooth */}
        <View style={styles.transportSwitch}>
          <TouchableOpacity
            style={[
              styles.transportTab,
              isWifi
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.surfaceContainer },
            ]}
            onPress={() =>
              onAction({
                type: 'SelectConnectionTransport',
                transport: ConnectionTransport.Wifi,
              })
            }
          >
            <Text
              style={[
                styles.transportTabText,
                { color: isWifi ? colors.onPrimary : colors.onSurface },
              ]}
            >
              Wi-Fi
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.transportTab,
              !isWifi
                ? { backgroundColor: colors.primary }
                : { backgroundColor: colors.surfaceContainer },
            ]}
            onPress={() =>
              onAction({
                type: 'SelectConnectionTransport',
                transport: ConnectionTransport.Bluetooth,
              })
            }
          >
            <Text
              style={[
                styles.transportTabText,
                { color: !isWifi ? colors.onPrimary : colors.onSurface },
              ]}
            >
              Bluetooth
            </Text>
          </TouchableOpacity>
        </View>

        {/* Wi-Fi View */}
        {isWifi ? (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionHeading, { color: colors.onSurface }]}>
                Available Compás players
              </Text>
              <TouchableOpacity
                onPress={() => onAction({ type: 'RetryWifiDiscovery' })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Glyph name="refresh" size={16} tint={colors.primary} />
              </TouchableOpacity>
            </View>

            {state.wifiDiscoveryStatus === ContentStatus.Loading &&
            state.wifiPlayers.length === 0 ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.hintText, { color: colors.onSurfaceVariant }]}>
                  Searching for players on this Wi-Fi network…
                </Text>
              </View>
            ) : state.wifiPlayers.length > 0 ? (
              <View style={styles.deviceList}>
                {state.wifiPlayers.map((p) => {
                  const selected = state.wifiAddress === p.address;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.deviceRow,
                        {
                          backgroundColor: selected
                            ? `${colors.primary}22`
                            : colors.surfaceContainer,
                          borderColor: selected ? colors.primary : colors.outline,
                        },
                      ]}
                      onPress={() => onAction({ type: 'SelectWifiPlayer', id: p.id })}
                    >
                      <View style={styles.radioContainer}>
                        <View
                          style={[
                            styles.radioOuter,
                            { borderColor: selected ? colors.primary : colors.outline },
                          ]}
                        >
                          {selected && (
                            <View
                              style={[
                                styles.radioInner,
                                { backgroundColor: colors.primary },
                              ]}
                            />
                          )}
                        </View>
                      </View>
                      <View style={styles.deviceInfo}>
                        <Text style={[styles.deviceName, { color: colors.onSurface }]}>
                          {p.name}
                        </Text>
                        <Text style={[styles.deviceAddress, { color: colors.onSurfaceVariant }]}>
                          {p.address}
                        </Text>
                      </View>
                      <Text style={[styles.verifiedBadge, { color: colors.primary }]}>
                        Verified
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : state.wifiDiscoveryStatus === ContentStatus.Empty ? (
              <View style={styles.emptyDiscovery}>
                <Text style={[styles.hintText, { color: colors.onSurfaceVariant }]}>
                  No players found automatically. Enter an address below or search again.
                </Text>
              </View>
            ) : null}

            {/* Manual IP input */}
            <View style={styles.manualInputGroup}>
              <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>
                Player address
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.surfaceContainer,
                    color: colors.onSurface,
                    borderColor: colors.outline,
                  },
                ]}
                value={state.wifiAddress}
                onChangeText={(addr) => onAction({ type: 'SetWifiAddress', address: addr })}
                placeholder="192.168.1.20:8899"
                placeholderTextColor={colors.onSurfaceVariant}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={[styles.inputHint, { color: colors.onSurfaceVariant }]}>
                Enter the IP address and port (default 8899) of your player.
              </Text>
            </View>
          </View>
        ) : (
          /* Bluetooth View */
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionHeading, { color: colors.onSurface }]}>
                Available Compás players
              </Text>
              <TouchableOpacity
                style={[styles.scanButton, { borderColor: colors.primary }]}
                disabled={state.bluetoothScanStatus === ContentStatus.Loading}
                onPress={() => onAction({ type: 'ScanBluetoothPlayers' })}
              >
                {state.bluetoothScanStatus === ContentStatus.Loading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={[styles.scanButtonText, { color: colors.primary }]}>
                    Search
                  </Text>
                )}
              </TouchableOpacity>
            </View>
            <Text style={[styles.hintText, { color: colors.onSurfaceVariant }]}>
              Enable Remote Control on the player. Pair it in Android Settings if it does not appear.
            </Text>

            {state.bluetoothScanStatus === ContentStatus.Loading &&
            state.bluetoothPlayers.length === 0 ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.hintText, { color: colors.onSurfaceVariant }]}>
                  Searching for Compás players…
                </Text>
              </View>
            ) : state.bluetoothPlayers.length > 0 ? (
              <View style={styles.deviceList}>
                {state.bluetoothPlayers.map((p) => {
                  const selected = state.selectedBluetoothPlayerId === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.deviceRow,
                        {
                          backgroundColor: selected
                            ? `${colors.primary}22`
                            : colors.surfaceContainer,
                          borderColor: selected ? colors.primary : colors.outline,
                        },
                      ]}
                      onPress={() => onAction({ type: 'SelectBluetoothPlayer', id: p.id })}
                    >
                      <View style={styles.radioContainer}>
                        <View
                          style={[
                            styles.radioOuter,
                            { borderColor: selected ? colors.primary : colors.outline },
                          ]}
                        >
                          {selected && (
                            <View
                              style={[
                                styles.radioInner,
                                { backgroundColor: colors.primary },
                              ]}
                            />
                          )}
                        </View>
                      </View>
                      <Text
                        style={[styles.deviceName, { color: colors.onSurface, flex: 1 }]}
                        numberOfLines={1}
                      >
                        {p.name}
                      </Text>
                      {p.paired ? (
                        <Text style={[styles.pairedBadge, { color: colors.onSurfaceVariant }]}>
                          Paired
                        </Text>
                      ) : p.bonding ? (
                        <Text style={[styles.pairedBadge, { color: colors.primary }]}>
                          Pairing…
                        </Text>
                      ) : (
                        <TouchableOpacity
                          style={[styles.pairButton, { backgroundColor: colors.primary }]}
                          onPress={() => onAction({ type: 'PairBluetoothPlayer', id: p.id })}
                        >
                          <Text style={[styles.pairButtonText, { color: colors.onPrimary }]}>
                            Pair
                          </Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.hintText, { color: colors.onSurfaceVariant, paddingVertical: 12 }]}>
                No Compás players found. Check Remote Control on the player, then tap Search.
              </Text>
            )}
          </View>
        )}

        {/* Error Diagnostic */}
        {isError && (
          <View style={styles.errorDiagnostic}>
            <Text style={[styles.errorDiagnosticText, { color: '#E06C62' }]}>
              {state.connectionMessage || 'Connection failed'}
            </Text>
            {!isWifi && (
              <Text style={[styles.diagnosticHint, { color: colors.onSurfaceVariant }]}>
                Bluetooth pairing or a calls connection does not guarantee a Compás Remote connection. Check that Remote Control is enabled on the player.
              </Text>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          {isConnected ? (
            <View style={styles.connectedActions}>
              <TouchableOpacity
                style={[styles.btn, styles.outlinedBtn, { borderColor: colors.outline }]}
                onPress={() => onAction({ type: 'ChangePin' })}
              >
                <Text style={[styles.btnText, { color: colors.onSurface }]}>
                  Use different PIN
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.dangerBtn]}
                onPress={() => onAction({ type: 'Disconnect' })}
              >
                <Text style={[styles.btnText, { color: '#FFFFFF', fontWeight: '600' }]}>
                  Disconnect
                </Text>
              </TouchableOpacity>
            </View>
          ) : isConnecting ? (
            <View style={styles.connectingContainer}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.connectingText, { color: colors.onSurfaceVariant }]}>
                Connecting to player…
              </Text>
            </View>
          ) : isError ? (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary }]}
              disabled={state.pinRetryDelaySeconds > 0}
              onPress={() => onAction({ type: 'RetryConnection' })}
            >
              <Text style={[styles.btnText, { color: colors.onPrimary, fontWeight: '600' }]}>
                {state.pinRetryDelaySeconds > 0
                  ? `Wait ${state.pinRetryDelaySeconds}s`
                  : 'Try again'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.btn,
                { backgroundColor: canConnect ? colors.primary : colors.surfaceContainer },
              ]}
              disabled={!canConnect}
              onPress={() => onAction({ type: 'Connect' })}
            >
              <Text
                style={[
                  styles.btnText,
                  {
                    color: canConnect ? colors.onPrimary : colors.onSurfaceVariant,
                    fontWeight: '600',
                  },
                ]}
              >
                Connect
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </CardSurface>

      <Text style={[styles.footerNotice, { color: colors.onSurfaceVariant }]}>
        Connect over Wi-Fi or Bluetooth to browse music and control playback.
      </Text>
    </ScrollView>
  );
};

export const ConnectionScreen = React.memo(ConnectionScreenContent, (before, after) => {
  const a = before.state;
  const b = after.state;
  return before.colors === after.colors && before.onAction === after.onAction &&
    a.bluetoothPlayers === b.bluetoothPlayers && a.bluetoothScanStatus === b.bluetoothScanStatus &&
    a.connectionMessage === b.connectionMessage && a.connectionStatus === b.connectionStatus &&
    a.pinRetryDelaySeconds === b.pinRetryDelaySeconds && a.playerName === b.playerName &&
    a.selectedBluetoothPlayerId === b.selectedBluetoothPlayerId &&
    a.selectedConnectionTransport === b.selectedConnectionTransport &&
    a.wifiAddress === b.wifiAddress && a.wifiDiscoveryStatus === b.wifiDiscoveryStatus &&
    a.wifiPlayers === b.wifiPlayers;
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  mainCard: {
    padding: 20,
  },
  deviceStatusContainer: {
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  playerName: {
    fontSize: 20,
    fontWeight: '700',
  },
  connectionStatus: {
    fontSize: 14,
    fontWeight: '600',
  },
  connectionMessage: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  transportSwitch: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  transportTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  transportTabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionContainer: {
    marginTop: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '600',
  },
  scanButton: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  scanButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  hintText: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  deviceList: {
    gap: 8,
    marginVertical: 8,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  radioContainer: {
    justifyContent: 'center',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 14,
    fontWeight: '500',
  },
  deviceAddress: {
    fontSize: 11,
    marginTop: 1,
  },
  verifiedBadge: {
    fontSize: 11,
    fontWeight: '600',
  },
  pairedBadge: {
    fontSize: 12,
  },
  pairButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pairButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyDiscovery: {
    paddingVertical: 8,
  },
  manualInputGroup: {
    marginTop: 12,
  },
  inputLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputHint: {
    fontSize: 11,
    marginTop: 4,
  },
  errorDiagnostic: {
    marginTop: 14,
    alignItems: 'center',
    gap: 6,
  },
  errorDiagnosticText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  diagnosticHint: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  actionContainer: {
    marginTop: 20,
  },
  connectedActions: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlinedBtn: {
    borderWidth: 1,
  },
  dangerBtn: {
    backgroundColor: '#E06C62',
  },
  btnText: {
    fontSize: 14,
  },
  connectingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  connectingText: {
    fontSize: 14,
  },
  footerNotice: {
    fontSize: 12,
    textAlign: 'center',
  },
});
