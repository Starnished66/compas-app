import React from 'react';
import { View } from 'react-native';
import { BottomSheet } from '../components/BottomSheet';
import { UpdatesCard } from '../components/UpdatesCard';
import { Space } from '../tokens';
import { useI18n } from '../../i18n';

export function UpdatesSheet({ visible, onClose, playerVersion }: { visible: boolean; onClose(): void; playerVersion?: string | null }) {
  const { t } = useI18n();
  return <BottomSheet visible={visible} onClose={onClose} title={t('Updates')}>
    <View style={{ paddingHorizontal: Space.lg }}><UpdatesCard playerVersion={playerVersion} /></View>
  </BottomSheet>;
}
