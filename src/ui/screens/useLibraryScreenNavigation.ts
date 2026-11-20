import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ConnectionStatus, ContentStatus, LibraryCategory, type LibraryEntry, type RemoteUiState } from '../../data/types';
import { useI18n } from '../../i18n';
import { useScrollToTopRequest } from '../chrome/useScrollToTopRequest';
import { FlipRegistry, type FlipMode } from '../library/flipRegistry';
import { opensCollection, type LibraryEntryKind } from '../library/libraryEntryKind';
import { useAlbumGrid } from '../library/useAlbumGrid';
import { useBulkSelection } from '../library/useBulkSelection';
import { useCollectionTrail } from '../library/useCollectionTrail';
import { useLibraryLevels } from '../library/useLibraryLevels';
import { useLibraryListScroll } from '../library/useLibraryListScroll';
import { useSongSwipe } from '../library/useSongSwipe';
import { useStuckHeader } from '../library/useStuckHeader';
import { useTabActive } from '../tabActivity';
import { useBackInterceptor } from '../useBackInterceptor';
import { useReducedMotion } from '../useReducedMotion';
import { useScreenInsets } from '../useScreenInsets';
import type { LibraryScreenProps } from './LibraryScreen';

export function useLibrarySetup(state: RemoteUiState, onAction: LibraryScreenProps['onAction'], category: LibraryCategory) {
  const { t } = useI18n();
  const songSwipe = useSongSwipe(onAction, state.connectionMessage, state.queueStatus, state.connectionStatus === ConnectionStatus.Connected);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bulkSelection = useBulkSelection(selectedIds, onAction);
  const bulkActionsOpen = bulkSelection.ids !== null;
  const exitSelection = useCallback(() => { setSelectionMode(false); setSelectedIds(new Set()); }, []);
  const tabActive = useTabActive();
  useEffect(() => {
    if (!tabActive) setSearchOpen(false);
  }, [tabActive]);
  const [ascending, setAscending] = useState(true);
  const [grid, setGrid] = useState(true);
  const [flipSerial, setFlipSerial] = useState(0);
  const flipRegistry = useRef(new FlipRegistry()).current;
  const reducedMotion = useReducedMotion();
  const browseCategory = useRef(LibraryCategory.Albums);
  if (category !== LibraryCategory.Search) browseCategory.current = category;
  const { columns, tileWidth } = useAlbumGrid();
  const nested = state.libraryIsNested;
  const searchActive = (searchOpen || category === LibraryCategory.Search) && !nested;
  const trail = useCollectionTrail(state.libraryEntries, nested);
  const insets = useScreenInsets();
  const chipsHeader = useStuckHeader();
  const scroll = useLibraryListScroll(chipsHeader.trackOffset);
  const { scrollToTop, restoreOffset } = scroll;
  const levels = useLibraryLevels({
    entries: state.libraryEntries,
    nested,
    rootKey: searchActive ? LibraryCategory.Search : category,
    currentOffset: scroll.offset,
    onEnterLevel: (offset) => (offset ? restoreOffset(offset) : scrollToTop()),
  });

  return {
    t, songSwipe, setSearchOpen, selectionMode, setSelectionMode, selectedIds, setSelectedIds, bulkSelection,
    bulkActionsOpen, exitSelection, ascending, setAscending, grid, setGrid, flipSerial, setFlipSerial,
    flipRegistry, reducedMotion, browseCategory, columns, tileWidth, nested, searchActive, trail, insets,
    chipsHeader, scroll, levels,
  };
}

export type LibrarySetup = ReturnType<typeof useLibrarySetup>;

export function useLibrarySelectionLifetime(setup: LibrarySetup, state: RemoteUiState) {
  const { levels, nested, trail, searchActive, bulkActionsOpen, exitSelection, setSelectedIds, flipSerial, flipRegistry } = setup;
  // Entry IDs belong to the open collection: leaving it ends selection, while the next page (or a refresh of the
  // same list) only drops IDs that are no longer listed.
  const collectionKey = [
    levels.transitionKey,
    nested,
    state.libraryNestedTitle ?? '',
    trail.current?.entry.id ?? '',
    searchActive ? state.libraryQuery : '',
  ].join('|');
  const selectionCollection = useRef(collectionKey);
  useEffect(() => {
    if (bulkActionsOpen) return;
    if (selectionCollection.current !== collectionKey) {
      selectionCollection.current = collectionKey;
      exitSelection();
      return;
    }
    if (!state.libraryEntries.length && state.libraryStatus === ContentStatus.Loading) return;
    setSelectedIds((previous) => {
      if (!previous.size) return previous;
      const listed = new Set(state.libraryEntries.map((entry) => entry.id));
      const kept = [...previous].filter((id) => listed.has(id));
      return kept.length === previous.size ? previous : new Set(kept);
    });
  }, [collectionKey, state.libraryEntries, state.libraryStatus, bulkActionsOpen, exitSelection]);

  useLayoutEffect(() => {
    if (flipSerial) flipRegistry.play();
  }, [flipRegistry, flipSerial]);

}

function useLibraryEntryActions(setup: LibrarySetup, onAction: LibraryScreenProps['onAction']) {
  const { flipRegistry, reducedMotion, setFlipSerial, trail, levels, setSelectedIds, selectionMode, setSelectionMode, setSearchOpen } = setup;
  const { rememberOpening } = trail;
  const { rememberPush } = levels;
  const flip = useCallback((mode: FlipMode, apply: () => void) => {
    if (!reducedMotion) flipRegistry.begin(mode);
    apply();
    setFlipSerial((value) => value + 1);
  }, [flipRegistry, reducedMotion]);

  const openEntry = useCallback(
    (entry: LibraryEntry, kind: LibraryEntryKind) => {
      if (opensCollection(kind)) {
        rememberOpening({ entry, kind });
        rememberPush();
      }
      onAction({ type: 'SelectLibraryEntry', id: entry.id });
    },
    [onAction, rememberOpening, rememberPush],
  );

  const longPressEntry = useCallback(
    (entry: LibraryEntry, kind: LibraryEntryKind) => {
      if (['song', 'album', 'artist', 'genre', 'playlist'].includes(kind)) {
        if (selectionMode) {
          setSelectedIds((previous) => {
            const next = new Set(previous);
            if (next.has(entry.id)) next.delete(entry.id);
            else next.add(entry.id);
            return next;
          });
        } else {
          setSelectedIds(new Set([entry.id]));
          setSelectionMode(true);
        }
      }
    },
    [selectionMode],
  );
  const selectEntry = useCallback((entry: LibraryEntry, kind: LibraryEntryKind) => {
    if (!['song', 'album', 'artist', 'genre', 'playlist'].includes(kind)) return;
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(entry.id)) next.delete(entry.id);
      else next.add(entry.id);
      return next;
    });
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    onAction({ type: 'SearchLibrary', query: '' });
  }, [onAction]);
  return { flip, openEntry, longPressEntry, selectEntry, closeSearch };
}

export function useLibraryNavigation(setup: LibrarySetup, onAction: LibraryScreenProps['onAction']) {
  const { nested, searchActive, selectionMode, exitSelection, setSearchOpen, browseCategory, scroll } = setup;
  const { scrollToTop } = scroll;
  const navigation = useLibraryEntryActions(setup, onAction);
  const { closeSearch } = navigation;
  // Search must close like Cancel; letting Back reach navigateBack strands the results on a spinner.
  useBackInterceptor(selectionMode || searchActive, () => {
    if (selectionMode) exitSelection();
    else closeSearch();
  });

  useScrollToTopRequest('library', () => {
    if (nested) {
      setSearchOpen(false);
      onAction({ type: 'OpenLibrary', category: browseCategory.current });
    } else if (searchActive) {
      closeSearch();
    } else {
      scrollToTop(true);
    }
  });

  return navigation;
}

export type LibraryNavigation = ReturnType<typeof useLibraryNavigation>;
