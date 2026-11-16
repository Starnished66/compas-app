import React from 'react';
import { Alert } from 'react-native';
import { useI18n } from '../../i18n';
import { IconButton } from '../components/IconButton';

interface Props {
  title: string;
  showHidden: boolean;
  disabled: boolean;
  onPress: () => void;
}

export function HiddenFilesButton({ title, showHidden, disabled, onPress }: Props) {
  const { t } = useI18n();
  const label = showHidden ? t('Hide hidden files') : t('Show hidden files');
  return <IconButton icon="moreHorizontal" size="sm" label={label} active={showHidden} disabled={disabled}
    onPress={() => Alert.alert(title, undefined, [
      { text: label, onPress },
      { text: t('Cancel'), style: 'cancel' },
    ])} />;
}
