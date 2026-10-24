import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ConnectionStatus, ConnectionTransport, LibrarySortMode, LibrarySortScope, RemoteAction, RemoteTheme, RemoteUiState } from '../../data/types';
import { AccentSetting } from '../components/AccentSetting';
import { AppText } from '../components/AppText';
import { BackgroundSetting } from '../components/BackgroundSetting';
import { BottomSheet } from '../components/BottomSheet';
import { Card } from '../components/Card';
import { DisconnectButton } from '../components/DisconnectButton';
import { Divider } from '../components/Divider';
import { Icon } from '../components/Icon';
import { LibrarySyncRow } from '../components/LibrarySyncRow';
import { ListRow } from '../components/ListRow';
import { MiniProgressSetting } from '../components/MiniProgressSetting';
import { LibrarySortingSetting } from '../components/LibrarySortingSetting';
import { PlayerCard } from '../components/PlayerCard';
import { PlayerFeatureList } from '../components/PlayerFeatureList';
import { PreferenceSetting } from '../components/PreferenceSetting';
import { SegmentedOption } from '../components/SegmentedControl';
import { connectionStatusView } from '../connectionSummary';
import { Space } from '../tokens';
import { useConnectedPlayer } from '../useConnectedPlayer';
import { useUpdates } from '../../updates/UpdatesProvider';
import { LANGUAGE_OPTIONS, useI18n } from '../../i18n';
import { Button } from '../components/Button';

export interface SettingsSheetProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  visible: boolean;
  onClose: () => void;
  onOpenConnection: () => void;
  onOpenUpdates: () => void;
  onOpenTransfer: () => void;
}

const THEME_OPTIONS: ReadonlyArray<SegmentedOption<RemoteTheme>> = [
  { value: RemoteTheme.Light, label: 'Light' },
  { value: RemoteTheme.Dark, label: 'Dark' },
  { value: RemoteTheme.System, label: 'System' },
];

const CHEVRON_SIZE = 18;

export function SettingsSheet({ state, onAction, visible, onClose, onOpenConnection, onOpenUpdates, onOpenTransfer }: SettingsSheetProps) {
  const updates = useUpdates();
  const { t, languagePreference, setLanguage } = useI18n();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [sortingOpen, setSortingOpen] = useState(false);
  const librarySorting = state.librarySorting;
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
    <BottomSheet
      visible={visible}
      onClose={() => { setLanguageOpen(false); setSortingOpen(false); onClose(); }}
      onHidden={runAfterClose}
      onBackPress={() => {
        if (!languageOpen && !sortingOpen) return false;
        setLanguageOpen(false);
        setSortingOpen(false);
        return true;
      }}
      title={languageOpen ? t('Choose a language') : sortingOpen ? t('Library sorting') : t('Settings')}
      contentKey={languageOpen ? 'language' : sortingOpen ? 'sorting' : 'settings'}
    >
      {languageOpen ? (
        <View style={styles.content}>
          <Card variant="surface">
            <ListRow title={t('Back')} leading={<Icon name="chevronLeft" />} onPress={() => setLanguageOpen(false)} />
            {LANGUAGE_OPTIONS.map(({ value, label }) => (
              <ListRow
                key={value}
                title={value === 'system' ? t(label) : label}
                selected={languagePreference === value}
                accessibilityRole="radio"
                accessibilityLabel={value === 'system' ? t(label) : label}
                trailing={languagePreference === value ? <Icon name="check" /> : null}
                onPress={() => {
                  void setLanguage(value);
                  setLanguageOpen(false);
                }}
              />
            ))}
          </Card>
        </View>
      ) : sortingOpen && librarySorting ? (
        <View style={styles.content}>
          <Card variant="surface">
            <ListRow title={t('Back')} leading={<Icon name="chevronLeft" />} onPress={() => setSortingOpen(false)} />
            <LibrarySortingSetting
              sorting={librarySorting}
              onChange={(scope: LibrarySortScope, mode: LibrarySortMode) => {
                onAction({ type: 'SetLibrarySorting', scope, mode });
              }}
            />
          </Card>
        </View>
      ) : (
      <View style={styles.content}>
        <Card variant="surface">
          <PlayerCard
            variant="row"
            name={disconnected ? t('No player') : player.name}
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
                title={t('Transfer files')}
                leading={<Icon name="import" />}
                subtitle={t(state.connectionTransport === ConnectionTransport.Bluetooth
                  ? 'File transfer works when connected over Wi-Fi.'
                  : state.supportedFeatures.includes('wifi_import')
                    ? 'Send music from this device to the player SD card'
                    : 'Update the player firmware to use Wi-Fi import.')}
                trailing={<Icon name="chevronRight" size={CHEVRON_SIZE} />}
                onPress={() => {
                  onClose();
                  onOpenTransfer();
                }}
              />
              {state.supportedFeatures.includes('device_info') && (state.deviceModel || state.playerVersion) ? (
                <>
                  <Divider />
                  <View style={styles.deviceInfo}>
                    <AppText variant="eyebrow" tone="inkMuted">{t('Device information')}</AppText>
                    {state.deviceModel ? <AppText variant="caption" tone="inkMuted">{t('Player model')}: {state.deviceModel}</AppText> : null}
                    {state.playerVersion ? <AppText variant="caption" tone="inkMuted">{t('Player version')}: {state.playerVersion}</AppText> : null}
                    {state.playerVersion ? <AppText variant="caption" tone="inkMuted">{t('This is the running player software version; firmware is updated separately.')}</AppText> : null}
                  </View>
                </>
              ) : null}
              <Divider />
              <ListRow
                variant="action"
                title={t('Update saved PIN')}
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
            title={t('Connection and players')}
            leading={<Icon name="wifi" />}
            trailing={<Icon name="chevronRight" size={CHEVRON_SIZE} />}
            onPress={() => {
              onClose();
              onOpenConnection();
            }}
          />
        </Card>

        <Card variant="surface">
          <ListRow title={t('Updates')} subtitle={updates.firmware
            ? (connected && state.playerVersion
              ? t('Player {playerVersion} · Firmware {firmwareVersion} · App {appVersion}', { playerVersion: state.playerVersion, firmwareVersion: updates.firmware.version, appVersion: updates.appVersion })
              : t('Firmware {version} · App {appVersion}', { version: updates.firmware.version, appVersion: updates.appVersion }))
            : (connected && state.playerVersion
              ? t('Player {playerVersion} · Compás Remote {appVersion}', { playerVersion: state.playerVersion, appVersion: updates.appVersion })
              : t('Compás Remote {version}', { version: updates.appVersion }))}
            trailing={<Icon name="chevronRight" size={CHEVRON_SIZE} />} onPress={() => { onClose(); onOpenUpdates(); }} />
        </Card>
        <Card variant="surface">
          <PreferenceSetting
            title={t('Appearance')}
            options={THEME_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
            value={state.theme}
            onChange={(theme) => onAction({ type: 'SetTheme', theme })}
          />
          <Divider />
          <ListRow
            title={t('Language')}
            subtitle={languagePreference === 'system' ? t('System default') : LANGUAGE_OPTIONS.find((option) => option.value === languagePreference)?.label}
            trailing={<Icon name="chevronRight" size={CHEVRON_SIZE} />}
            onPress={() => setLanguageOpen(true)}
          />
          {state.supportedFeatures.includes('library_sorting') && librarySorting ? (
            <>
              <Divider />
              <ListRow
                title={t('Sort library')}
                subtitle={t(['Name (A–Z)', 'Recently Added', 'Release Year (oldest first)'][librarySorting.albums.effective])}
                trailing={<Icon name="chevronRight" size={CHEVRON_SIZE} />}
                onPress={() => setSortingOpen(true)}
              />
            </>
          ) : null}
          <Divider />
          <AccentSetting />
          <Divider />
          <BackgroundSetting />
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
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Space.lg,
    gap: Space.md,
  },
  deviceInfo: { paddingHorizontal: Space.lg, paddingVertical: Space.sm, gap: Space.xs },
  importHelp: { paddingHorizontal: Space.lg, paddingVertical: Space.md },
  importStatus: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.lg, paddingVertical: Space.sm },
  importError: { marginHorizontal: Space.lg, marginVertical: Space.sm },
  importButtons: { gap: Space.sm, padding: Space.lg },
});
