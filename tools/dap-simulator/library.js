// Deterministic fake music library for the DAP simulator.
// Same seed => same songs, ids, album keys and cover keys across restarts,
// so the app's synced catalog snapshot stays valid between runs.

const crypto = require('crypto');

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shortHash = (value) => crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);

const ARTISTS = [
  { name: 'Camarón de la Isla', genre: 'Flamenco' },
  { name: 'Paco de Lucía', genre: 'Flamenco' },
  { name: 'Rosalía', genre: 'Pop' },
  { name: 'Daft Punk', genre: 'Electronic' },
  { name: 'Nina Simone', genre: 'Jazz' },
  { name: 'Miles Davis', genre: 'Jazz' },
  { name: 'Radiohead', genre: 'Alternative' },
  { name: 'Björk', genre: 'Alternative' },
  { name: 'Buena Vista Social Club', genre: 'Latin' },
  { name: 'Khruangbin', genre: 'Psychedelic' },
  { name: 'Boards of Canada', genre: 'Electronic' },
  { name: 'Fleetwood Mac', genre: 'Rock' },
];

const WORDS = [
  'Luna', 'Night', 'Blue', 'Fire', 'River', 'Glass', 'Silver', 'Echo', 'Garden', 'Shadow',
  'Morning', 'Ocean', 'Velvet', 'Paper', 'Golden', 'Desert', 'Signal', 'Winter', 'Static', 'Bloom',
  'Soleá', 'Bulería', 'Tango', 'Alegría', 'Copper', 'Harbor', 'Neon', 'Quiet', 'Falling', 'Electric',
];

const GENRES = [...new Set(ARTISTS.map((artist) => artist.genre))];

function phrase(rand, minWords, maxWords) {
  const count = minWords + Math.floor(rand() * (maxWords - minWords + 1));
  const words = [];
  for (let i = 0; i < count; i++) words.push(WORDS[Math.floor(rand() * WORDS.length)]);
  return words.join(' ');
}

// Beyond the named artists, extra ones get generated names so large libraries can be stress-tested.
function rosterOf(rand, count) {
  const roster = ARTISTS.slice(0, count);
  const taken = new Set(roster.map((artist) => artist.name));
  while (roster.length < count) {
    const base = `The ${phrase(rand, 1, 2)}`;
    let name = base;
    for (let suffix = 2; taken.has(name); suffix++) name = `${base} ${suffix}`;
    taken.add(name);
    roster.push({ name, genre: GENRES[Math.floor(rand() * GENRES.length)] });
  }
  return roster;
}

/**
 * @returns {{
 *   libraryId: string,
 *   songs: Array<{id:number,title:string,artist:string,artists:string[],album:string,albumArtist:string,
 *     genre:string,trackNumber:number|null,discNumber:number|null,albumKey:string,durationSeconds:number,
 *     codec:string,bitDepth:number,sampleRate:number,path:string}>,
 *   albums: Array<{name:string,albumArtist:string,albumKey:string,coverKey:string,hasArt:boolean,hue:number,songIds:number[]}>,
 * }}
 */
function generateLibrary(seed = 7, albumsPerArtist = 3, artistCount = ARTISTS.length) {
  const rand = mulberry32(seed);
  const roster = rosterOf(mulberry32(seed + artistCount), artistCount);
  const songs = [];
  const albums = [];
  const formats = [
    { codec: 'FLAC', bitDepth: 16, sampleRate: 44100 },
    { codec: 'FLAC', bitDepth: 24, sampleRate: 96000 },
    { codec: 'FLAC', bitDepth: 24, sampleRate: 192000 },
    { codec: 'ALAC', bitDepth: 24, sampleRate: 48000 },
    { codec: 'MP3', bitDepth: 16, sampleRate: 44100 },
    { codec: 'DSD', bitDepth: 1, sampleRate: 2822400 },
  ];

  const addAlbum = (albumName, albumArtist, genre, trackArtists) => {
    const albumKey = `a2-${shortHash(`${albumArtist}\u0000${albumName}`)}`;
    const album = {
      name: albumName,
      albumArtist,
      albumKey,
      coverKey: `s-${shortHash(`cover:${albumKey}`)}`,
      // Roughly one album in eight has no embedded art, to exercise the "missing cover" path.
      hasArt: rand() > 0.125,
      hue: Math.floor(rand() * 360),
      songIds: [],
    };
    const format = formats[Math.floor(rand() * formats.length)];
    const discs = rand() > 0.85 ? 2 : 1;
    for (let disc = 1; disc <= discs; disc++) {
      const tracks = 5 + Math.floor(rand() * 8);
      for (let track = 1; track <= tracks; track++) {
        const artists = trackArtists(rand);
        const title = phrase(rand, 1, 3);
        const id = songs.length + 1;
        songs.push({
          id,
          title,
          artist: artists.join(', '),
          artists,
          album: albumName,
          albumArtist,
          genre,
          trackNumber: track,
          discNumber: discs > 1 ? disc : 1,
          albumKey,
          durationSeconds: 120 + Math.floor(rand() * 300),
          ...format,
          path: `${albumArtist}/${albumName}/${discs > 1 ? `${disc}-` : ''}${String(track).padStart(2, '0')} ${title}.${format.codec === 'MP3' ? 'mp3' : format.codec === 'DSD' ? 'dsf' : 'flac'}`,
        });
        album.songIds.push(id);
      }
    }
    albums.push(album);
  };

  let renamedAlbums = false;
  for (const artist of roster) {
    const titles = new Set();
    for (let i = 0; i < albumsPerArtist; i++) {
      let title = phrase(rand, 1, 3);
      for (let suffix = 2; titles.has(title); suffix++) {
        title = `${title.replace(/ Vol\. \d+$/, '')} Vol. ${suffix}`;
        renamedAlbums = true;
      }
      titles.add(title);
      // Occasional featured guest so multi-artist songs and the Artist vs Album Artist split get exercised.
      addAlbum(title, artist.name, artist.genre, (r) => {
        if (r() > 0.85) {
          const guest = roster[Math.floor(r() * roster.length)].name;
          if (guest !== artist.name) return [artist.name, guest];
        }
        return [artist.name];
      });
    }
  }
  // A compilation: album artist "Various Artists", a different track artist per song.
  addAlbum('Late Night Selections', 'Various Artists', 'Compilation', (r) => [ARTISTS[Math.floor(r() * ARTISTS.length)].name]);

  // The id only changes when the content does, so existing synced snapshots of the default library stay valid.
  const shape = [albumsPerArtist, artistCount === ARTISTS.length ? null : artistCount, renamedAlbums ? 'unique' : null]
    .filter((part) => part != null)
    .join(':');
  return { libraryId: `sim-${shortHash(`library:${seed}:${shape}`)}`, songs, albums };
}

module.exports = { generateLibrary, mulberry32, NAMED_ARTIST_COUNT: ARTISTS.length };
