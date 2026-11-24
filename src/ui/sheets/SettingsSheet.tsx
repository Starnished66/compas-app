import React, { useRef, useState, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { ConnectionStatus, ConnectionTransport, RemoteAction, RemoteTheme, RemoteUiState } from '../../data/types';
import { LIBRARY_SORT_MODES } from '../../data/librarySortModes';
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
import { SwipeActionSetting } from '../components/SwipeActionsSetting';
import { LibrarySortingSetting } from '../components/LibrarySortingSetting';
import { PlayerCard } from '../components/PlayerCard';
import { PlayerFeatureList } from '../components/PlayerFeatureList';
import { PreferenceSetting } from '../components/PreferenceSetting';
import { SegmentedOption } from '../components/SegmentedControl';
import { connectionStatusView } from '../connectionSummary';
import { Space } from '../tokens';
import type { ConnectedPlayer } from '../useConnectedPlayer';
import { useUpdates } from '../../updates/UpdatesProvider';
import { LANGUAGE_OPTIONS, useI18n } from '../../i18n';
import { Button } from '../components/Button';

export interface SettingsSheetProps {
  state: RemoteUiState;
  player: ConnectedPlayer;
  onAction: (action: RemoteAction) => void;
  visible: boolean;
  onClose: () => void;
  onOpenConnection: () => void;
  onOpenUpdates: () => void;
  onOpenTransfer: () => void;
  onOpenScreenshot?: () => void;
  onOpenPlayerSettings?: () => void;
  onOpenPlugins?: () => void;
}

const THEME_OPTIONS: ReadonlyArray<SegmentedOption<RemoteTheme>> = [
  { value: RemoteTheme.Light, label: 'Light' },
  { value: RemoteTheme.Dark, label: 'Dark' },
  { value: RemoteTheme.System, label: 'System' },
];

const CHEVRON_SIZE = 18;

export function SettingsSheet(props: SettingsSheetProps) {
  const { state, onAction, visible, onClose } = props;
  const updates = useUpdates();
  const { t, languagePreference, setLanguage } = useI18n();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [sortingOpen, setSortingOpen] = useState(false);
  const librarySorting = state.librarySorting;
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
      {languageOpen
        ? renderLanguageSettings(t, languagePreference, setLanguage, setLanguageOpen)
        : sortingOpen && librarySorting
          ? renderLibrarySorting(t, librarySorting, onAction, setSortingOpen)
          : renderSettingsMain(props, { t, updates, afterClose, languagePreference, librarySorting, connected,
            disconnected, setLanguageOpen, setSortingOpen })}
    </BottomSheet>
  );
}

type I18n = ReturnType<typeof useI18n>;
type Translate = I18n['t'];
type TogglePage = (open: boolean) => void;

interface SettingsView {
  t: Translate;
  updates: ReturnType<typeof useUpdates>;
  afterClose: RefObject<RemoteAction | null>;
  languagePreference: I18n['languagePreference'];
  librarySorting: RemoteUiState['librarySorting'];
  connected: boolean;
  disconnected: boolean;
  setLanguageOpen: TogglePage;
  setSortingOpen: TogglePage;
}

function renderLanguageSettings(t: Translate, languagePreference: I18n['languagePreference'], setLanguage: I18n['setLanguage'], setLanguageOpen: TogglePage) {
  return (
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
  );
}

function renderLibrarySorting(
  t: Translate, librarySorting: NonNullable<RemoteUiState['librarySorting']>,
  onAction: SettingsSheetProps['onAction'], setSortingOpen: TogglePage,
) {
  return (
    <View style={styles.content}>
      <Card variant="surface">
        <ListRow title={t('Back')} leading={<Icon name="chevronLeft" />} onPress={() => setSortingOpen(false)} />
        <LibrarySortingSetting
          sorting={librarySorting}
          onChange={(scope, mode) => {
            onAction({ type: 'SetLibrarySorting', scope, mode });
          }}
        />
      </Card>
    </View>
  );
}

function renderSettingsMain(props: SettingsSheetProps, view: SettingsView) {
  const { state, onClose, onOpenUpdates } = props;
  const { connected, t, updates } = view;
  return (
    <View style={styles.content}>
      {renderSettingsPlayer(props, view)}

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
      {renderSettingsPreferences(props, view)}
    </View>
  );
}

function renderSettingsPlayer(props: SettingsSheetProps, view: SettingsView) {
  const { state, player, onAction, onClose, onOpenConnection } = props;
  const { connected, disconnected, t } = view;
  return (
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
      {connected ? renderPlayerCommands(props, view) : null}
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
  );
}

function renderPlayerCommands({ state, onClose, onOpenTransfer, onOpenScreenshot, onOpenPlugins, onOpenPlayerSettings }: SettingsSheetProps, { t, afterClose }: SettingsView) {
  return (
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
      {onOpenScreenshot && state.supportedFeatures.includes('screenshots') ? (
        <>
          <Divider />
          <ListRow
            variant="action"
            title={t('Player screenshot')}
            leading={<Icon name="playerScreen" />}
            subtitle={t('Capture the current player screen')}
            trailing={<Icon name="chevronRight" size={CHEVRON_SIZE} />}
            onPress={() => { onClose(); onOpenScreenshot(); }}
          />
        </>
      ) : null}
      {onOpenPlugins && (state.supportedFeatures.includes('plugin_store') || state.supportedFeatures.includes('plugin_management') || state.supportedFeatures.includes('player_layouts')) ? (
        <>
          <Divider />
          <ListRow
            variant="action"
            title={t('Plugins')}
            leading={<Icon name="grid" />}
            subtitle={t('Browse plugins and player layouts')}
            trailing={<Icon name="chevronRight" size={CHEVRON_SIZE} />}
            onPress={() => { onClose(); onOpenPlugins(); }}
          />
        </>
      ) : null}
      {renderPlayerSettingsCommand(state, onClose, onOpenPlayerSettings, t)}
      {renderSettingsDeviceInfo(state, t)}
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
  );
}

function renderPlayerSettingsCommand(
  state: RemoteUiState, onClose: () => void, onOpenPlayerSettings: SettingsSheetProps['onOpenPlayerSettings'], t: Translate,
) {
  if (!onOpenPlayerSettings || !state.supportedFeatures.includes('settings_v1')) return null;
  return (
    <>
      <Divider />
      <ListRow
        variant="action"
        title={t('Player settings')}
        leading={<Icon name="sliders" />}
        subtitle={t('Sound, display, power and more')}
        trailing={<Icon name="chevronRight" size={CHEVRON_SIZE} />}
        onPress={() => {
          onClose();
          onOpenPlayerSettings();
        }}
      />
    </>
  );
}

function renderSettingsPreferences({ state, onAction }: SettingsSheetProps, view: SettingsView) {
  const { t, languagePreference, setLanguageOpen, librarySorting, setSortingOpen, connected } = view;
  return (
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
            subtitle={`${t(LIBRARY_SORT_MODES[librarySorting.albums.effective].label)}${librarySorting.albums.reverse ? ` · ${t('Reversed order')}` : ''}`}
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
      <Divider />
      <SwipeActionSetting direction="right" />
      <Divider />
      <SwipeActionSetting direction="left" />
      {connected ? (
        <>
          <Divider />
          <LibrarySyncRow onSync={() => onAction({ type: 'SyncLibrary' })} />
          <Divider />
          <PlayerFeatureList supportedFeatures={state.supportedFeatures} />
        </>
      ) : null}
    </Card>
  );
}

function renderSettingsDeviceInfo(state: RemoteUiState, t: Translate) {
  if (!state.supportedFeatures.includes('device_info') || (!state.deviceModel && !state.playerVersion)) return null;
  return (
    <>
      <Divider />
      <View style={styles.deviceInfo}>
        <AppText variant="eyebrow" tone="inkMuted">{t('Device information')}</AppText>
        {state.deviceModel ? <AppText variant="caption" tone="inkMuted">{t('Player model')}: {state.deviceModel}</AppText> : null}
        {state.playerVersion ? <AppText variant="caption" tone="inkMuted">{t('Player version')}: {state.playerVersion}</AppText> : null}
        {state.playerVersion ? <AppText variant="caption" tone="inkMuted">{t('This is the running player software version; firmware is updated separately.')}</AppText> : null}
      </View>
    </>
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
