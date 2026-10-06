import { QueuePage, Song } from './types';

export interface RemoteApiQueueInterface {
  queue(offset: number, limit: number): Promise<QueuePage>;
}

export interface SongWithOffset {
  song: Song;
  offset: number;
}

export class QueueReader {
  static readonly PAGE_SIZE = 25;

  static async loadAll(remote: RemoteApiQueueInterface): Promise<{ songs: SongWithOffset[]; revision: number }> {
    const first = await remote.queue(0, QueueReader.PAGE_SIZE);
    const songs = await QueueReader.loadFromFirstPage(remote, first);
    return { songs, revision: first.revision };
  }

  static async loadFromFirstPage(remote: RemoteApiQueueInterface, first: QueuePage): Promise<SongWithOffset[]> {
    const songs: SongWithOffset[] = QueueReader.withOffsets(first.songs, first.offset);
    let offset = first.offset + first.songs.length;

    while (offset < first.total) {
      const page = await remote.queue(offset, QueueReader.PAGE_SIZE);
      if (page.revision !== first.revision) {
        throw new Error('The queue changed while it was loading; retry');
      }
      if (page.offset !== offset) {
        throw new Error('The queue returned an unexpected page offset; retry');
      }
      if (page.songs.length === 0) {
        throw new Error('The queue returned an empty page before the end; retry');
      }
      songs.push(...QueueReader.withOffsets(page.songs, page.offset));
      offset = page.offset + page.songs.length;
    }

    return songs;
  }

  private static withOffsets(songs: Song[], pageOffset: number): SongWithOffset[] {
    return songs.map((song, index) => ({
      song,
      offset: song.offset != null ? song.offset : pageOffset + index,
    }));
  }
}
