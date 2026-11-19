import React from 'react';
import { View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { ListRow } from './ListRow';
import { Space } from '../tokens';
import { useI18n } from '../../i18n';
import { librarySortOptions, LIBRARY_SORT_SCOPES, LIBRARY_SORT_SECTIONS } from '../../data/librarySortModes';
import type { LibrarySortMode, LibrarySortScope, LibrarySortingSnapshot } from '../../data/types';

export function LibrarySortingSetting({
  sorting,
  onChange,
}: {
  sorting: LibrarySortingSnapshot;
  onChange(scope: LibrarySortScope, mode: LibrarySortMode): void;
}) {
  const { t } = useI18n();

  return (
    <View>
      {LIBRARY_SORT_SCOPES.map((scope, sectionIndex) => {
        const { key, title } = LIBRARY_SORT_SECTIONS[scope];
        const value = sorting[key];
        return (
          <View key={scope} style={{ paddingBottom: Space.sm }}>
            {sectionIndex > 0 ? <View style={{ height: Space.sm }} /> : null}
            <AppText variant="eyebrow" tone="inkMuted" style={{ paddingHorizontal: Space.lg, paddingTop: Space.sm }}>
              {t(title)}
            </AppText>
            {librarySortOptions(scope, value.available).map(({ mode, label, available }) => {
              const selected = value.effective === mode;
              const reversed = selected && value.reverse;
              return (
                <ListRow
                  key={mode}
                  title={t(label)}
                  subtitle={!available
                    ? t('This option is unavailable. Update the player’s Music Database to use it.')
                    : reversed ? t('Reversed order') : undefined}
                  selected={selected}
                  disabled={!available}
                  accessibilityRole="radio"
                  accessibilityLabel={available
                    ? `${t(label)}${reversed ? `, ${t('Reversed order')}` : ''}`
                    : t('Unavailable: {option}', { option: t(label) })}
                  trailing={selected ? <Icon name="check" /> : null}
                  onPress={available ? () => { if (!selected) onChange(scope, mode); } : undefined}
                />
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
