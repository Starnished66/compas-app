import { type LibrarySnapshot } from './librarySnapshot';
import { QueueTarget } from './queueTargets';
import { useState, useRef, type Dispatch, type SetStateAction } from 'react';
import { AppState } from 'react-native';
import {
  RemoteUiState,
  RemoteScreen,
  ConnectionTransport,
  PlaybackMode,
  LibraryCategory,
  RemoteTrack,
  Playlist,
  LibrarySortingSnapshot,
} from '../data/types';
import { RemoteApi } from '../data/RemoteApi';
import { SecurePinStore } from '../data/SecurePinStore';
import { ArtworkDiskCache } from '../data/ArtworkDiskCache';
import { liveCatalogStore, CatalogIdentity, StoredCatalogCover } from '../data/SyncedCatalogStore';
import { SyncedCoverStore } from '../data/SyncedCoverStore';
import type { ArtworkReference } from '../data/MemoryArtworkCache';
import { QueueArtworkLoader } from './queueArtwork';
import { useLazyRef } from './useLazyRef';
import { LibraryArtworkStore } from './LibraryArtworkStore';
import { EntryTarget, LibraryContext, LibraryEntryFactory } from './LibraryEntryFactory';
import { LibraryListCache } from './LibraryListCache';
import { SearchReads } from './libraryCategoryLoader';
import { PlaybackStatusGate } from './PlaybackStatusGate';
import { CatalogSyncProgressStore } from './CatalogSyncProgressStore';
import { PlaybackPositionStore } from './PlaybackPositionStore';

function useConnectionRefs() {
  const apiRef = useRef<RemoteApi | null>(null);
  const mountedRef = useRef(true);
  const connectedPlayerKeyRef = useRef<string | null>(null);
  const lastPlayerKeyRef = useRef<string | null>(null);
  const pinStoreRef = useLazyRef(() => new SecurePinStore());
  const featureSetRef = useRef<Set<string>>(new Set());
  const connectionAttemptRef = useRef<number>(0);
  // Counts established player sessions; a same-player Wi-Fi handoff keeps the number.
  const playerSessionRef = useRef(0);
  const discoveryGenerationRef = useRef(0);
  const wifiDiscoveryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wifiDiscoverySourcesRef = useRef(new Map<string, string>());
  const wifiDiscoveryProbesRef = useRef(new Set<string>());
  const pinCooldownTimerRef = useRef<any>(null);
  const autoReconnectTimerRef = useRef<any>(null);
  const autoReconnectEnabledRef = useRef<boolean>(true);
  const lastConnectionTransportRef = useRef<ConnectionTransport | null>(null);
  const bluetoothPairingRequiredRef = useRef(false);
  const autoReconnectGenerationRef = useRef(0);
  const wifiAddressEditedRef = useRef<boolean>(false);
  const autoReconnectDueAtRef = useRef(0);
  const wifiHostnameByIpRef = useRef(new Map<string, string>());
  return {
    apiRef, mountedRef, connectedPlayerKeyRef, lastPlayerKeyRef, pinStoreRef, featureSetRef,
    connectionAttemptRef, playerSessionRef, discoveryGenerationRef, wifiDiscoveryTimerRef,
    wifiDiscoverySourcesRef, wifiDiscoveryProbesRef, pinCooldownTimerRef,
    autoReconnectTimerRef, autoReconnectEnabledRef, lastConnectionTransportRef,
    bluetoothPairingRequiredRef, autoReconnectGenerationRef,
    wifiAddressEditedRef, autoReconnectDueAtRef, wifiHostnameByIpRef,
  };
}

function useCatalogRefs() {
  const catalogSyncGenerationRef = useRef<number>(0);
  const catalogSyncProgress = useLazyRef(() => new CatalogSyncProgressStore()).current;
  const artCacheRef = useLazyRef(() => new ArtworkDiskCache());
  const syncedCatalogStoreRef = useRef(liveCatalogStore);
  const syncedCoverStoreRef = useLazyRef(() => new SyncedCoverStore());
  const activeCatalogRef = useRef<CatalogIdentity | null>(null);
  const catalogCoversByAlbumRef = useRef<Map<string, StoredCatalogCover>>(new Map());
  const syncedCoverUriCacheRef = useRef<Map<string, string>>(new Map());
  const lastCatalogCoverProgressAtRef = useRef(0);
  return {
    catalogSyncGenerationRef, catalogSyncProgress, artCacheRef, syncedCatalogStoreRef, syncedCoverStoreRef,
    activeCatalogRef, catalogCoversByAlbumRef, syncedCoverUriCacheRef,
    lastCatalogCoverProgressAtRef,
  };
}

function useLibraryRefs({ activeCatalogRef, syncedCoverUriCacheRef }: Pick<ReturnType<typeof useCatalogRefs>, 'activeCatalogRef' | 'syncedCoverUriCacheRef'>) {
  const libraryEntriesRef = useLazyRef(
    () =>
      new LibraryEntryFactory({
        coverUri: (albumKey) => syncedCoverUriCacheRef.current.get(albumKey),
        activeRevision: () => activeCatalogRef.current?.revision ?? null,
      }),
  );
  const libraryListCacheRef = useLazyRef(() => new LibraryListCache());
  const shownLibraryListRef = useRef<string | null>(null);
  const libraryBrowseCatalogRef = useRef<CatalogIdentity | null>(null);
  const screenBackStackRef = useRef<RemoteScreen[]>([]);
  const libraryBackStackRef = useRef<LibrarySnapshot[]>([]);
  const libraryContextRef = useRef<LibraryContext | null>(null);
  const libraryPageRef = useRef<LibrarySnapshot['page']>(null);
  const extensionPageRef = useRef<LibrarySnapshot['extensionPage']>(null);
  const activePlaylistRef = useRef<Playlist | null>(null);
  const libraryPageLoadingRef = useRef<number | null>(null);
  const currentLibraryCategoryRef = useRef<LibraryCategory>(LibraryCategory.Artists);
  const libraryLoadGenerationRef = useRef(0);
  const librarySortingRef = useRef<LibrarySortingSnapshot | null>(null);
  const sortingEpochRef = useRef(0);
  const sortingRefreshAtRef = useRef(0);
  const sortingWriteRef = useRef(false);
  const searchDebounceRef = useRef<{ timer: ReturnType<typeof setTimeout>; query: string } | null>(null);
  const transferSearchQueryRef = useRef('');
  const searchReads = useLazyRef(() => new SearchReads()).current;
  const deferredBluetoothArtworkEntryIdsRef = useRef<string[]>([]);
  const [libraryArtwork] = useState(() => new LibraryArtworkStore());
  return {
    libraryEntriesRef, libraryListCacheRef, shownLibraryListRef, libraryBrowseCatalogRef,
    screenBackStackRef, libraryBackStackRef, libraryContextRef, libraryPageRef,
    extensionPageRef, activePlaylistRef, libraryPageLoadingRef, currentLibraryCategoryRef,
    libraryLoadGenerationRef, librarySortingRef, sortingEpochRef,
    sortingRefreshAtRef, sortingWriteRef, searchDebounceRef, transferSearchQueryRef,
    searchReads, deferredBluetoothArtworkEntryIdsRef, libraryArtwork,
  };
}

function useQueueRefs() {
  const queueTargetsRef = useRef<Map<string, QueueTarget>>(new Map());
  const queueArtworkBySongRef = useRef<Map<number, string>>(new Map());
  const queueArtworkLoader = useLazyRef(() => new QueueArtworkLoader()).current;
  const entryIdCounterRef = useRef<number>(0);
  const nextEntryId = (prefix: string): string => `${prefix}-${++entryIdCounterRef.current}`;
  const queueRevisionRef = useRef<number>(0);
  const queueRefreshGenerationRef = useRef(0);
  const queuePageGenerationRef = useRef(0);
  const queueRefreshRef = useRef<{ api: RemoteApi; started: { at: number; command: number } | null; owns: () => boolean; done: Promise<void> } | null>(null);
  const queueArtworkPendingRef = useRef(new Map<number, ArtworkReference>());
  const queueArtworkFlushTimerRef = useRef<any>(null);
  const lastQueueRefreshAtRef = useRef(0);
  return {
    queueTargetsRef, queueArtworkBySongRef, queueArtworkLoader, nextEntryId, queueRevisionRef,
    queueRefreshGenerationRef, queuePageGenerationRef, queueRefreshRef, queueArtworkPendingRef,
    queueArtworkFlushTimerRef, lastQueueRefreshAtRef,
  };
}

function useEditsRefs() {
  const songActionEntryIdRef = useRef<string | null>(null);
  const songActionTargetRef = useRef<Extract<EntryTarget, { type: 'Song' }> | null>(null);
  const songActionBusyRef = useRef(false);
  const bulkSelectionsRef = useRef(new Map<string[], { targets: EntryTarget[]; ownsSource: () => boolean }>());
  const bulkActionRunRef = useRef(0);
  const bulkActionBusyRef = useRef(false);
  const bulkActionCancelledRef = useRef(false);
  const collectionPendingRef = useRef<{ id: number; api: RemoteApi; attempt: number; startedAt: number } | null>(null);
  const collectionStartTokenRef = useRef(0);
  const collectionStartingRef = useRef(false);
  return {
    songActionEntryIdRef, songActionTargetRef, songActionBusyRef, bulkSelectionsRef,
    bulkActionRunRef, bulkActionBusyRef, bulkActionCancelledRef, collectionPendingRef,
    collectionStartTokenRef, collectionStartingRef,
  };
}

function usePlaybackRefs() {
  const gateRef = useLazyRef(() => new PlaybackStatusGate());
  const positionStoreRef = useLazyRef(() => new PlaybackPositionStore());
  const lastNonShuffleModeRef = useRef<PlaybackMode>(PlaybackMode.RepeatAll);
  const currentTrackRef = useRef<RemoteTrack | null>(null);
  const latestPlayingRef = useRef<boolean>(false);
  const bluetoothAudioOutputRef = useRef<boolean | null>(null);
  const appForegroundRef = useRef(AppState.currentState === 'active');
  const lastBluetoothArtworkAtRef = useRef(0);
  const pendingSeekRef = useRef<{
    positionMs: number;
    startedAtMs: number;
    commandCompletedAtMs: number | null;
  } | null>(null);
  const pendingVolumeRef = useRef<{
    volume: number;
    commandCompletedAtMs: number | null;
    expiresAtMs: number;
  } | null>(null);
  return {
    gateRef, positionStoreRef, lastNonShuffleModeRef, currentTrackRef, latestPlayingRef,
    bluetoothAudioOutputRef, appForegroundRef, lastBluetoothArtworkAtRef, pendingSeekRef,
    pendingVolumeRef,
  };
}

export function useSessionRefs(state: RemoteUiState, setState: Dispatch<SetStateAction<RemoteUiState>>) {
  const connection = useConnectionRefs();
  const catalog = useCatalogRefs();
  const library = useLibraryRefs(catalog);
  const queue = useQueueRefs();
  const edits = useEditsRefs();
  const playback = usePlaybackRefs();
  const stateRef = useRef(state);
  stateRef.current = state;
  return { ...connection, ...catalog, ...library, ...queue, ...edits, ...playback, stateRef, setState };
}

export type SessionState = ReturnType<typeof useSessionRefs>;
