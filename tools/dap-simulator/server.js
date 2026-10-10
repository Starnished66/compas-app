#!/usr/bin/env node
// DAP simulator: a fake player implementing Remote API v1 over HTTP,
// so the app can be driven end to end (connect, PIN, now playing, library,
// catalog sync, queue, playlists, folders, favorites) without the hardware.
//
//   npm run simulator -- [--port 8899] [--pin 1234] [--latency 150] [--albums 3] [--artists 12] [--empty]
//
// The app talks to it over the Wi-Fi transport. Enter the address on the
// Connection screen (discovery via DNS-SD is not simulated):
//   Android emulator:            10.0.2.2:8899
//   USB device + adb reverse:    127.0.0.1:8899   (adb reverse tcp:8899 tcp:8899)
//   Device on the same network:  <this machine's LAN IP>:8899
// Type `help` in the simulator's terminal for live controls.

const http = require('http');
const os = require('os');
const readline = require('readline');
const {generateLibrary, mulberry32, NAMED_ARTIST_COUNT} = require('./library');
const {cachedCover} = require('./art');

// ---------------------------------------------------------------- options

function parseArgs(argv) {
  const opts = {port: 8899, pin: null, latency: 0, albums: 3, artists: NAMED_ARTIST_COUNT, empty: false, quiet: false};
  for(let i = 0;i < argv.length;i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if(arg === '--port') opts.port = Number(next());
    else if(arg === '--pin') opts.pin = String(next());
    else if(arg === '--latency') opts.latency = Number(next());
    else if(arg === '--albums') opts.albums = Number(next());
    else if(arg === '--artists') opts.artists = Number(next());
    else if(arg === '--empty') opts.empty = true;
    else if(arg === '--quiet') opts.quiet = true;
    else if(arg === '--help' || arg === '-h') {
      console.log('Usage: npm run simulator -- [--port 8899] [--pin 1234] [--latency ms] [--albums n] [--artists n] [--empty] [--quiet]');
      process.exit(0);
    } else {
      console.error(`Unknown option: ${ arg }`);
      process.exit(2);
    }
  }
  if(!Number.isInteger(opts.artists) || opts.artists < 1) {
    console.error('--artists must be a positive integer');
    process.exit(2);
  }
  if(opts.pin != null && !/^[0-9]{4,12}$/.test(opts.pin)) {
    console.error('--pin must be 4 to 12 digits');
    process.exit(2);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

// ---------------------------------------------------------------- state

const lib = generateLibrary(7, opts.albums, opts.artists);
const songById = new Map(lib.songs.map((s) => [s.id, s]));
const albumByKey = new Map(lib.albums.map((a) => [a.albumKey, a]));
const songByPath = new Map(lib.songs.map((s) => [s.path, s]));
const rand = mulberry32(99);

const PLAY_MODES = ['Sequential', 'Repeat all', 'Repeat one', 'Shuffle'];
const FEATURES = [
  'catalog_sync_v1',
  'folder_browse',
  'recently_played',
  'favorites_edit',
  'queue_edit',
  'playlist_edit',
  'playlist_import',
];

const state = {
  pin: opts.pin,
  pinFailures: 0,
  pinLockedUntil: 0,
  latency: opts.latency,
  offline: false,
  catalogRevisionCounter: 1,
  queue: [], // song ids
  queueRevision: 1,
  current: -1, // offset into queue
  playing: false,
  positionMs: 0,
  anchorAt: Date.now(), // wall clock at which positionMs was last pinned
  volume: 0.68,
  playMode: 0,
  favorites: new Set(),
  playCounts: new Map(),
  recent: [], // { id, at }
  playlists: new Map(), // key -> { songs: number[], revision: number }
};

const catalogRevision = () => `${ lib.libraryId }:${ state.catalogRevisionCounter }`;

// Seed favorites, play counts, recents and a couple of playlists so every list has content.
for(const song of lib.songs) {
  if(rand() > 0.9) state.favorites.add(song.id);
  if(rand() > 0.8) state.playCounts.set(song.id, 1 + Math.floor(rand() * 40));
}
for(let i = 0;i < 12;i++) {
  state.recent.push({id: lib.songs[Math.floor(rand() * lib.songs.length)].id, at: Date.now() - (i + 1) * 3_600_000});
}
const pickSongs = (n) => Array.from({length: n}, () => lib.songs[Math.floor(rand() * lib.songs.length)].id);
state.playlists.set('Road Trip', {songs: pickSongs(14), revision: 1});
state.playlists.set('Focus', {songs: pickSongs(60), revision: 1}); // > one 50-song page
state.playlists.set('Empty', {songs: [], revision: 1});

if(!opts.empty) {
  const firstAlbum = lib.albums[0];
  state.queue = [...firstAlbum.songIds];
  state.current = 0;
  state.positionMs = 37_000;
}

// ---------------------------------------------------------------- playback clock

function currentSong() {
  return state.current >= 0 && state.current < state.queue.length ? songById.get(state.queue[state.current]) : null;
}

function position() {
  return state.playing ? state.positionMs + (Date.now() - state.anchorAt) : state.positionMs;
}

function pin(positionMs) {
  state.positionMs = positionMs;
  state.anchorAt = Date.now();
}

function startTrack(offset) {
  state.current = offset;
  pin(0);
  const song = currentSong();
  if(song) {
    state.playCounts.set(song.id, (state.playCounts.get(song.id) || 0) + 1);
    state.recent = [{id: song.id, at: Date.now()}, ...state.recent.filter((r) => r.id !== song.id)].slice(0, 200);
  }
}

function nextOffset(fromUser) {
  const n = state.queue.length;
  if(!n) return -1;
  if(state.playMode === 3 && n > 1) {
    let pick = state.current;
    while(pick === state.current) pick = Math.floor(Math.random() * n);
    return pick;
  }
  if(state.playMode === 2 && !fromUser) return state.current;
  if(state.current + 1 < n) return state.current + 1;
  return state.playMode === 1 || fromUser ? 0 : -1;
}

// Advance through any tracks that finished since the last request.
function tick() {
  let song = currentSong();
  while(state.playing && song && position() >= song.durationSeconds * 1000) {
    const overflow = position() - song.durationSeconds * 1000;
    const next = nextOffset(false);
    if(next < 0) {
      state.playing = false;
      pin(0);
      return;
    }
    startTrack(next);
    state.anchorAt = Date.now() - overflow;
    song = currentSong();
  }
}

function setPlaying(playing) {
  pin(position());
  state.playing = playing && !!currentSong();
}

function replaceQueue(ids, startId) {
  state.queue = [...ids];
  state.queueRevision++;
  const start = Math.max(0, state.queue.indexOf(startId));
  startTrack(start);
  state.playing = true;
}

// ---------------------------------------------------------------- HTTP helpers

class ApiError extends Error {
  constructor (status, body) {
    super(body.error || `HTTP ${ status }`);
    this.status = status;
    this.body = body;
  }
}

const badRequest = (message) => new ApiError(400, {error: message, code: 'bad_request'});
const notFound = (message = 'not_found') => new ApiError(404, {error: message, code: 'not_found'});
const stale = (what) => new ApiError(409, {error: `${ what } revision is stale`, code: 'stale_revision'});

function intParam(q, name, {min = 0, max = Number.MAX_SAFE_INTEGER, def} = {}) {
  const raw = q.get(name);
  if(raw == null || raw === '') {
    if(def !== undefined) return def;
    throw badRequest(`missing ${ name }`);
  }
  if(!/^-?\d+$/.test(raw)) throw badRequest(`invalid ${ name }`);
  const value = Number(raw);
  if(value < min || value > max) throw badRequest(`${ name } out of range`);
  return value;
}

function requireParam(q, name) {
  const value = q.get(name);
  if(value == null || value === '') throw badRequest(`missing ${ name }`);
  return value;
}

function page(items, offset, limit) {
  const slice = items.slice(offset, offset + limit);
  return {slice, nextOffset: offset + slice.length};
}

const songJson = (s, extra = {}) => ({
  index: s.id,
  title: s.title,
  artist: s.artist,
  album: s.album,
  album_artist: s.albumArtist,
  genre: s.genre,
  track_number: s.trackNumber,
  disc_number: s.discNumber,
  album_key: s.albumKey,
  ...extra,
});

const byAlbumOrder = (a, b) =>
  a.albumArtist.localeCompare(b.albumArtist) ||
  a.album.localeCompare(b.album) ||
  (a.discNumber || 0) - (b.discNumber || 0) ||
  (a.trackNumber || 0) - (b.trackNumber || 0);
const librarySongs = [...lib.songs].sort(byAlbumOrder);

function filterSongs(q) {
  const text = (q.get('q') || '').trim().toLowerCase();
  const artist = q.get('artist');
  const albumArtist = q.get('album_artist');
  const album = q.get('album');
  const genre = q.get('genre');
  if(artist != null && albumArtist != null) throw badRequest('use artist or album_artist, not both');
  return librarySongs.filter(
    (s) =>
      (!text || `${ s.title } ${ s.artist } ${ s.album }`.toLowerCase().includes(text)) &&
      (artist == null || s.artists.includes(artist)) &&
      (albumArtist == null || s.albumArtist === albumArtist) &&
      (album == null || s.album === album) &&
      (genre == null || s.genre === genre)
  );
}

function groupBy(songs, keysOf) {
  const groups = new Map();
  for(const s of songs) {
    for(const key of keysOf(s)) {
      if(!groups.has(key)) groups.set(key, {name: key, count: 0, index: s.id});
      groups.get(key).count++;
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- playlists

const INTERNAL_PLAYLISTS = ['Favorites', 'Most Played'];

function playlistSongIds(key) {
  if(key === 'Favorites') return librarySongs.filter((s) => state.favorites.has(s.id)).map((s) => s.id);
  if(key === 'Most Played') {
    return [...state.playCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([id]) => id);
  }
  const playlist = state.playlists.get(key);
  if(!playlist) throw notFound('playlist not found');
  return playlist.songs;
}

function userPlaylist(q, param = 'name') {
  const key = requireParam(q, param);
  if(INTERNAL_PLAYLISTS.includes(key)) throw new ApiError(403, {error: 'playlist is read-only', code: 'read_only'});
  const playlist = state.playlists.get(key);
  if(!playlist) throw notFound('playlist not found');
  return {key, playlist};
}

function checkPlaylistRevision(q, playlist) {
  if(requireParam(q, 'revision') !== String(playlist.revision)) throw stale('Playlist');
}

function validatePlaylistName(name) {
  // Mirrors RemoteApi.validatePlaylistName in the app.
  const bytes = Buffer.byteLength(name, 'utf8');
  if(
    bytes < 1 || bytes > 127 || name.startsWith('.') || name.startsWith('@') ||
    /[\x00-\x1f\x7f/\\:*?"<>|]/.test(name) || name.includes('..') ||
    /[ .]$/.test(name) || /\.m3u8?$/i.test(name) || /^(Favorites|Most Played)$/i.test(name)
  ) {
    throw badRequest('invalid playlist name');
  }
}

function createPlaylist(name, songs) {
  validatePlaylistName(name);
  if(state.playlists.has(name)) throw new ApiError(409, {error: 'playlist already exists', code: 'exists'});
  state.playlists.set(name, {songs, revision: 1});
}

function moveItem(list, from, to) {
  if(from >= list.length || to >= list.length) throw badRequest('position out of range');
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
}

// ---------------------------------------------------------------- folders

const FOLDER_ROOTS = [
  {id: 'sd', name: 'SD card', available: true},
  {id: 'usb', name: 'USB storage', available: false},
];

function listFolder(path) {
  const prefix = path ? `${ path }/` : '';
  const folders = new Set();
  const tracks = [];
  for(const s of lib.songs) {
    if(!s.path.startsWith(prefix)) continue;
    const rest = s.path.slice(prefix.length);
    const slash = rest.indexOf('/');
    if(slash >= 0) folders.add(rest.slice(0, slash));
    else tracks.push(s);
  }
  const playlists = path === 'Playlists' ? [...state.playlists.keys()].map((k) => `${ k }.m3u`) : [];
  if(!path) folders.add('Playlists');
  if(!folders.size && !tracks.length && !playlists.length && path && path !== 'Playlists') throw notFound('folder not found');
  const sortedFolders = [...folders].sort((a, b) => a.localeCompare(b));
  return {
    folderCount: sortedFolders.length,
    entries: [
      ...sortedFolders.map((name) => ({type: 'folder', name})),
      ...playlists.map((name) => ({type: 'playlist', name})),
      ...tracks
        .sort(byAlbumOrder)
        .map((s) => ({type: 'track', name: s.path.slice(prefix.length), index: s.id, title: s.title, artist: s.artist})),
    ],
  };
}

// ---------------------------------------------------------------- routes

function statusJson() {
  tick();
  const song = currentSong();
  return {
    playing: state.playing,
    paused: !state.playing && !!song,
    title: song ? song.title : '',
    artist: song ? song.artist : '',
    album: song ? song.album : '',
    position_seconds: song ? Math.floor(position() / 1000) : 0,
    duration_seconds: song ? song.durationSeconds : 0,
    volume: state.volume,
    play_mode: state.playMode,
    codec: song ? song.codec : '',
    source_bit_depth: song ? song.bitDepth : 0,
    source_sample_rate: song ? song.sampleRate : 0,
    bluetooth_audio_output: false,
    favorite: song ? state.favorites.has(song.id) : false,
  };
}

function checkCatalogRevision(q, required) {
  const revision = required ? requireParam(q, 'revision') : q.get('revision') || q.get('catalog_revision');
  if(revision && revision !== catalogRevision()) throw stale('Catalog');
}

function songParam(q, name = 'index') {
  const song = songById.get(intParam(q, name, {min: 0}));
  if(!song) throw notFound('song not found');
  return song;
}

const png = (buf) => ({status: 200, contentType: 'image/png', body: buf});

const routes = {
  'GET /capabilities': () => ({version: 1, transports: ['wifi', 'bluetooth'], features: FEATURES}),
  'GET /status': () => statusJson(),

  'GET /art': (q) => {
    const song = q.get('index') != null ? songParam(q) : currentSong();
    const album = song && albumByKey.get(song.albumKey);
    if(!album || !album.hasArt) throw notFound('no artwork');
    return png(cachedCover(album.hue));
  },

  // -- playback
  'POST /playback/toggle': () => {tick(); setPlaying(!state.playing);},
  'POST /playback/next': () => {
    tick();
    const next = nextOffset(true);
    if(next >= 0) startTrack(next);
  },
  'POST /playback/prev': () => {
    tick();
    if(position() > 3000 || state.queue.length === 0) pin(0);
    else startTrack(state.current > 0 ? state.current - 1 : state.playMode === 1 ? state.queue.length - 1 : 0);
  },
  'POST /playback/mode': (q) => {
    state.playMode = q.get('mode') != null ? intParam(q, 'mode', {min: 0, max: 3}) : (state.playMode + 1) % 4;
  },
  'POST /playback/seek': (q) => {
    tick();
    const song = currentSong();
    if(!song) throw new ApiError(409, {error: 'nothing playing', code: 'no_track'});
    pin(Math.min(intParam(q, 'seconds', {min: 0}), song.durationSeconds) * 1000);
  },
  'POST /playback/volume': (q) => {state.volume = intParam(q, 'percent', {min: 0, max: 100}) / 100;},
  'POST /playback/play': (q) => {
    const song = songParam(q);
    checkCatalogRevision(q, false);
    const playlist = q.get('playlist');
    let ids;
    if(playlist != null) ids = playlistSongIds(playlist);
    else if(q.get('album') != null || q.get('artist') != null || q.get('album_artist') != null) {
      const ctx = new URLSearchParams();
      for(const key of ['artist', 'album_artist', 'album']) if(q.get(key) != null) ctx.set(key, q.get(key));
      ids = filterSongs(ctx).map((s) => s.id);
    } else ids = librarySongs.map((s) => s.id);
    if(!ids.includes(song.id)) ids = [song.id, ...ids];
    replaceQueue(ids, song.id);
  },
  'POST /playback/queue': (q) => {
    const song = songParam(q);
    checkCatalogRevision(q, false);
    state.queue.push(song.id);
    state.queueRevision++;
    if(state.current < 0) startTrack(state.queue.length - 1);
  },

  // -- queue
  'GET /queue': (q) => {
    tick();
    const offset = intParam(q, 'offset', {def: 0});
    const limit = intParam(q, 'limit', {min: 1, max: 25, def: 25});
    const {slice} = page(state.queue, offset, limit);
    return {
      total: state.queue.length,
      offset,
      revision: state.queueRevision,
      current: state.current,
      songs: slice.map((id, i) => {
        const s = songById.get(id);
        return {index: s.id, title: s.title, artist: s.artist, album: s.album, offset: offset + i};
      }),
    };
  },
  'POST /queue/remove': (q) => {
    if(intParam(q, 'revision') !== state.queueRevision) throw stale('Queue');
    const offset = intParam(q, 'offset', {max: state.queue.length - 1});
    state.queue.splice(offset, 1);
    if(offset < state.current) state.current--;
    else if(offset === state.current) {
      if(state.current >= state.queue.length) {state.current = state.queue.length ? 0 : -1; state.playing = state.playing && state.current >= 0;}
      pin(0);
    }
    state.queueRevision++;
  },
  'POST /queue/clear': (q) => {
    if(intParam(q, 'revision') !== state.queueRevision) throw stale('Queue');
    state.queue = [];
    state.current = -1;
    state.playing = false;
    pin(0);
    state.queueRevision++;
  },
  'POST /queue/move': (q) => {
    if(intParam(q, 'revision') !== state.queueRevision) throw stale('Queue');
    const from = intParam(q, 'from');
    const to = intParam(q, 'to');
    const playingId = state.queue[state.current];
    moveItem(state.queue, from, to);
    state.current = state.queue.indexOf(playingId);
    state.queueRevision++;
  },
  'POST /queue/play': (q) => {
    if(intParam(q, 'revision') !== state.queueRevision) throw stale('Queue');
    startTrack(intParam(q, 'offset', {max: state.queue.length - 1}));
    state.playing = true;
  },

  // -- library
  'GET /library': (q) => {
    const offset = intParam(q, 'offset', {def: 0});
    const limit = intParam(q, 'limit', {min: 1, max: 100, def: 50});
    const songs = filterSongs(q);
    return {total: songs.length, songs: page(songs, offset, limit).slice.map((s) => songJson(s))};
  },
  'GET /library/artists': () => ({artists: groupBy(librarySongs, (s) => s.artists)}),
  'GET /library/album_artists': () => ({artists: groupBy(librarySongs, (s) => [s.albumArtist])}),
  'GET /library/genres': () => ({genres: groupBy(librarySongs, (s) => [s.genre])}),
  'GET /library/albums': (q) => {
    const songs = filterSongs(new URLSearchParams([...q].filter(([k]) => k === 'artist' || k === 'album_artist')));
    const albums = new Map();
    for(const s of songs) {
      if(!albums.has(s.albumKey)) albums.set(s.albumKey, {name: s.album, count: 0, index: s.id, album_artist: s.albumArtist, album_key: s.albumKey});
      albums.get(s.albumKey).count++;
    }
    return {albums: [...albums.values()].sort((a, b) => a.name.localeCompare(b.name))};
  },

  // -- synced catalog
  'GET /catalog': (q) => {
    checkCatalogRevision(q, false);
    const offset = intParam(q, 'offset', {def: 0});
    const limit = intParam(q, 'limit', {min: 1, max: 100, def: 100});
    const {slice, nextOffset} = page(librarySongs, Math.min(offset, librarySongs.length), limit);
    return {
      library_id: lib.libraryId,
      revision: catalogRevision(),
      total: librarySongs.length,
      offset,
      next_offset: nextOffset,
      songs: slice.map((s) => ({
        id: s.id, title: s.title, artist: s.artist, album: s.album, album_artist: s.albumArtist, genre: s.genre,
        track_number: s.trackNumber, disc_number: s.discNumber, album_key: s.albumKey, artists: s.artists,
      })),
    };
  },
  'GET /catalog/covers': (q) => {
    checkCatalogRevision(q, true);
    const offset = intParam(q, 'offset', {def: 0});
    const limit = intParam(q, 'limit', {min: 1, max: 100, def: 100});
    const {slice, nextOffset} = page(lib.albums, Math.min(offset, lib.albums.length), limit);
    return {
      library_id: lib.libraryId,
      revision: catalogRevision(),
      total: lib.albums.length,
      offset,
      next_offset: nextOffset,
      covers: slice.map((a) => ({album_key: a.albumKey, representative_id: a.songIds[0], cover_key: a.coverKey, available: a.hasArt})),
    };
  },
  'GET /catalog/art': (q) => {
    checkCatalogRevision(q, true);
    const song = songParam(q, 'representative_id');
    const album = albumByKey.get(song.albumKey);
    if(!album || !album.hasArt || album.coverKey !== q.get('cover_key')) throw notFound('no artwork');
    return png(cachedCover(album.hue));
  },

  // -- folders
  'GET /folders/roots': () => ({roots: FOLDER_ROOTS}),
  'GET /folders': (q) => {
    const root = q.get('root') || 'sd';
    const rootInfo = FOLDER_ROOTS.find((r) => r.id === root);
    if(!rootInfo) throw notFound('unknown root');
    if(!rootInfo.available) throw new ApiError(503, {error: `${ rootInfo.name } is not mounted`, code: 'root_unavailable'});
    const path = (q.get('path') || '').replace(/^\/+|\/+$/g, '');
    const offset = intParam(q, 'offset', {def: 0});
    const limit = intParam(q, 'limit', {min: 1, max: 100, def: 50});
    const {entries, folderCount} = listFolder(path);
    const {slice, nextOffset} = page(entries, offset, limit);
    return {
      root,
      path,
      parent: path ? path.split('/').slice(0, -1).join('/') : null,
      total: entries.length,
      folder_count: folderCount,
      offset,
      next_offset: nextOffset,
      entries: slice,
    };
  },
  'POST /folders/play': (q) => {
    const path = requireParam(q, 'path');
    const song = songByPath.get(path);
    if(!song) throw notFound('file not found');
    const folder = path.split('/').slice(0, -1).join('/');
    replaceQueue(listFolder(folder).entries.filter((e) => e.type === 'track').map((e) => e.index), song.id);
  },

  // -- recents & favorites
  'GET /recent': (q) => {
    const offset = intParam(q, 'offset', {def: 0});
    const limit = intParam(q, 'limit', {min: 1, max: 100, def: 50});
    const {slice, nextOffset} = page(state.recent, offset, limit);
    return {
      total: state.recent.length,
      next_offset: nextOffset,
      songs: slice.map((r) => ({...songJson(songById.get(r.id)), last_played: r.at})),
    };
  },
  'GET /favorites/state': (q) => {
    const ids = requireParam(q, 'ids').split(',').map(Number);
    if(ids.length > 100 || ids.some((id) => !Number.isSafeInteger(id))) throw badRequest('invalid ids');
    return {songs: ids.map((id) => ({index: id, found: songById.has(id), favorite: state.favorites.has(id)}))};
  },
  'POST /favorites/add': (q) => setFavorite(q, true),
  'POST /favorites/remove': (q) => setFavorite(q, false),

  // -- playlists
  'GET /playlists': () => ({
    playlists: [
      ...INTERNAL_PLAYLISTS.map((name) => ({name, key: name, internal: true, writable: false})),
      ...[...state.playlists.keys()].sort().map((name) => ({name, key: name, internal: false, writable: true})),
    ],
  }),
  'GET /playlists/songs': (q) => {
    const key = requireParam(q, 'name');
    const ids = playlistSongIds(key);
    const offset = intParam(q, 'offset', {def: 0});
    const {slice, nextOffset} = page(ids, offset, 50);
    const playlist = state.playlists.get(key);
    return {
      total: ids.length,
      next_offset: nextOffset,
      revision: playlist ? String(playlist.revision) : null,
      writable: !!playlist,
      songs: slice.map((id, i) => {
        const s = songById.get(id);
        return {index: s.id, title: s.title, artist: s.artist, album: s.album, position: offset + i};
      }),
    };
  },
  'POST /playlists': (q) => createPlaylist(requireParam(q, 'name'), [songParam(q).id]),
  'POST /playlists/create': (q) => createPlaylist(requireParam(q, 'name'), []),
  'POST /playlists/add': (q) => {
    const {playlist} = userPlaylist(q);
    playlist.songs.push(songParam(q).id);
    playlist.revision++;
  },
  'POST /playlists/rename': (q) => {
    const {key, playlist} = userPlaylist(q);
    const newName = requireParam(q, 'new_name');
    validatePlaylistName(newName);
    if(newName !== key && state.playlists.has(newName)) throw new ApiError(409, {error: 'playlist already exists', code: 'exists'});
    state.playlists.delete(key);
    state.playlists.set(newName, playlist);
    return {key: newName};
  },
  'POST /playlists/delete': (q) => {state.playlists.delete(userPlaylist(q).key);},
  'POST /playlists/remove': (q) => {
    const {playlist} = userPlaylist(q);
    checkPlaylistRevision(q, playlist);
    const position = intParam(q, 'position', {max: playlist.songs.length - 1});
    playlist.songs.splice(position, 1);
    playlist.revision++;
    return {revision: String(playlist.revision)};
  },
  'POST /playlists/move': (q) => {
    const {playlist} = userPlaylist(q);
    checkPlaylistRevision(q, playlist);
    moveItem(playlist.songs, intParam(q, 'from'), intParam(q, 'to'));
    playlist.revision++;
    return {revision: String(playlist.revision)};
  },
  'POST /playlists/import': (q, body) => {
    const name = requireParam(q, 'name');
    const lines = body.toString('utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    const matched = lines
      .map((line) => {
        const normalized = line.replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '');
        // Exact library-relative path, an absolute path ending in one, or a bare file name.
        const fileName = normalized.split('/').pop();
        return songByPath.get(normalized) ||
          lib.songs.find((s) => normalized.endsWith(`/${ s.path }`) || s.path.split('/').pop() === fileName);
      })
      .filter(Boolean)
      .map((s) => s.id);
    createPlaylist(name, matched);
    return {entries: lines.length, matched: matched.length};
  },
};

function setFavorite(q, favorite) {
  const song = q.get('current') === '1' ? currentSong() : songParam(q);
  if(!song) throw new ApiError(409, {error: 'nothing playing', code: 'no_track'});
  if(q.get('catalog_revision')) checkCatalogRevision(q, false);
  if(favorite) state.favorites.add(song.id);
  else state.favorites.delete(song.id);
  return {favorite};
}

// ---------------------------------------------------------------- server

function checkPin(req) {
  if(!state.pin) return;
  const now = Date.now();
  if(state.pinLockedUntil > now) {
    throw new ApiError(429, {error: 'too many PIN attempts', code: 'pin_rate_limited', retryAfterSeconds: Math.ceil((state.pinLockedUntil - now) / 1000)});
  }
  const supplied = req.headers['x-compas-pin'];
  if(supplied === state.pin) {
    state.pinFailures = 0;
    return;
  }
  if(supplied) {
    state.pinFailures++;
    if(state.pinFailures >= 5) {
      state.pinFailures = 0;
      state.pinLockedUntil = now + 30_000;
      throw new ApiError(429, {error: 'too many PIN attempts', code: 'pin_rate_limited', retryAfterSeconds: 30});
    }
  }
  throw new ApiError(401, {error: 'unauthorized', code: 'pin_required'});
}

function send(res, status, contentType, body) {
  res.writeHead(status, {'Content-Type': contentType, 'Content-Length': body.length, 'Cache-Control': 'no-store'});
  res.end(body);
}

function log(line) {
  if(!opts.quiet) console.log(`${ new Date().toISOString().slice(11, 23) } ${ line }`);
}

const server = http.createServer((req, res) => {
  if(state.offline) {
    req.socket.destroy();
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    setTimeout(() => {
      const url = new URL(req.url, 'http://sim');
      const route = url.pathname.startsWith('/api/v1/') ? `${ req.method } ${ url.pathname.slice('/api/v1'.length) }` : null;
      const handler = route && routes[route];
      let status = 200;
      try {
        if(!handler) throw notFound(`no route for ${ req.method } ${ url.pathname }`);
        checkPin(req);
        const result = handler(url.searchParams, Buffer.concat(chunks));
        if(result && result.contentType) {
          send(res, result.status, result.contentType, result.body);
        } else {
          send(res, 200, 'application/json', Buffer.from(JSON.stringify(result ?? {ok: true})));
        }
      } catch(err) {
        status = err instanceof ApiError ? err.status : 500;
        const body = err instanceof ApiError ? err.body : {error: String(err && err.message), code: 'internal'};
        if(!(err instanceof ApiError)) console.error(err);
        send(res, status, 'application/json', Buffer.from(JSON.stringify(body)));
      }
      // Status and art are polled constantly; keep the log readable.
      if(status !== 200 || !/^GET \/(status|art|catalog)/.test(route || '')) log(`${ status } ${ req.method } ${ req.url }`);
    }, state.latency);
  });
});

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

function printStatus() {
  tick();
  const song = currentSong();
  console.log(
    song
      ? `${ state.playing ? '▶' : '⏸' } ${ song.artist } — ${ song.title } [${ Math.floor(position() / 1000) }s/${ song.durationSeconds }s] ` +
      `queue ${ state.current + 1 }/${ state.queue.length } rev ${ state.queueRevision }, mode ${ PLAY_MODES[state.playMode] }, vol ${ Math.round(state.volume * 100) }%`
      : '⏹ nothing queued'
  );
  console.log(`catalog ${ catalogRevision() } (${ lib.songs.length } songs, ${ lib.albums.length } albums), PIN ${ state.pin || 'off' }, latency ${ state.latency }ms${ state.offline ? ', OFFLINE' : '' }`);
}

const HELP = `Commands:
  status            show playback and simulator state
  play | pause      change playback from the "device" side
  next              skip to the next track from the "device" side
  pin <digits|off>  require a PIN (or turn it off); the app must re-enter it
  latency <ms>      delay every response
  offline / online  drop all connections (tests reconnect) / accept again
  revision          bump the catalog revision (forces a full catalog resync)
  quit`;

function startConsole() {
  const rl = readline.createInterface({input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY});
  rl.on('line', (line) => {
    const [cmd, arg] = line.trim().split(/\s+/);
    switch(cmd) {
      case '': break;
      case 'status': printStatus(); break;
      case 'play': tick(); setPlaying(true); printStatus(); break;
      case 'pause': tick(); setPlaying(false); printStatus(); break;
      case 'next': tick(); {const n = nextOffset(true); if(n >= 0) startTrack(n);} printStatus(); break;
      case 'pin':
        if(arg === 'off') state.pin = null;
        else if(/^[0-9]{4,12}$/.test(arg || '')) state.pin = arg;
        else {console.log('pin must be 4 to 12 digits, or "off"'); break;}
        state.pinFailures = 0;
        state.pinLockedUntil = 0;
        console.log(`PIN ${ state.pin || 'off' }`);
        break;
      case 'latency': state.latency = Math.max(0, Number(arg) || 0); console.log(`latency ${ state.latency }ms`); break;
      case 'offline': state.offline = true; server.closeAllConnections(); console.log('offline: dropping connections'); break;
      case 'online': state.offline = false; console.log('online'); break;
      case 'revision': state.catalogRevisionCounter++; console.log(`catalog revision now ${ catalogRevision() }`); break;
      case 'quit': case 'exit': process.exit(0); break;
      default: console.log(HELP);
    }
  });
}

server.listen(opts.port, '0.0.0.0', () => {
  console.log(`Compás DAP simulator listening on port ${ opts.port }`);
  console.log(`  Android emulator:   10.0.2.2:${ opts.port }`);
  console.log(`  USB (adb reverse):  127.0.0.1:${ opts.port }   after: adb reverse tcp:${ opts.port } tcp:${ opts.port }`);
  for(const ip of lanAddresses()) console.log(`  Same network:       ${ ip }:${ opts.port }`);
  printStatus();
  console.log('Type "help" for live controls.');
  startConsole();
});

module.exports = {server, state, routes};
