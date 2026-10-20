import React from 'react';
import { View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { ListRow } from './ListRow';
import { Space } from '../tokens';
import { useI18n } from '../../i18n';
import { LibrarySortMode, LibrarySortScope, LibrarySortingSnapshot, LibrarySortSnapshot } from '../../data/types';

export type { LibrarySortingSnapshot } from '../../data/types';
export type LibrarySortingScope = LibrarySortScope;

export function LibrarySortingSetting({
  sorting,
  onChange,
}: {
  sorting: LibrarySortingSnapshot;
  onChange(scope: LibrarySortingScope, mode: LibrarySortMode): void;
}) {
  const { t } = useI18n();
  const sections: ReadonlyArray<{ scope: LibrarySortingScope; title: string; value: LibrarySortSnapshot }> = [
    { scope: 'albums', title: 'Album sort', value: sorting.albums },
    { scope: 'artists', title: 'Artist albums', value: sorting.artists },
    { scope: 'album_artists', title: 'Album artist albums', value: sorting.albumArtists },
  ];
  const options: ReadonlyArray<{ mode: LibrarySortMode; label: string }> = [
    { mode: 0, label: 'Name (A–Z)' },
    { mode: 1, label: 'Recently Added' },
    { mode: 2, label: 'Release Year (oldest first)' },
  ];

  return (
    <View>
      {sections.map(({ scope, title, value }, sectionIndex) => (
        <View key={scope} style={{ paddingBottom: Space.sm }}>
          {sectionIndex > 0 ? <View style={{ height: Space.sm }} /> : null}
          <AppText variant="eyebrow" tone="inkMuted" style={{ paddingHorizontal: Space.lg, paddingTop: Space.sm }}>
            {t(title)}
          </AppText>
          {options.map(({ mode, label }) => {
            const available = value.available[mode];
            return (
              <ListRow
                key={mode}
                title={t(label)}
                subtitle={!available ? t('This option is unavailable. Update the player’s Music Database to use it.') : undefined}
                selected={value.effective === mode}
                disabled={!available}
                accessibilityRole="radio"
                accessibilityLabel={available ? t(label) : t('Unavailable: {option}', { option: t(label) })}
                trailing={value.effective === mode ? <Icon name="check" /> : null}
                onPress={available ? () => onChange(scope, mode) : undefined}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}
