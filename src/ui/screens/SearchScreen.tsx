import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { StyleSheet, TextInput, View } from 'react-native';
import { ConnectionStatus, LibraryCategory, LibraryEntry, RemoteAction, RemoteUiState } from '../../data/types';
import { Button } from '../components/Button';
import { CategoryChips } from '../components/CategoryChips';
import { InlineError } from '../components/InlineError';
import { LibraryList } from '../components/LibraryList';
import { useSongSwipe } from '../library/useSongSwipe';
import { LibraryPlaceholder } from '../components/LibraryPlaceholder';
import { SectionHeader } from '../components/SectionHeader';
import { TextField } from '../components/TextField';
import { Size, Space } from '../tokens';
import { LibraryEntryKind } from '../library/libraryEntryKind';
import { LibraryItem, entryItems, nodeItem } from '../library/libraryItems';
import { inlineLibraryError, libraryStateMessage } from '../library/libraryStateMessage';
import { SEARCH_FILTER_OPTIONS, SearchFilter, SearchSection, searchSections } from '../library/searchSections';
import { useAlbumGrid } from '../library/useAlbumGrid';
import { LibraryListScroll } from '../library/useLibraryListScroll';
import { BulkSelectionBar } from '../components/BulkSelectionBar';

export interface SearchScreenProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  onOpenEntry: (entry: LibraryEntry, kind: LibraryEntryKind) => void;
  onClose: () => void;
  contentBottomInset: number;
  scroll?: LibraryListScroll;
  selectionMode?: boolean;
  selectedIds?: ReadonlySet<string>;
  onSelectEntry?: (entry: LibraryEntry, kind: LibraryEntryKind) => void;
  onEntrySelectionLongPress?: (entry: LibraryEntry, kind: LibraryEntryKind) => void;
  onOpenBulkActions?: () => void;
  onCancelSelection?: () => void;
}

const SEARCH_CONTEXT = { category: LibraryCategory.Search, isNested: false };
const NO_SECTIONS: SearchSection[] = [];

function isSearchScreen(state: RemoteUiState): boolean {
  return state.screen.type === 'Library' && state.screen.category === LibraryCategory.Search;
}

export function SearchScreen({ state, onAction, onOpenEntry, onClose, contentBottomInset, scroll, selectionMode = false, selectedIds, onSelectEntry, onEntrySelectionLongPress, onOpenBulkActions, onCancelSelection }: SearchScreenProps) {
  const { t } = useI18n();
  const songSwipe = useSongSwipe(onAction, state.connectionMessage, state.queueStatus, state.connectionStatus === ConnectionStatus.Connected);
  const [query, setQuery] = useState(state.libraryQuery);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const [filter, setFilter] = useState<SearchFilter>('all');
  const { tileWidth } = useAlbumGrid();
  const term = query.trim();
  const showingResults = Boolean(term) && isSearchScreen(state);
  const scrollToTop = scroll?.scrollToTop;
  const sections = useMemo(
    () => (showingResults ? searchSections(state.libraryEntries, filter) : NO_SECTIONS),
    [showingResults, state.libraryEntries, filter],
  );
  const sectionItems = useMemo(
    () =>
      sections.flatMap((section) => {
        const canExpand = filter === 'all' && section.total > section.entries.length;
        return [
          nodeItem(
            `section:${section.filter}`,
            <SectionHeader
              label={t(section.label)}
              actionLabel={canExpand ? t('See all') : undefined}
              onAction={() => {
                setFilter(section.filter);
                scrollToTop?.();
              }}
              style={styles.sectionHeader}
            />,
          ),
          ...entryItems(section.entries, SEARCH_CONTEXT),
        ];
      }),
    [sections, filter, scrollToTop, t],
  );

  const changeQuery = (value: string) => {
    setQuery(value);
    onAction({ type: 'SearchLibrary', query: value });
  };

  const items: LibraryItem[] = [];
  const inlineError = showingResults ? inlineLibraryError(state) : null;
  if (inlineError) {
    items.push(nodeItem('error', <InlineError message={inlineError} style={styles.inlineError} />));
  }

  if (selectionMode) items.push(nodeItem('selection', <BulkSelectionBar count={selectedIds?.size ?? 0} onActions={() => onOpenBulkActions?.()} onCancel={() => onCancelSelection?.()} />));
  items.push(...sectionItems);

  const placeholder = !term
    ? { title: t('Search your library'), body: t('Find artists, albums, songs and genres on the player.') }
    : sections.length
      ? null
      : !showingResults
        ? { title: t('Searching…'), loading: true }
        : libraryStateMessage({
        translate: t,
          state,
          onAction,
          noun: 'results',
          empty: { title: t('No results for “{term}”', { term }), body: t('Try fewer letters, or check the spelling.') },
        });
  if (placeholder) items.push(nodeItem('placeholder', <LibraryPlaceholder {...placeholder} />));

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TextField
          icon="search"
          value={query}
          onChangeText={changeQuery}
          onClear={() => changeQuery('')}
          inputRef={inputRef}
          clearLabel={t('Clear search')}
          placeholder={t('Artists, albums, songs, genres')}
          accessibilityLabel={t('Search library')}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          style={styles.field}
        />
        <Button label={t('Cancel')} variant="plain" onPress={onClose} />
      </View>
      <CategoryChips
        options={SEARCH_FILTER_OPTIONS}
        value={filter}
        onChange={(value) => {
          setFilter(value);
          scroll?.scrollToTop();
        }}
      />
      <LibraryList
        items={items}
        songSwipe={songSwipe}
        onAction={onAction}
        onOpenEntry={onOpenEntry}
        // Long-press starts multi-select on result rows exactly as in the library lists.
        onEntryLongPress={onEntrySelectionLongPress}
        hasMore={showingResults && filter === 'songs' && state.libraryHasMore}
        status={state.libraryStatus}
        currentTrack={state.currentTrack}
        isPlaying={state.isPlaying}
        tileWidth={tileWidth}
        contentBottomInset={contentBottomInset}
        scroll={scroll}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onSelectEntry={onSelectEntry}
        onEntrySelectionLongPress={onEntrySelectionLongPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    height: Size.bar,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingLeft: Space.lg,
    paddingRight: Space.sm,
  },
  field: {
    flex: 1,
  },
  sectionHeader: {
    marginTop: Space.sm,
  },
  inlineError: {
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
  },
});
