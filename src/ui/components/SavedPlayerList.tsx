import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ConnectionTransport, type SavedPlayerProfile } from '../../data/types';
import { useI18n } from '../../i18n';
import { AppText } from './AppText';
import { Card } from './Card';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { ListRow } from './ListRow';
import { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';

export interface SavedPlayerListProps {
  profiles: readonly SavedPlayerProfile[];
  connectedKey: string | null;
  connectedTransport: ConnectionTransport;
  busy: boolean;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

export function SavedPlayerList({
  profiles,
  connectedKey,
  connectedTransport,
  busy,
  onSelect,
  onRemove,
}: SavedPlayerListProps) {
  const { t } = useI18n();
  const palette = usePalette();
  if (profiles.length === 0) return null;

  return (
    <View style={styles.section}>
      <AppText variant="eyebrow" tone="inkMuted" style={styles.eyebrow}>
        {t('Saved players')}
      </AppText>
      <Card variant="surface">
        {profiles.map((profile) => {
          const isWifi = profile.transport === ConnectionTransport.Wifi;
          const isCurrent =
            connectedKey != null &&
            connectedTransport === profile.transport &&
            (isWifi ? connectedKey === profile.endpoint : connectedKey === profile.endpoint || connectedKey === `bt:${profile.endpoint}`);
          const detail = [
            isWifi ? t('Wi-Fi') : t('Bluetooth'),
            profile.endpoint,
          ].filter(Boolean).join(' · ');
          return (
            <ListRow
              key={profile.id}
              title={profile.deviceModel || profile.name}
              subtitle={isCurrent ? t('Connected') : detail}
              selected={isCurrent}
              disabled={busy}
              leading={<Icon name={isWifi ? 'wifi' : 'bluetooth'} color={isCurrent ? palette.accent : undefined} />}
              trailing={(
                <IconButton
                  icon="trash"
                  label={t('Remove saved player')}
                  size="sm"
                  disabled={busy}
                  onPress={() => onRemove(profile.id)}
                />
              )}
              onPress={isCurrent ? undefined : () => onSelect(profile.id)}
            />
          );
        })}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Space.xs },
  eyebrow: { paddingHorizontal: Space.xs },
});
