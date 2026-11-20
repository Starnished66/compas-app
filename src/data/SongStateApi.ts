import { REMOTE_API_PREFIX, assertIntegerArgument, jsonBoolean, parseRating, type RemoteApiRequests } from './remoteApiProtocol';

export class SongStateApi {
  constructor(private readonly requests: Pick<RemoteApiRequests, 'jsonGet' | 'request' | 'execute' | 'ensureSuccess'>) {}

  async favoriteStates(ids: number[]): Promise<Map<number, boolean>> {
    return this.songStates(ids, 'favorites', (item) => jsonBoolean(item.favorite));
  }

  async ratingStates(ids: number[]): Promise<Map<number, number>> {
    return this.songStates(ids, 'ratings', (item) => parseRating(item.rating));
  }

  private async songStates<T>(ids: number[], family: 'favorites' | 'ratings', read: (item: any) => T | null): Promise<Map<number, T>> {
    if (!ids.length || ids.length > 100) throw new Error('Song state batch must contain 1 to 100 songs');
    ids.forEach((id) => assertIntegerArgument(id, 'Song ID', 1));
    const json = await this.requests.jsonGet(`${REMOTE_API_PREFIX}/${family}/state`, [['ids', ids.join(',')]]);
    const states = new Map<number, T>();
    for (const item of Array.isArray(json.songs) ? json.songs : []) {
      if (!item?.found) continue;
      const value = read(item);
      if (value !== null) states.set(Number(item.index), value);
    }
    return states;
  }

  async setFavorite(favorite: boolean, index?: number, catalogRevision?: string | null, signal?: AbortSignal): Promise<boolean> {
    const result = await this.writeSongRating(`favorites/${favorite ? 'add' : 'remove'}`, [], index, catalogRevision, signal);
    return jsonBoolean(result.favorite);
  }

  async setRating(index: number | undefined, stars: number, catalogRevision?: string | null, signal?: AbortSignal): Promise<number> {
    assertIntegerArgument(stars, 'Rating', 0, 5);
    const result = await this.writeSongRating('ratings/set', [['rating', String(stars)]], index, catalogRevision, signal);
    const rating = parseRating(result?.rating);
    if (rating == null) throw new Error('Could not update rating');
    return rating;
  }

  private async writeSongRating(
    path: string, params: [string, string][], index?: number, catalogRevision?: string | null, queueSignal?: AbortSignal,
  ) {
    if (index == null) {
      params.push(['current', '1']);
    } else {
      assertIntegerArgument(index, 'Song ID', 1);
      params.push(['index', String(index)]);
      if (catalogRevision) params.push(['catalog_revision', catalogRevision]);
    }
    const request = this.requests.request('POST', `${REMOTE_API_PREFIX}/${path}`, params);
    const res = await this.requests.execute(queueSignal ? { ...request, queueSignal } : request);
    this.requests.ensureSuccess(res);
    return JSON.parse(res.text());
  }
}
