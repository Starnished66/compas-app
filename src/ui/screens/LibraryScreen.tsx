import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
  Modal,
  Alert,
} from 'react-native';
import {
  RemoteUiState,
  RemoteAction,
  LibraryCategory,
  ConnectionStatus,
  ContentStatus,
  LibraryEntry,
} from '../../data/types';
import { ColorScheme } from '../theme';
import { CardSurface } from '../components/CardSurface';
import { FrostedLayer } from '../components/CardSurface';
import { Artwork } from '../components/Artwork';
import { Glyph } from '../components/Glyph';

export interface LibraryScreenProps {
  state: RemoteUiState;
  category: LibraryCategory;
  colors: ColorScheme;
  onAction: (action: RemoteAction) => void;
}

const CATEGORIES: { cat: LibraryCategory; label: string; feature?: string }[] = [
  { cat: LibraryCategory.Artists, label: 'Artists' },
  { cat: LibraryCategory.AlbumArtists, label: 'Album Artist' },
  { cat: LibraryCategory.Playlists, label: 'Playlist' },
  { cat: LibraryCategory.Albums, label: 'Albums' },
  { cat: LibraryCategory.Songs, label: 'All songs' },
  { cat: LibraryCategory.Genres, label: 'Genres' },
  { cat: LibraryCategory.Favorites, label: 'Favorites', feature: 'favorites_edit' },
  { cat: LibraryCategory.Recent, label: 'Recent', feature: 'recently_played' },
  { cat: LibraryCategory.Folders, label: 'Folders', feature: 'folder_browse' },
];

const LibraryScreenContent: React.FC<LibraryScreenProps> = ({
  state,
  category,
  colors,
  onAction,
}) => {
  const [isGrid, setIsGrid] = useState<boolean>(
    !state.libraryIsNested &&
      (category === LibraryCategory.Albums ||
        category === LibraryCategory.Artists ||
        category === LibraryCategory.AlbumArtists ||
        category === LibraryCategory.Genres)
  );
  const [ascending, setAscending] = useState<boolean>(true);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [playlistDialog, setPlaylistDialog] = useState<{ key: string | null; name: string; import?: boolean } | null>(null);
  const [editPlaylistName, setEditPlaylistName] = useState('');
  const { width: windowWidth } = useWindowDimensions();
  const gridWidth = windowWidth - 32;
  const gridColumns = Math.max(2, Math.floor((gridWidth + 12) / 188));
  const gridTileWidth = (gridWidth - 12 * (gridColumns - 1)) / gridColumns;
  const [visibleLimit, setVisibleLimit] = useState<number>(36);
  const requestedArtworkIds = useRef(new Set<string>());
  const lastPageRequest = useRef('');
  const scrollPosition = useRef({ offset: 0, viewport: 0, content: 0 });

  useEffect(() => {
    setVisibleLimit(36);
    lastPageRequest.current = '';
  }, [category, state.libraryIsNested, state.libraryNestedTitle, state.libraryQuery]);

  useEffect(() => {
    if (!state.songActionsVisible) {
      setShowPlaylistPicker(false);
      setNewPlaylistName('');
    }
  }, [state.songActionsVisible]);

  useEffect(() => {
    if (category === LibraryCategory.Search) setIsGrid(false);
  }, [category]);

  const isConnected = state.connectionStatus === ConnectionStatus.Connected;

  // Sort entries if not songs and not nested
  let sortedEntries = state.libraryEntries;
  if (!state.libraryIsNested && ![LibraryCategory.Songs, LibraryCategory.Search, LibraryCategory.Recent, LibraryCategory.Favorites, LibraryCategory.Folders].includes(category)) {
    sortedEntries = [...state.libraryEntries].sort((a, b) => {
      const cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      return ascending ? cmp : -cmp;
    });
  }

  const visibleEntries = sortedEntries.slice(0, visibleLimit);
  const hasLocalMore = sortedEntries.length > visibleLimit;

  const loadNearEnd = (offset: number, viewport: number, content: number) => {
    if (!viewport || offset + viewport < content - 480) {
      lastPageRequest.current = '';
      return;
    }
    if (hasLocalMore) {
      const key = `local:${category}:${state.libraryIsNested}:${state.libraryQuery}:${visibleLimit}`;
      if (lastPageRequest.current !== key) {
        lastPageRequest.current = key;
        setVisibleLimit((current) => current + 36);
      }
    } else if (state.libraryHasMore && state.libraryStatus !== ContentStatus.Loading) {
      const key = `remote:${category}:${state.libraryIsNested}:${state.libraryQuery}:${state.libraryEntries.length}`;
      if (lastPageRequest.current !== key) {
        lastPageRequest.current = key;
        onAction({ type: 'LoadMoreLibrary' });
      }
    }
  };

  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const position = {
      offset: nativeEvent.contentOffset.y,
      viewport: nativeEvent.layoutMeasurement.height,
      content: nativeEvent.contentSize.height,
    };
    scrollPosition.current = position;
    loadNearEnd(position.offset, position.viewport, position.content);
  };

  // Ask for art for every row we expose. The old RN screen never dispatched this
  // action, so only now-playing artwork was fetched.
  useEffect(() => {
    for (const entry of visibleEntries) {
      if (!entry.artwork && !requestedArtworkIds.current.has(entry.id)) {
        requestedArtworkIds.current.add(entry.id);
        onAction({ type: 'LoadLibraryArtwork', entryId: entry.id });
      }
    }
  }, [state.libraryEntries, visibleLimit, state.libraryIsNested, ascending, onAction]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: 'transparent' }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={200}
      onScroll={handleScroll}
      onScrollEndDrag={handleScroll}
      onMomentumScrollEnd={handleScroll}
      onContentSizeChange={(_, content) => {
        scrollPosition.current.content = content;
        const { offset, viewport } = scrollPosition.current;
        loadNearEnd(offset, viewport, content);
      }}
    >
      {/* Nested Title Bar OR Main Library Header */}
      {state.libraryIsNested ? (
        <View style={styles.nestedHeader}>
          <TouchableOpacity
            style={[styles.backButton, { borderColor: colors.outline }]}
            onPress={() => onAction({ type: 'Back' })}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Glyph name="back" size={20} tint={colors.onSurface} />
          </TouchableOpacity>
          <Text
            style={[styles.nestedTitle, { color: colors.onSurface }]}
            numberOfLines={1}
          >
            {state.libraryNestedTitle || 'Tracks'}
          </Text>
        </View>
      ) : (
        <View>
          {/* Main Header & Search */}
          <View style={styles.headerRow}>
            <Text style={[styles.mainTitle, { color: colors.onSurface }]}>
              Library
            </Text>
            <View
              style={[
                styles.searchBar,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.outline,
                },
              ]}
            >
              <Glyph name="search" size={16} tint={colors.onSurfaceVariant} />
              <TextInput
                style={[styles.searchInput, { color: colors.onSurface }]}
                placeholder="Search library"
                placeholderTextColor={colors.onSurfaceVariant}
                value={state.libraryQuery}
                onChangeText={(q) => onAction({ type: 'SearchLibrary', query: q })}
              />
              {state.libraryQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => onAction({ type: 'SearchLibrary', query: '' })}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={{ color: colors.onSurfaceVariant, fontSize: 16 }}>×</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={[
                styles.refreshButton,
                { backgroundColor: colors.surfaceContainer, borderColor: colors.outline },
              ]}
              onPress={() => onAction({ type: 'RefreshLibrary', category })}
              accessibilityRole="button"
              accessibilityLabel="Refresh library"
            >
              <Glyph name="refresh" size={20} tint={colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Subtitle */}
          <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
            Browse your music on the DAP
          </Text>

          {/* Horizontal Category Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScroll}
          >
            {CATEGORIES.filter((c) => !c.feature || state.supportedFeatures.includes(c.feature)).map((c) => {
              const selected = category === c.cat;
              return (
                <TouchableOpacity
                  key={c.cat}
                  style={[
                    styles.chip,
                    selected
                      ? { backgroundColor: colors.primary }
                      : {
                          backgroundColor: colors.surfaceVariant,
                          borderColor: colors.outline,
                          borderWidth: 1,
                        },
                  ]}
                  onPress={() => onAction({ type: 'OpenLibrary', category: c.cat })}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: selected ? colors.onPrimary : colors.onSurface,
                        fontWeight: selected ? '600' : '400',
                      },
                    ]}
                  >
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Disconnected Notice */}
      {!isConnected ? (
        <CardSurface colors={colors}>
          <Text style={[styles.stateMessage, { color: colors.onSurfaceVariant }]}>
            {state.connectionMessage || 'Connect to a player to browse its library'}
          </Text>
        </CardSurface>
      ) : (
        <View>
          {!!state.connectionMessage && (
            <Text style={[styles.stateMessage, { color: '#E06C62' }]}>{state.connectionMessage}</Text>
          )}
          {/* Toolbar: Count, Sort, Grid/List toggle */}
          <View style={styles.toolbar}>
            <Text
              style={[styles.countLabel, { color: colors.onSurfaceVariant }]}
              numberOfLines={1}
            >
              {state.libraryCountLabel ||
                `${sortedEntries.length} ${
                  state.libraryIsNested ? 'tracks' : category.toLowerCase()
                }`}
            </Text>

            <View style={styles.toolbarRight}>
              {!state.libraryIsNested && ![LibraryCategory.Songs, LibraryCategory.Search, LibraryCategory.Recent, LibraryCategory.Favorites, LibraryCategory.Folders].includes(category) ? (
                <TouchableOpacity
                  style={styles.sortButton}
                  onPress={() => setAscending(!ascending)}
                >
                  <Text style={[styles.sortText, { color: colors.primary }]}>
                    {ascending ? 'A–Z' : 'Z–A'}
                  </Text>
                  <Glyph
                    name={ascending ? 'sortUp' : 'sortDown'}
                    size={14}
                    tint={colors.primary}
                  />
                </TouchableOpacity>
              ) : (
                <Text style={[styles.orderLabel, { color: colors.onSurfaceVariant }]}>
                  Player order
                </Text>
              )}

              <TouchableOpacity
                style={styles.viewToggle}
                onPress={() => setIsGrid(true)}
              >
                <Glyph
                  name="grid"
                  size={18}
                  tint={isGrid ? colors.primary : colors.onSurfaceVariant}
                />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.viewToggle}
                onPress={() => setIsGrid(false)}
              >
                <Glyph
                  name="list"
                  size={18}
                  tint={!isGrid ? colors.primary : colors.onSurfaceVariant}
                />
              </TouchableOpacity>
            </View>
          </View>
          {!state.libraryIsNested && category === LibraryCategory.Playlists && state.supportedFeatures.includes('playlist_edit') && (
            <TouchableOpacity
              style={[styles.createPlaylistButton, { backgroundColor: colors.primary, marginBottom: 10 }]}
              onPress={() => { setPlaylistDialog({ key: null, name: '' }); setEditPlaylistName(''); }}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Create empty playlist</Text>
            </TouchableOpacity>
          )}
          {!state.libraryIsNested && category === LibraryCategory.Playlists && state.supportedFeatures.includes('playlist_import') && (
            <TouchableOpacity
              style={[styles.createPlaylistButton, { borderColor: colors.outline, borderWidth: 1, marginBottom: 10 }]}
              onPress={() => { setPlaylistDialog({ key: null, name: '', import: true }); setEditPlaylistName(''); }}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.primary, fontWeight: '700' }}>Import M3U playlist</Text>
            </TouchableOpacity>
          )}

          {/* Catalog Sync Message */}
          {!!state.catalogSyncMessage && (
            <Text style={[styles.syncMessage, { color: colors.primary }]}>
              {state.catalogSyncMessage}
            </Text>
          )}

          {/* Content state */}
          {state.libraryStatus === ContentStatus.Loading && sortedEntries.length === 0 ? (
            <CardSurface colors={colors}>
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.stateMessage, { color: colors.onSurfaceVariant }]}>
                  Loading {state.libraryIsNested ? 'tracks' : category.toLowerCase()}…
                </Text>
              </View>
            </CardSurface>
          ) : state.libraryStatus === ContentStatus.Error && sortedEntries.length === 0 ? (
            <CardSurface colors={colors}>
              <Text style={[styles.stateMessage, { color: '#E06C62' }]}>
                Couldn't load {category.toLowerCase()}
              </Text>
            </CardSurface>
          ) : sortedEntries.length === 0 ? (
            <CardSurface colors={colors}>
              <Text style={[styles.stateMessage, { color: colors.onSurfaceVariant }]}>
                {state.libraryIsNested ? 'No tracks found' : 'Your library is empty'}
              </Text>
            </CardSurface>
          ) : isGrid ? (
            /* Grid View */
            <View style={styles.grid}>
              {visibleEntries.map((entry) => (
                <TouchableOpacity
                  key={entry.id}
                  style={[
                    styles.gridTile,
                    {
                      width: gridTileWidth,
                      backgroundColor: 'transparent',
                      borderColor: colors.outline,
                    },
                  ]}
                  onPress={() => onAction({ type: 'SelectLibraryEntry', id: entry.id })}
                  onLongPress={entry.kind === 'song'
                    ? () => onAction({ type: 'OpenSongActions', id: entry.id })
                    : entry.playlistKey && entry.writable && state.supportedFeatures.includes('playlist_edit')
                      ? () => { setPlaylistDialog({ key: entry.playlistKey!, name: entry.title }); setEditPlaylistName(entry.title.replace(/\.m3u$/i, '')); }
                      : undefined}
                  accessibilityHint={entry.kind === 'song' ? 'Long press for queue and playlist actions' : undefined}
                  activeOpacity={0.7}
                >
                  <FrostedLayer colors={colors} />
                  <Artwork
                    uri={entry.artwork}
                    colors={colors}
                    size={Math.min(130, gridTileWidth - 22)}
                    borderRadius={14}
                    category={category}
                  />
                  <Text
                    style={[styles.tileTitle, { color: colors.onSurface }]}
                    numberOfLines={1}
                  >
                    {entry.title}
                  </Text>
                  {!!entry.subtitle && (
                    <Text
                      style={[styles.tileSubtitle, { color: colors.onSurfaceVariant }]}
                      numberOfLines={1}
                    >
                      {entry.subtitle}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            /* List View */
            <CardSurface colors={colors} style={styles.listCard}>
              {visibleEntries.map((entry, idx) => (
                <TouchableOpacity
                  key={entry.id}
                  style={[
                    styles.listRow,
                    idx < visibleEntries.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.outline,
                    },
                  ]}
                  onPress={() => onAction({ type: 'SelectLibraryEntry', id: entry.id })}
                  activeOpacity={0.7}
                >
                  <Artwork
                    uri={entry.artwork}
                    colors={colors}
                    size={46}
                    borderRadius={8}
                    category={category}
                  />
                  <View style={styles.listText}>
                    <Text
                      style={[styles.rowTitle, { color: colors.onSurface }]}
                      numberOfLines={1}
                    >
                      {entry.title}
                    </Text>
                    {!!entry.subtitle && (
                      <Text
                        style={[styles.rowSubtitle, { color: colors.onSurfaceVariant }]}
                        numberOfLines={1}
                      >
                        {entry.subtitle}
                      </Text>
                    )}
                  </View>
                  {entry.kind === 'song' ? (
                    <TouchableOpacity
                      style={styles.entryActionButton}
                      onPress={(event) => {
                        event.stopPropagation();
                        onAction({ type: 'OpenSongActions', id: entry.id });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`More actions for ${entry.title}`}
                    >
                      <Glyph name="moreVertical" size={20} tint={colors.onSurfaceVariant} />
                    </TouchableOpacity>
                  ) : entry.playlistKey && entry.writable && !state.libraryIsNested && state.supportedFeatures.includes('playlist_edit') ? (
                    <TouchableOpacity
                      style={styles.entryActionButton}
                      onPress={(event) => {
                        event.stopPropagation();
                        setPlaylistDialog({ key: entry.playlistKey!, name: entry.title });
                        setEditPlaylistName(entry.title.replace(/\.m3u$/i, ''));
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Manage ${entry.title}`}
                    >
                      <Glyph name="moreVertical" size={20} tint={colors.onSurfaceVariant} />
                    </TouchableOpacity>
                  ) : (
                    <Text style={[styles.rowChevron, { color: colors.onSurfaceVariant }]}>›</Text>
                  )}
                </TouchableOpacity>
              ))}
            </CardSurface>
          )}

          {state.libraryStatus === ContentStatus.Loading && sortedEntries.length > 0 && (
            <ActivityIndicator style={styles.loadMoreButton} size="small" color={colors.primary} />
          )}
        </View>
      )}
      <Modal
        visible={state.songActionsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => onAction({ type: 'CloseSongActions' })}
      >
        <View style={styles.actionOverlay}>
          <View style={[styles.actionSheet, { backgroundColor: colors.surfaceContainer, borderColor: colors.outline }]}>
            <Text style={[styles.actionTitle, { color: colors.onSurface }]} numberOfLines={2}>
              {state.songActionTitle}
            </Text>
            <TouchableOpacity style={styles.actionRow} onPress={() => onAction({ type: 'AddSongToQueue' })} accessibilityRole="button">
              <Text style={[styles.actionText, { color: colors.onSurface }]}>Add to queue</Text>
            </TouchableOpacity>
            {state.songActionFavorite != null && state.supportedFeatures.includes('favorites_edit') && (
              <TouchableOpacity style={styles.actionRow} onPress={() => onAction({ type: 'SetSongFavorite', favorite: !state.songActionFavorite })} accessibilityRole="button">
                <Text style={[styles.actionText, { color: colors.onSurface }]}>{state.songActionFavorite ? 'Remove from Favorites' : 'Add to Favorites'}</Text>
              </TouchableOpacity>
            )}
            {state.activePlaylist?.writable && state.playlistRevision && state.songActionPosition != null &&
              state.supportedFeatures.includes('playlist_edit') && (
                <View>
                  {state.libraryEntries.some((entry) => entry.playlistPosition != null && entry.playlistPosition < state.songActionPosition!) && (
                    <TouchableOpacity style={styles.actionRow} onPress={() => onAction({ type: 'MovePlaylistTrack', direction: -1 })} accessibilityRole="button">
                      <Text style={[styles.actionText, { color: colors.onSurface }]}>Move earlier in playlist</Text>
                    </TouchableOpacity>
                  )}
                  {state.libraryEntries.some((entry) => entry.playlistPosition != null && entry.playlistPosition > state.songActionPosition!) && (
                    <TouchableOpacity style={styles.actionRow} onPress={() => onAction({ type: 'MovePlaylistTrack', direction: 1 })} accessibilityRole="button">
                      <Text style={[styles.actionText, { color: colors.onSurface }]}>Move later in playlist</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.actionRow} onPress={() => Alert.alert('Remove from playlist?', state.songActionTitle, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => onAction({ type: 'RemovePlaylistTrack' }) },
                  ])} accessibilityRole="button">
                    <Text style={[styles.actionText, { color: '#E06C62' }]}>Remove from playlist</Text>
                  </TouchableOpacity>
                </View>
            )}
            <TouchableOpacity style={styles.actionRow} onPress={() => {
              if (!showPlaylistPicker) onAction({ type: 'LoadSongPlaylists' });
              setShowPlaylistPicker(!showPlaylistPicker);
            }} accessibilityRole="button">
              <Text style={[styles.actionText, { color: colors.onSurface }]}>Add to playlist</Text>
            </TouchableOpacity>
            {showPlaylistPicker && (
              <View style={styles.playlistPicker}>
                {state.playlistOptionsStatus === ContentStatus.Loading && <ActivityIndicator color={colors.primary} />}
                {state.playlistOptionsStatus === ContentStatus.Error && (
                  <Text style={{ color: colors.onSurfaceVariant }}>Could not load playlists</Text>
                )}
                <ScrollView style={styles.playlistList} nestedScrollEnabled>
                  {state.playlistOptions.map((playlist) => (
                    <TouchableOpacity
                      key={playlist.key}
                      style={styles.actionRow}
                      onPress={() => onAction({ type: 'AddSongToPlaylist', key: playlist.key })}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.actionText, { color: colors.onSurface }]}>{playlist.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TextInput
                  style={[styles.playlistNameInput, { color: colors.onSurface, borderColor: colors.outline }]}
                  placeholder="New playlist name"
                  placeholderTextColor={colors.onSurfaceVariant}
                  value={newPlaylistName}
                  onChangeText={setNewPlaylistName}
                  maxLength={80}
                />
                <TouchableOpacity
                  style={[styles.createPlaylistButton, { backgroundColor: colors.primary, opacity: newPlaylistName.trim() ? 1 : 0.5 }]}
                  disabled={!newPlaylistName.trim()}
                  onPress={() => onAction({ type: 'CreatePlaylistWithSong', name: newPlaylistName.trim() })}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>Create playlist with this song</Text>
                </TouchableOpacity>
              </View>
            )}
            {!!state.connectionMessage && <Text style={{ color: '#E06C62' }}>{state.connectionMessage}</Text>}
            <TouchableOpacity style={styles.actionRow} onPress={() => onAction({ type: 'CloseSongActions' })} accessibilityRole="button">
              <Text style={[styles.actionText, { color: colors.primary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal
        visible={playlistDialog != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPlaylistDialog(null)}
      >
        <View style={styles.actionOverlay}>
          <View style={[styles.actionSheet, { backgroundColor: colors.surfaceContainer, borderColor: colors.outline }]}>
            <Text style={[styles.actionTitle, { color: colors.onSurface }]}>
              {playlistDialog?.import ? 'Import playlist' : playlistDialog?.key ? 'Manage playlist' : 'New playlist'}
            </Text>
            <TextInput
              style={[styles.playlistNameInput, { color: colors.onSurface, borderColor: colors.outline }]}
              placeholder="Playlist name"
              placeholderTextColor={colors.onSurfaceVariant}
              value={editPlaylistName}
              onChangeText={setEditPlaylistName}
              maxLength={80}
            />
            <TouchableOpacity
              style={[styles.createPlaylistButton, { backgroundColor: colors.primary, opacity: editPlaylistName.trim() ? 1 : 0.5 }]}
              disabled={!editPlaylistName.trim()}
              onPress={() => {
                if (playlistDialog?.import) onAction({ type: 'ImportPlaylist', name: editPlaylistName.trim() });
                else if (playlistDialog?.key) onAction({ type: 'RenamePlaylist', key: playlistDialog.key, name: editPlaylistName.trim() });
                else onAction({ type: 'CreateEmptyPlaylist', name: editPlaylistName.trim() });
                setPlaylistDialog(null);
              }}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>{playlistDialog?.import ? 'Choose file' : playlistDialog?.key ? 'Rename' : 'Create'}</Text>
            </TouchableOpacity>
            {!!playlistDialog?.key && (
              <TouchableOpacity style={styles.actionRow} onPress={() => Alert.alert('Delete playlist?', playlistDialog.name, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => {
                  onAction({ type: 'DeletePlaylist', key: playlistDialog.key! });
                  setPlaylistDialog(null);
                } },
              ])} accessibilityRole="button">
                <Text style={[styles.actionText, { color: '#E06C62' }]}>Delete playlist</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionRow} onPress={() => setPlaylistDialog(null)} accessibilityRole="button">
              <Text style={[styles.actionText, { color: colors.primary }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

export const LibraryScreen = React.memo(LibraryScreenContent, (before, after) => {
  const a = before.state;
  const b = after.state;
  return before.category === after.category && before.colors === after.colors &&
    before.onAction === after.onAction &&
    a.connectionStatus === b.connectionStatus && a.connectionMessage === b.connectionMessage &&
    a.libraryEntries === b.libraryEntries && a.libraryIsNested === b.libraryIsNested &&
    a.libraryNestedTitle === b.libraryNestedTitle && a.libraryQuery === b.libraryQuery &&
    a.libraryCountLabel === b.libraryCountLabel && a.libraryStatus === b.libraryStatus &&
    a.libraryHasMore === b.libraryHasMore && a.catalogSyncMessage === b.catalogSyncMessage &&
    a.songActionsVisible === b.songActionsVisible && a.songActionTitle === b.songActionTitle &&
    a.playlistOptions === b.playlistOptions && a.playlistOptionsStatus === b.playlistOptionsStatus &&
    a.songActionFavorite === b.songActionFavorite && a.songActionPosition === b.songActionPosition &&
    a.playlistTrackCount === b.playlistTrackCount && a.activePlaylist === b.activePlaylist &&
    a.playlistRevision === b.playlistRevision && a.supportedFeatures === b.supportedFeatures;
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  nestedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nestedTitle: {
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 10,
  },
  categoryScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
  },
  chipText: {
    fontSize: 13,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  countLabel: {
    fontSize: 12,
    flex: 1,
  },
  toolbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  sortText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orderLabel: {
    fontSize: 11,
  },
  viewToggle: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncMessage: {
    fontSize: 12,
    marginBottom: 6,
  },
  stateMessage: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 14,
  },
  loadingContainer: {
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridTile: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    padding: 10,
    alignItems: 'center',
  },
  tileTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
    width: '100%',
  },
  tileSubtitle: {
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
    width: '100%',
  },
  listCard: {
    padding: 0,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  listText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  rowSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  rowChevron: {
    fontSize: 18,
  },
  entryActionButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  actionSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    gap: 8,
  },
  actionTitle: {
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 4,
  },
  actionRow: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  actionText: {
    fontSize: 15,
  },
  playlistPicker: {
    gap: 8,
  },
  playlistList: {
    maxHeight: 180,
  },
  playlistNameInput: {
    height: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  createPlaylistButton: {
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  showMoreButton: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  showMoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
  loadMoreButton: {
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
