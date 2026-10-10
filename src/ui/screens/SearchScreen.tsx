import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { LibraryCategory, LibraryEntry, RemoteAction, RemoteUiState } from '../../data/types';
import { Button } from '../components/Button';
import { CategoryChips } from '../components/CategoryChips';
import { InlineError } from '../components/InlineError';
import { LibraryList } from '../components/LibraryList';
import { LibraryPlaceholder } from '../components/LibraryPlaceholder';
import { SectionHeader } from '../components/SectionHeader';
import { TextField } from '../components/TextField';
import { Size, Space } from '../tokens';
import { LibraryEntryKind } from '../library/libraryEntryKind';
import { LibraryItem, entryItems, nodeItem } from '../library/libraryItems';
import { inlineLibraryError, libraryStateMessage } from '../library/libraryStateMessage';
import { SEARCH_FILTER_OPTIONS, SearchFilter, searchSections } from '../library/searchSections';
import { useAlbumGrid } from '../library/useAlbumGrid';
import { LibraryListScroll } from '../library/useLibraryListScroll';

export interface SearchScreenProps {
  state: RemoteUiState;
  onAction: (action: RemoteAction) => void;
  onOpenEntry: (entry: LibraryEntry, kind: LibraryEntryKind) => void;
  onClose: () => void;
  contentBottomInset: number;
  scroll?: LibraryListScroll;
}

const SEARCH_CONTEXT = { category: LibraryCategory.Search, isNested: false };

function isSearchScreen(state: RemoteUiState): boolean {
  return state.screen.type === 'Library' && state.screen.category === LibraryCategory.Search;
}

export function SearchScreen({ state, onAction, onOpenEntry, onClose, contentBottomInset, scroll }: SearchScreenProps) {
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

  const changeQuery = (value: string) => {
    setQuery(value);
    onAction({ type: 'SearchLibrary', query: value });
  };

  const items: LibraryItem[] = [];
  const inlineError = showingResults ? inlineLibraryError(state) : null;
  if (inlineError) {
    items.push(nodeItem('error', <InlineError message={inlineError} style={styles.inlineError} />));
  }

  const sections = showingResults ? searchSections(state.libraryEntries, filter) : [];
  for (const section of sections) {
    const canExpand = filter === 'all' && section.total > section.entries.length;
    items.push(
      nodeItem(
        `section:${section.filter}`,
        <SectionHeader
          label={section.label}
          actionLabel={canExpand ? 'See all' : undefined}
          onAction={() => {
            setFilter(section.filter);
            scroll?.scrollToTop();
          }}
          style={styles.sectionHeader}
        />,
      ),
      ...entryItems(section.entries, SEARCH_CONTEXT),
    );
  }

  const placeholder = !term
    ? { title: 'Search your library', body: 'Find artists, albums, songs and genres on the player.' }
    : sections.length
      ? null
      : !showingResults
        ? { title: 'Searching…', loading: true }
        : libraryStateMessage({
          state,
          onAction,
          noun: 'results',
          empty: { title: `No results for “${term}”`, body: 'Try fewer letters, or check the spelling.' },
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
          clearLabel="Clear search"
          placeholder="Artists, albums, songs, genres"
          accessibilityLabel="Search library"
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          style={styles.field}
        />
        <Button label="Cancel" variant="plain" onPress={onClose} />
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
        onAction={onAction}
        onOpenEntry={onOpenEntry}
        hasMore={showingResults && filter === 'songs' && state.libraryHasMore}
        status={state.libraryStatus}
        currentTrack={state.currentTrack}
        isPlaying={state.isPlaying}
        tileWidth={tileWidth}
        contentBottomInset={contentBottomInset}
        scroll={scroll}
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
