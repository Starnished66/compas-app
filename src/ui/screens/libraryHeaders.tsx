import React from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useI18n } from '../../i18n';
import type { LibraryCategory, LibraryEntry, RemoteUiState } from '../../data/types';
import { AlbumCollectionHeader } from '../components/AlbumCollectionHeader';
import { BulkSelectionBar } from '../components/BulkSelectionBar';
import { CategoryChips } from '../components/CategoryChips';
import { CollectionPlayButtons } from '../components/CollectionPlayButtons';
import { InlineError } from '../components/InlineError';
import { LibraryPlaceholder, type LibraryPlaceholderProps } from '../components/LibraryPlaceholder';
import { LibrarySyncCard } from '../components/LibrarySyncCard';
import { LibraryToolbar } from '../components/LibraryToolbar';
import { ScreenTitleBar } from '../components/ScreenTitleBar';
import { SearchLauncher } from '../components/SearchLauncher';
import { StickyFrostBar } from '../components/StickyFrostBar';
import { playCollection } from '../library/collectionPlayback';
import type { FlipMode } from '../library/flipRegistry';
import { availableCategoryOptions } from '../library/libraryCategories';
import { nodeItem, type LibraryItem } from '../library/libraryItems';
import { localizedCountLabel } from '../localizedLabels';
import { Space } from '../tokens';
import type { LibraryScreenProps } from './LibraryScreen';

export const NESTED_ALBUMS_TITLE = 'Albums';

type Translate = ReturnType<typeof useI18n>['t'];
type SetFlag = React.Dispatch<React.SetStateAction<boolean>>;

interface HeaderPlayback {
  collectionBusy: RemoteUiState['collectionBusy'];
  shuffleActive: boolean;
  onAction: LibraryScreenProps['onAction'];
  t: Translate;
}

function collectionPlayButtons({ collectionBusy, shuffleActive, onAction }: HeaderPlayback) {
  return (
    <CollectionPlayButtons
      busy={collectionBusy}
      onPlay={() => playCollection(onAction, [], false, shuffleActive, true)}
      onShuffle={() => playCollection(onAction, [], true, shuffleActive, true)}
    />
  );
}

interface RootHeaderOptions extends HeaderPlayback {
  onLeadingLayout: (event: LayoutChangeEvent) => void;
  setSearchOpen: SetFlag;
  chipsStuck: boolean;
  insetTop: number;
  supportedFeatures: string[];
  category: LibraryCategory;
  connected: boolean;
  railGutter: number | undefined;
  nativeRootSongsPlayback: boolean;
}

export function libraryRootHeader(options: RootHeaderOptions): LibraryItem[] {
  const { onLeadingLayout, setSearchOpen, chipsStuck, insetTop, supportedFeatures, category,
    connected, railGutter, nativeRootSongsPlayback, onAction, t } = options;
  const items: LibraryItem[] = [];
  items.push(
    nodeItem(
      'heading',
      <View onLayout={onLeadingLayout}>
        <ScreenTitleBar title={t('Library')} />
        <SearchLauncher label={t('Search artists, albums, songs')} onPress={() => setSearchOpen(true)} />
      </View>,
    ),
    nodeItem(
      'chips',
      <StickyFrostBar extended={chipsStuck} extension={insetTop}>
        <CategoryChips
          options={availableCategoryOptions(supportedFeatures)}
          value={category}
          onChange={(value) => onAction({ type: 'OpenLibrary', category: value })}
        />
      </StickyFrostBar>,
    ),
  );
  if (connected) {
    items.push(
      nodeItem(
        'sync',
        <LibrarySyncCard
          insetRight={railGutter}
          // Also checks the player's catalog: a failed sync retries, and changes made on the player come in.
          onRefresh={() => {
            onAction({ type: 'SyncLibrary' });
            onAction({ type: 'RefreshLibrary', category });
          }}
        />,
      ),
    );
  }
  if (nativeRootSongsPlayback) {
    items.push(nodeItem('collection-playback', <View style={styles.collectionActions}>{collectionPlayButtons(options)}</View>));
  }
  return items;
}

interface CollectionHeaderOptions extends HeaderPlayback {
  albumDetail: boolean;
  step: { entry: LibraryEntry } | null;
  nestedTitle: RemoteUiState['libraryNestedTitle'];
  artistDetail: boolean;
  nativeCollectionPlayback: boolean;
  nativeGenrePlayback: boolean;
  albumEntries: LibraryEntry[] | null;
  libraryCountLabel: RemoteUiState['libraryCountLabel'];
}

export function libraryCollectionHeader(options: CollectionHeaderOptions): LibraryItem[] {
  const { albumDetail, step, nestedTitle, artistDetail, nativeCollectionPlayback, nativeGenrePlayback, albumEntries,
    libraryCountLabel, collectionBusy, shuffleActive, onAction, t } = options;
  const items: LibraryItem[] = [];
  items.push(
    nodeItem(
      'title',
      <ScreenTitleBar
        title={albumDetail ? undefined : step?.entry.title ?? (nestedTitle === 'Tracks' || nestedTitle === NESTED_ALBUMS_TITLE ? t(nestedTitle) : nestedTitle) ?? undefined}
        onBack={() => onAction({ type: 'Back' })}
      />,
    ),
  );
  if ((artistDetail && nativeCollectionPlayback) || nativeGenrePlayback) {
    items.push(nodeItem('collection-playback', <View style={styles.collectionActions}>{collectionPlayButtons(options)}</View>));
  }
  if (albumEntries && step) {
    items.push(
      nodeItem(
        'album',
        <AlbumCollectionHeader
          album={step.entry}
          entries={albumEntries}
          countLabel={libraryCountLabel}
          busy={collectionBusy}
          shuffleActive={shuffleActive}
          nativePlayback={nativeCollectionPlayback}
          onAction={onAction}
        />,
      ),
    );
  }

  return items;
}

interface ListToolbarOptions {
  inlineError: string | null | undefined;
  placeholder: LibraryPlaceholderProps | null;
  selectionMode: boolean;
  selectedCount: number;
  openBulk: () => void;
  exitSelection: () => void;
  albumDetail: boolean;
  entryCount: number;
  noun: string;
  ascending: boolean;
  localDirectionSort: boolean;
  showGrid: boolean;
  gridCapable: boolean;
  flip: (mode: FlipMode, apply: () => void) => void;
  setAscending: SetFlag;
  setGrid: SetFlag;
  libraryCountLabel: RemoteUiState['libraryCountLabel'];
  railGutter: number | undefined;
  t: Translate;
}

export function libraryListToolbar(options: ListToolbarOptions): LibraryItem[] {
  const { inlineError, placeholder, selectionMode, selectedCount, openBulk, exitSelection, albumDetail, entryCount,
    noun, ascending, localDirectionSort, showGrid, gridCapable, flip, setAscending, setGrid, libraryCountLabel,
    railGutter, t } = options;
  const items: LibraryItem[] = [];
  if (inlineError) {
    items.push(nodeItem('error', <InlineError message={inlineError} style={styles.inlineError} />));
  }

  if (placeholder) {
    items.push(nodeItem('placeholder', <LibraryPlaceholder {...placeholder} />));
  } else {
    if (selectionMode) {
      items.push(nodeItem('selection', <BulkSelectionBar count={selectedCount} onActions={openBulk} onCancel={exitSelection} />));
    }
    if (!albumDetail) {
      items.push(
        nodeItem(
          'toolbar',
          <LibraryToolbar
            countLabel={localizedCountLabel(libraryCountLabel || `${entryCount} ${noun}`, t)}
            ascending={ascending}
            onToggleSort={localDirectionSort ? () => flip('sort', () => setAscending((value) => !value)) : undefined}
            grid={showGrid}
            onToggleGrid={gridCapable ? () => flip('view', () => setGrid((value) => !value)) : undefined}
            insetRight={railGutter}
          />,
        ),
      );
    }
  }
  return items;
}

const styles = StyleSheet.create({
  collectionActions: { flexDirection: 'row', gap: Space.md, paddingHorizontal: Space.lg, paddingVertical: Space.sm },
  inlineError: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
  },
});
