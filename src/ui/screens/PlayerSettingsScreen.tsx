import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SettingDescriptor, SettingValue } from '../../core/settingsModels';
import { SettingsApi } from '../../data/SettingsApi';
import { ConnectionStatus, RemoteUiState } from '../../data/types';
import { useI18n } from '../../i18n';
import { needsLoudConfirmation, PlayerSettingsNotice } from '../../session/PlayerSettingsController';
import { usePlayerSettings } from '../../session/usePlayerSettings';
import { AppText } from '../components/AppText';
import { MessageCard } from '../components/MessageCard';
import { ScreenTitleBar } from '../components/ScreenTitleBar';
import { DangerConfirm } from '../components/settings/DangerConfirm';
import { SettingGroupList, SettingGroupPanel } from '../components/settings/SettingGroupList';
import { localizedLabel, noticeText } from '../components/settings/settingsPresentation';
import { Spinner } from '../components/Spinner';
import { useSnackbar } from '../snackbar/useSnackbar';
import { Space } from '../tokens';
import { useBackInterceptor } from '../useBackInterceptor';
import { useScreenInsets } from '../useScreenInsets';

export interface PlayerSettingsScreenProps {
  state: RemoteUiState;
  /** The settings client of the connected player, or null when not connected. */
  settingsApi: SettingsApi | null;
  onClose: () => void;
}

/** Player settings: rendered entirely from the player's schema, grouped like the device. */
export function PlayerSettingsScreen({ state, settingsApi, onClose }: PlayerSettingsScreenProps) {
  const { t, language } = useI18n();
  const snackbar = useSnackbar();
  const insets = useScreenInsets();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [loud, setLoud] = useState<{ key: string; level: number; value: number } | null>(null);

  const onNotice = useCallback((notice: PlayerSettingsNotice) => {
    const text = noticeText(notice, t);
    if (text) snackbar.show({ text });
  }, [snackbar, t]);

  const { state: settings, controller } = usePlayerSettings(
    settingsApi,
    { revision: state.settingsRevision, epoch: state.settingsEpoch },
    onNotice,
  );

  useBackInterceptor(true, () => {
    if (groupId) setGroupId(null);
    else onClose();
  });
  useEffect(() => {
    if (state.connectionStatus !== ConnectionStatus.Connected) onClose();
  }, [state.connectionStatus, onClose]);

  const schema = settings.schema;
  const group = schema && groupId ? schema.groups.find((g) => g.id === groupId) ?? null : null;
  const player = schema?.device.model ?? state.deviceModel ?? t('your player');

  const change = (setting: SettingDescriptor, value: SettingValue) => {
    if (needsLoudConfirmation(setting, settings.values[setting.key], value) && typeof value === 'number') {
      setLoud({ key: setting.key, level: setting.confirmAbove ?? 85, value });
      return;
    }
    void controller?.change(setting.key, value);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScreenTitleBar
        title={group ? localizedLabel(language, group.labelId, group.label) : t('Player settings')}
        onBack={group ? () => setGroupId(null) : onClose}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {settings.phase === 'loading' ? (
          <View style={styles.center}>
            <Spinner />
            <AppText variant="body" tone="inkMuted">{t('Loading player settings…')}</AppText>
          </View>
        ) : null}
        {settings.phase === 'unsupported' ? (
          <MessageCard variant="surface" title={t('Remote settings aren’t available')} body={t('Update the player to change its settings from here.')} />
        ) : null}
        {settings.phase === 'error' ? (
          <MessageCard
            variant="surface"
            title={t('Couldn’t load the player settings')}
            body={settings.error === 'pin_required' ? t('The saved PIN was rejected. Enter the current PIN.') : undefined}
            actionLabel={t('Try again')}
            onAction={() => void controller?.load()}
          />
        ) : null}
        {settings.phase === 'ready' && schema ? (
          <>
            {group ? (
              <SettingGroupPanel
                schema={schema}
                groupId={group.id}
                values={settings.values}
                writable={settings.writable}
                busyKeys={settings.busyKeys}
                pendingApply={settings.pendingApply}
                rescanBusy={settings.rescanBusy}
                onChange={change}
                onAction={(id) => void controller?.runAction(id)}
              />
            ) : (
              <>
                <AppText variant="body" tone="inkMuted" style={styles.note}>
                  {t('Changes are sent to {player} right away and show on its screen.', { player })}
                </AppText>
                <SettingGroupList schema={schema} values={settings.values} onOpen={setGroupId} />
                <AppText variant="caption" tone="inkMuted" style={styles.note}>
                  {t('Wi-Fi, Remote Control, the PIN and Bluetooth options can only be changed on the player, so a remote change can never lock you out.')}
                </AppText>
              </>
            )}
          </>
        ) : null}
      </ScrollView>
      <DangerConfirm
        pending={loud}
        onClose={() => setLoud(null)}
        onConfirm={() => {
          const pending = loud;
          setLoud(null);
          if (pending) void controller?.change(pending.key, pending.value, true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: Space.lg, paddingVertical: Space.md, gap: Space.md },
  center: { alignItems: 'center', gap: Space.md, paddingVertical: Space.xl },
  note: { paddingHorizontal: Space.xs },
});
