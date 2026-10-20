import { catalogs, Language } from '../catalogs';
import { normalizeLanguageTag, resolveLanguage, translate } from '../translate';
import ts from 'typescript';

declare const require: (name: string) => unknown;
const fs = require('fs') as {
  readdirSync: (path: string, options: { withFileTypes: true }) => Array<{ name: string; isDirectory: () => boolean }>;
  readFileSync: (path: string, encoding: string) => string;
};
const path = require('path') as { join: (...parts: string[]) => string; sep: string };

describe('i18n translator', () => {
  it('normalizes supported language tags and falls back to English', () => {
    expect(normalizeLanguageTag('es-MX')).toBe('es');
    expect(normalizeLanguageTag('ru_RU')).toBe('ru');
    expect(normalizeLanguageTag('pt-BR')).toBe('en');
    expect(resolveLanguage('system', 'de-AT')).toBe('de');
    expect(resolveLanguage('fr', 'de-AT')).toBe('fr');
  });

  it('interpolates named values and leaves unknown source text readable', () => {
    expect(translate('Contacting {name}…', 'es', { name: 'Kitchen' })).toBe('Contactando con Kitchen…');
    expect(translate('Uncatalogued label', 'ru')).toBe('Uncatalogued label');
  });

  it('uses the locale plural category before interpolation', () => {
    expect(translate('{count} song', 'en', { count: 1 })).toBe('1 song');
    expect(translate('{count} song', 'en', { count: 3 })).toBe('3 songs');
    expect(translate('{count} song', 'en', { count: 1.5 })).toBe('1.5 songs');
    expect(translate('{count} song', 'es', { count: 1 })).toBe('1 canción');
    expect(translate('{count} song', 'de', { count: 1 })).toBe('1 Titel');
    expect(translate('{count} song', 'it', { count: 1 })).toBe('1 brano');
    expect(translate('{count} song', 'fr', { count: 0 })).toBe('0 titre');
    expect(translate('{count} song', 'fr', { count: 1 })).toBe('1 titre');
    expect(translate('{count} song', 'fr', { count: 1.5 })).toBe('1.5 titre');
    expect(translate('{count} song', 'fr', { count: 2 })).toBe('2 titres');
    expect(translate('{count} song', 'ru', { count: 2 })).toBe('2 песни');
    expect(translate('{count} song', 'ru', { count: 21 })).toBe('21 песня');
    expect(translate('{count} song', 'ru', { count: 22 })).toBe('22 песни');
    expect(translate('{count} song', 'ru', { count: 11 })).toBe('11 песен');
    expect(translate('{count} song', 'ru', { count: 5 })).toBe('5 песен');
    expect(translate('{count} song', 'ru', { count: 1.5 })).toBe('1.5 песни');
  });

  it('selects plurals when Hermes does not provide Intl.PluralRules', () => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl, 'PluralRules');
    try {
      Object.defineProperty(Intl, 'PluralRules', { configurable: true, value: undefined });
      expect(translate('{count} song', 'ru', { count: 22 })).toBe('22 песни');
      expect(translate('{count} song', 'fr', { count: 0 })).toBe('0 titre');
    } finally {
      if (descriptor) Object.defineProperty(Intl, 'PluralRules', descriptor);
      else Reflect.deleteProperty(Intl, 'PluralRules');
    }

    const intlDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Intl');
    try {
      Object.defineProperty(globalThis, 'Intl', { configurable: true, value: undefined });
      expect(translate('{count} song', 'ru', { count: 5 })).toBe('5 песен');
    } finally {
      if (intlDescriptor) Object.defineProperty(globalThis, 'Intl', intlDescriptor);
    }
  });

  it('applies million-count many categories in Spanish, French, and Italian', () => {
    const source = 'Plural rule probe';
    const previous = catalogs.es[source];
    const probe = { one: 'one', many: 'many', other: 'other' };
    try {
      catalogs.es[source] = probe;
      catalogs.fr[source] = probe;
      catalogs.it[source] = probe;
      expect(translate(source, 'es', { count: 1_000_000 })).toBe('many');
      expect(translate(source, 'fr', { count: 2_000_000 })).toBe('many');
      expect(translate(source, 'it', { count: 1_000_000.5 })).toBe('other');
    } finally {
      if (previous) catalogs.es[source] = previous;
      else delete catalogs.es[source];
      delete catalogs.fr[source];
      delete catalogs.it[source];
    }
  });

  it('keeps explicit UI catalog translations available for every supported language', () => {
    const required = [
      'Settings', 'Language', 'Choose a language', 'System default', 'Connect a player', 'Couldn’t connect',
      'Update saved PIN', 'Connection and players', 'Accent color', 'Background', 'Mini player progress',
      'Nearby players', 'On this network', 'No players found', 'Search again', 'Now playing', 'Close',
      'Up next', 'Clear queue', 'New playlist', 'Playlist name', 'Audio format', 'Check now',
      'Loading…', 'Couldn’t load this list', 'This folder is empty', 'Nothing here yet', 'No favorites yet',
      'Search your library', 'No results for “{term}”', 'Sort order: A to Z', 'Show as list', 'PIN needed',
      'Showing {shown} of {total} tracks', '{albums} albums · {tracks} tracks', '{groups} groups · {tracks} tracks',
      'Artist · {count} song', 'Album · {count} song', 'Genre · {count} song', 'Album · {artist}', 'Playlist', 'Track', 'Unknown artist',
      'No songs were found in the selected items.', '{succeeded} succeeded, {failed} failed, {processed} processed of {total}.',
      'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. Completed changes remain applied.',
      'Playlist was not created; 0 songs added of {total}. {error} No existing playlist was changed.',
      'Queue changed. Select tracks again before removing them.', 'The next queued track can change as playback advances. Remove it separately after the queue refreshes.',
      'Queue changed during removal. Remaining selections were stopped.', 'Removal was accepted but could not be confirmed. Remaining selections were stopped.',
      '{succeeded} succeeded, {failed} failed, {processed} processed of {total}. {error} One removal may still finish; refresh the queue before retrying.',
      '{succeeded} succeeded, {failed} failed, {processed} processed of {total}. Confirmed removals remain applied.',
      '{succeeded} succeeded, {failed} failed, {processed} processed of {total}. One removal may still be completing; the queue is being refreshed.',
      'Start a song before adding selected songs to the queue.', 'Could not load playlists.', 'Enter a playlist name.',
      'Select one or more items first.', 'This player does not support that action.', 'The selection is no longer available. Select items again.',
      'Choose a writable playlist.', 'The same song appears more than once beside this selection. Select a different occurrence or remove one at a time.',
      'Queue add was not confirmed before the action stopped.', 'The current queue add may still finish; refresh the queue before retrying.',
      'Playlist created; no songs were added.',
      'Stopped. {succeeded} succeeded, {failed} failed, {processed} processed of {total}. The current queue add may still finish; refresh the queue before retrying.',
      '{succeeded} succeeded, {failed} failed, {processed} processed of {total}. {error} Completed changes remain applied.',
      '{succeeded} succeeded, {failed} failed, {processed} processed of {total}. {error} Confirmed removals remain applied.',
      'Removed “{title}”', 'Unknown song', 'Drag ≡ to reorder · swipe left to remove', 'Swipe left to remove',
      'Player', 'Matches the accent color set on the player.', 'Player accent color', 'Device information',
      'Player model', 'Player version', 'Player {playerVersion} · Firmware {firmwareVersion} · App {appVersion}',
      'Player {playerVersion} · Compás Remote {appVersion}', 'Reported by the connected player: {version}',
      'Player software and firmware updates are separate.',
      'This is the running player software version; firmware is updated separately.',
      'Fast library sync', 'Browse folders', 'Recently played', 'Favorites', 'Edit the queue', 'Edit playlists', 'Import playlist files',
      'Library sorting', 'Sort library', 'Album sort', 'Artist albums', 'Album artist albums', 'Name (A–Z)',
      'Recently Added', 'Release Year (oldest first)',
      'This option is unavailable. Update the player’s Music Database to use it.', 'Unavailable: {option}',
      'Sync the player library before browsing this album.',
    ];
    const languages: Language[] = ['es', 'de', 'fr', 'it', 'ru'];
    const missing: string[] = [];
    for (const language of languages) {
      for (const source of required) {
        expect(catalogs[language][source]).toBeDefined();
      }
    }
  });

  it('covers every literal t() source in app code and keeps interpolation placeholders aligned', () => {
    const sources = new Set<string>();
    const visitDirectory = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('__tests__')) visitDirectory(absolute);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name) || absolute.includes(`${path.sep}i18n${path.sep}catalogs.ts`)) continue;
        const sourceFile = ts.createSourceFile(absolute, fs.readFileSync(absolute, 'utf8'), ts.ScriptTarget.Latest, true);
        const visitNode = (node: ts.Node) => {
          if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
            const argument = node.arguments[0];
            if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) sources.add(argument.text);
          }
          ts.forEachChild(node, visitNode);
        };
        visitNode(sourceFile);
      }
    };
    visitDirectory(path.join(process.cwd(), 'src'));

    const languages: Language[] = ['es', 'de', 'fr', 'it', 'ru'];
    const missing: string[] = [];
    const placeholders = (value: string) => [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map((match) => match[1]).sort();
    for (const source of sources) {
      for (const language of languages) {
        const translation = catalogs[language][source];
        if (!translation) {
          missing.push(`${language}: ${source}`);
          continue;
        }
        expect(translation).toBeDefined();
        const values = typeof translation === 'string' ? [translation] : Object.values(translation).filter((value): value is string => typeof value === 'string');
        for (const value of values) expect(placeholders(value)).toEqual(placeholders(source));
      }
    }
    expect(missing).toEqual([]);
  });

});
