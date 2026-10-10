/**
 * Background catalog and artwork synchronization worker.
 * Directly implements the staging/active snapshot, revision checking,
 * and prioritized artwork downloading logic from Compás Remote.
 */

import { RemoteApi } from '../core/api';
import { SyncedCatalogStore, COVER_STORED, COVER_MISSING, COVER_PERMANENT_FAILURE } from './syncedCatalogStore';
import { SyncedCoverStore } from './syncedCoverStore';
import {
  matchesStoredCatalogSnapshot,
  canFinishCatalogSyncFromSnapshot,
  prioritizeCatalogItems,
  BluetoothRequestPolicy,
} from '../core/policies';
import { ConnectionTransport } from '../core/models';
import { base64ToBytes } from '../data/cryptoUtils';

export interface SyncProgressUpdate {
  message: string;
  stage: 'catalog' | 'covers_manifest' | 'covers_download' | 'complete' | 'idle';
  current: number;
  total: number;
}

export type SyncProgressListener = (update: SyncProgressUpdate) => void;

export class CatalogSyncWorker {
  private isCancelled = false;

  cancel(): void {
    this.isCancelled = true;
  }

  async runSync(
    api: RemoteApi,
    catalogStore: SyncedCatalogStore,
    coverStore: SyncedCoverStore,
    options: {
      transport: ConnectionTransport;
      isPlaying: boolean;
      bluetoothAudioOutput?: boolean | null;
      priorityAlbumKeys?: string[];
      onProgress?: SyncProgressListener;
      onPublished?: (identity: { libraryId: string; revision: string }) => void;
    }
  ): Promise<{ libraryId: string; revision: string } | null> {
    this.isCancelled = false;
    const notify = (msg: string, stage: SyncProgressUpdate['stage'], current: number, total: number) => {
      if (options.onProgress) {
        options.onProgress({ message: msg, stage, current, total });
      }
    };

    notify('Checking catalog revision…', 'catalog', 0, 0);

    // 1. Probe first page to check revision
    const firstPage = await api.catalog(0, RemoteApi.CATALOG_PAGE_LIMIT);
    if (this.isCancelled) return null;

    const libraryId = firstPage.libraryId;
    const revision = firstPage.revision;
    const totalSongs = firstPage.total;

    const active = await catalogStore.activeIdentity(libraryId);
    const activeSongs = active ? await catalogStore.activeSongCount(libraryId, active.revision) : 0;

    const catalogMatches = matchesStoredCatalogSnapshot(
      libraryId,
      revision,
      totalSongs,
      active?.libraryId,
      active?.revision,
      active?.total ?? 0,
      activeSongs
    );

    if (catalogMatches) {
      options.onPublished?.({ libraryId, revision });
    } else {
      notify(`Syncing songs (0/${totalSongs})…`, 'catalog', 0, totalSongs);
      let nextOffset = await catalogStore.beginCatalogStage(libraryId, revision, totalSongs);

      if (nextOffset === 0) {
        await catalogStore.writeCatalogPage(firstPage);
        nextOffset = firstPage.nextOffset;
        notify(`Syncing songs (${nextOffset}/${totalSongs})…`, 'catalog', nextOffset, totalSongs);
      }

      while (nextOffset < totalSongs && !this.isCancelled) {
        const page = await api.catalog(nextOffset, RemoteApi.CATALOG_PAGE_LIMIT, revision);
        if (this.isCancelled) return null;
        await catalogStore.writeCatalogPage(page);
        nextOffset = page.nextOffset;
        notify(`Syncing songs (${nextOffset}/${totalSongs})…`, 'catalog', nextOffset, totalSongs);
      }

      if (this.isCancelled) return null;
      await catalogStore.publishCatalog(libraryId, revision, totalSongs);
      options.onPublished?.({ libraryId, revision });
    }

    // 3. Manifest synchronization
    notify('Syncing cover manifest…', 'covers_manifest', 0, 0);
    const firstCovers = await api.catalogCovers(0, RemoteApi.CATALOG_PAGE_LIMIT, revision);
    if (this.isCancelled) return null;

    const totalCovers = firstCovers.total;
    const coverProgress = await catalogStore.beginCovers(libraryId, revision, totalCovers);
    let nextCoverOffset = coverProgress.nextOffset;

    if (!coverProgress.manifestComplete) {
      if (nextCoverOffset === 0) {
        await catalogStore.writeCoverPage(firstCovers);
        nextCoverOffset = firstCovers.nextOffset;
        notify(`Syncing covers (${nextCoverOffset}/${totalCovers})…`, 'covers_manifest', nextCoverOffset, totalCovers);
      }

      while (nextCoverOffset < totalCovers && !this.isCancelled) {
        const coversPage = await api.catalogCovers(nextCoverOffset, RemoteApi.CATALOG_PAGE_LIMIT, revision);
        if (this.isCancelled) return null;
        await catalogStore.writeCoverPage(coversPage);
        nextCoverOffset = coversPage.nextOffset;
        notify(`Syncing covers (${nextCoverOffset}/${totalCovers})…`, 'covers_manifest', nextCoverOffset, totalCovers);
      }

      if (this.isCancelled) return null;
      await catalogStore.publishCovers(libraryId, revision, totalCovers);
    }

    // 4. Download missing covers
    let pending = await catalogStore.pendingCovers(libraryId, revision);
    if (pending.length === 0) {
      notify('Catalog sync complete', 'complete', totalCovers, totalCovers);
      return { libraryId, revision };
    }

    // Check if we should defer bulk Bluetooth downloads while audio is playing
    if (
      !BluetoothRequestPolicy.allowsArtworkRequest(
        options.transport,
        options.isPlaying,
        options.bluetoothAudioOutput
      )
    ) {
      notify('Cover sync deferred during Bluetooth playback', 'idle', 0, pending.length);
      return { libraryId, revision };
    }

    if (options.priorityAlbumKeys && options.priorityAlbumKeys.length > 0) {
      pending = prioritizeCatalogItems(pending, options.priorityAlbumKeys, (c) => c.albumKey);
    }

    let completed = await catalogStore.completedCoverCount(libraryId, revision);
    for (const cover of pending) {
      if (this.isCancelled) return null;

      // Check if already in persistent cover store
      const alreadyHas = await coverStore.contains(libraryId, cover.coverKey);
      if (alreadyHas) {
        await catalogStore.markCoverState(libraryId, revision, cover.albumKey, COVER_STORED);
        completed++;
        notify(`Cover art downloaded (${completed}/${totalCovers})`, 'covers_download', completed, totalCovers);
        continue;
      }

      // Check Bluetooth priority mid-download
      if (
        !BluetoothRequestPolicy.allowsArtworkRequest(
          options.transport,
          options.isPlaying,
          options.bluetoothAudioOutput
        )
      ) {
        notify('Cover sync deferred during Bluetooth playback', 'idle', completed, totalCovers);
        return { libraryId, revision };
      }

      try {
        const artImage = await api.catalogArt(revision, cover.representativeId, cover.coverKey);
        if (this.isCancelled) return null;

        const artBytes = artImage ? base64ToBytes(artImage.base64) : null;
        if (artBytes && artBytes.length > 0) {
          await coverStore.put(libraryId, cover.coverKey, artBytes);
          await catalogStore.markCoverState(libraryId, revision, cover.albumKey, COVER_STORED);
        } else {
          await catalogStore.markCoverState(libraryId, revision, cover.albumKey, COVER_MISSING);
        }
      } catch (err: any) {
        if (err.statusCode === 404) {
          await catalogStore.markCoverState(libraryId, revision, cover.albumKey, COVER_MISSING);
        } else if (err.statusCode === 413) {
          await catalogStore.markCoverState(libraryId, revision, cover.albumKey, COVER_PERMANENT_FAILURE);
        } else if (err.statusCode === 409) {
          // Stale revision, restart
          return null;
        }
      }

      completed++;
      notify(`Cover art downloaded (${completed}/${totalCovers})`, 'covers_download', completed, totalCovers);
    }

    notify('Catalog sync complete', 'complete', totalCovers, totalCovers);
    return { libraryId, revision };
  }
}
