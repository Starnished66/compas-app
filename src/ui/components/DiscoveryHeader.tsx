import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { useI18n } from '../../i18n';
import { SectionHeader } from './SectionHeader';
import { Spinner } from './Spinner';

export interface DiscoveryHeaderProps {
  label: string;
  searching: boolean;
  onSearch: () => void;
}

const SEARCH_SPINNER_SIZE = 14;

export function DiscoveryHeader({ label, searching, onSearch }: DiscoveryHeaderProps) {
  const { t } = useI18n();
  return (
    <SectionHeader
      label={label}
      trailing={
        searching ? (
          <View accessibilityLiveRegion="polite" style={styles.searching}>
            <Spinner size={SEARCH_SPINNER_SIZE} />
            <AppText variant="caption" tone="inkMuted">
              Searching…
            </AppText>
          </View>
        ) : (
          <Button label={t('Search again')} icon="refresh" variant="plain" size="sm" onPress={onSearch} />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  searching: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingRight: Space.sm,
  },
});
