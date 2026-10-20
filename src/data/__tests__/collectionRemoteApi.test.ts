jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async () => { throw new Error('expo-crypto is unavailable under Jest'); },
}));

import { createHttpResponse, HttpRequest, HttpResponse, HttpTransport } from '../HttpTransport';
import { RemoteApi, RemoteApiException } from '../RemoteApi';

const jsonResponse = (status: number, value: unknown): HttpResponse =>
  createHttpResponse(status, status === 202 ? 'Accepted' : 'OK', { 'content-type': 'application/json' },
    new TextEncoder().encode(JSON.stringify(value)));

class ScriptedHttpTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];

  constructor(private readonly responses: HttpResponse[]) {}

  async execute(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (!response) throw new Error(`No scripted response for ${request.method} ${request.target}`);
    return response;
  }
}

function apiWith(...responses: HttpResponse[]) {
  const transport = new ScriptedHttpTransport(responses);
  return { api: new RemoteApi(transport, '123456'), transport };
}

describe('RemoteApi collection, sorting, and album page contracts', () => {
  it('URL-encodes a Unicode playlist key and carries the catalog revision', async () => {
    const { api, transport } = apiWith(jsonResponse(202, { id: 42 }));
    await expect(api.playCollection({
      scope: 'playlist', mode: 4, name: 'Beyoncé 日本', catalogRevision: 'library:7/β',
    })).resolves.toBe(42);
    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      target: '/api/v1/playback/collection?scope=playlist&mode=4&name=Beyonc%C3%A9+%E6%97%A5%E6%9C%AC&catalog_revision=library%3A7%2F%CE%B2',
      headers: { [RemoteApi.PIN_HEADER]: '123456' },
    });
  });

  it('sends a finite-shuffle album request with an empty album artist value', async () => {
    const { api, transport } = apiWith(jsonResponse(202, { id: 43 }));
    await expect(api.playCollection({
      scope: 'album', mode: 4, name: 'No album artist', albumArtist: '', catalogRevision: 'library:8',
    })).resolves.toBe(43);
    expect(transport.requests[0].target).toBe('/api/v1/playback/collection?scope=album&mode=4&name=No+album+artist&album_artist=&catalog_revision=library%3A8');
  });

  it('sends an artist-filtered album without an album-artist parameter', async () => {
    const { api, transport } = apiWith(jsonResponse(202, { id: 44 }));
    await expect(api.playCollection({
      scope: 'album', mode: 4, name: 'Shared Album', artist: 'Zoë & Friends', catalogRevision: 'library:9',
    })).resolves.toBe(44);
    expect(transport.requests[0].target).toBe('/api/v1/playback/collection?scope=album&mode=4&name=Shared+Album&artist=Zo%C3%AB+%26+Friends&catalog_revision=library%3A9');
  });

  it('requires a positive safe collection job ID', async () => {
    const { api } = apiWith(jsonResponse(202, { id: 0 }));
    await expect(api.playCollection({ scope: 'all', mode: 4 })).rejects.toThrow('Invalid collection job');
  });

  it('maps collection_job state from snake case and drops invalid states', async () => {
    const { api } = apiWith(
      jsonResponse(200, { playing: false, paused: true, collection_job: { id: 9, state: 'pending', error: '' } }),
      jsonResponse(200, { playing: false, paused: true, collection_job: { id: 10, state: 'running', error: null } }),
      jsonResponse(200, { playing: false, paused: true, collection_job: { id: 11, state: 'finished' } }),
      jsonResponse(200, { playing: false, paused: true, collection_job: { id: '12', state: 'done' } }),
    );

    await expect(api.status()).resolves.toMatchObject({ collectionJob: { id: 9, state: 'pending', error: '' } });
    await expect(api.status()).resolves.toMatchObject({ collectionJob: null });
    await expect(api.status()).resolves.toMatchObject({ collectionJob: null });
    await expect(api.status()).resolves.toMatchObject({ collectionJob: null });
  });

  it('maps album_artists sorting key and sends sorting writes as POST', async () => {
    const { api, transport } = apiWith(
      jsonResponse(200, {
        albums: { configured: 1, effective: 1, available: [true, true, false] },
        artists: { configured: 0, effective: 0, available: [true, false, false] },
        album_artists: { configured: 2, effective: 0, available: [true, true, false] },
      }),
      createHttpResponse(202, 'Accepted', {}, new Uint8Array()),
    );

    await expect(api.librarySorting()).resolves.toEqual({
      albums: { configured: 1, effective: 1, available: [true, true, false] },
      artists: { configured: 0, effective: 0, available: [true, false, false] },
      albumArtists: { configured: 2, effective: 0, available: [true, true, false] },
    });
    await api.setLibrarySorting('album_artists', 2);
    expect(transport.requests[1]).toMatchObject({
      method: 'POST',
      target: '/api/v1/library/sorting?scope=album_artists&mode=2',
    });
  });

  it('parses album group pages and preserves their revision and offsets', async () => {
    const { api, transport } = apiWith(jsonResponse(200, {
      total: 18,
      offset: 10,
      next_offset: 12,
      revision: '7:1:2:2',
      groups: [
        { name: 'Shared Album', count: 4, index: 31, album_artist: 'Artist One' },
        { name: 'A+B', count: 2, index: 44, album_artist: '' },
      ],
    }));

    await expect(api.libraryAlbumGroups({
      scope: 'artists', artist: 'Zoë & Sons', offset: 10, limit: 2,
    })).resolves.toEqual({
      total: 18,
      offset: 10,
      nextOffset: 12,
      revision: '7:1:2:2',
      groups: [
        { name: 'Shared Album', count: 4, index: 31, albumArtist: 'Artist One', albumKey: null },
        { name: 'A+B', count: 2, index: 44, albumArtist: '', albumKey: null },
      ],
    });
    expect(transport.requests[0].target).toBe('/api/v1/library/albums?scope=artists&offset=10&limit=2&artist=Zo%C3%AB+%26+Sons');
  });

  it('surfaces HTTP errors from album group paging', async () => {
    const { api } = apiWith(jsonResponse(409, { error: 'catalog_error', code: 'library_changed' }));
    const error = await api.libraryAlbumGroups({ scope: 'albums', offset: 25 }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(RemoteApiException);
    expect((error as RemoteApiException).statusCode).toBe(409);
  });
});
