import { translate } from '../../i18n/translate';
import { localizedCountLabel, localizedEntrySubtitle, localizedMessage } from '../localizedLabels';
import { LibraryEntry } from '../../data/types';
import { describeLibrarySync, upToDateLabel } from '../library/librarySync';

describe('localized library labels', () => {
  it('localizes count-only labels and preserves playlist names after the separator', () => {
    const french = (source: string, variables?: Record<string, string | number>) => translate(source, 'fr', variables);
    expect(localizedCountLabel('5 tracks', french)).toBe('5 pistes');
    expect(localizedCountLabel('Showing 3 of 12 tracks', french)).toBe('3 sur 12 pistes affichées');
    expect(localizedCountLabel('4 tracks · Road Songs', french)).toBe('4 pistes · Road Songs');
    expect(localizedCountLabel('4 tracks · Road Songs ', french)).toBe('4 pistes · Road Songs ');
    expect(localizedCountLabel('Failed to load playlist tracks', french)).toBe('Failed to load playlist tracks');
  });

  it('localizes category counts, folder counts and session messages with embedded values', () => {
    const spanish = (source: string, variables?: Record<string, string | number>) => translate(source, 'es', variables);
    expect(localizedCountLabel('37 album artists', spanish)).toBe('37 artistas del álbum');
    expect(localizedCountLabel('1 favorites', spanish)).toBe('1 favorito');
    expect(localizedCountLabel('54 items · SD card', spanish)).toBe('54 elementos · SD card');
    expect(localizedMessage('Too many PIN attempts. Try again in 30s.', spanish)).toBe('Demasiados intentos de PIN. Inténtalo de nuevo en 30 s.');
    expect(localizedMessage('Could not load library', spanish)).toBe('No se pudo cargar la biblioteca');
    expect(localizedMessage('Unmapped player error', spanish)).toBe('Unmapped player error');
  });

  it('localizes only producer-marked subtitle templates and leaves arbitrary metadata intact', () => {
    const russian = (source: string, variables?: Record<string, string | number>) => translate(source, 'ru', variables);
    const makeEntry = (subtitle: string, source?: string, values?: Record<string, string | number>): LibraryEntry => ({
      id: 'entry-1', title: 'Entry', subtitle,
      ...(source ? { subtitleTranslation: { source, values } } : {}),
    });
    expect(localizedEntrySubtitle(makeEntry('Artist · 5 tracks', 'Artist · {count} song', { count: 5 }), russian)).toBe('Исполнитель · 5 песен');
    expect(localizedEntrySubtitle(makeEntry('Album · Miles Davis', 'Album · {artist}', { artist: 'Miles Davis' }), russian)).toBe('Альбом · Miles Davis');
    expect(localizedEntrySubtitle(makeEntry('Artist · 123 tracks'), russian)).toBe('Artist · 123 tracks');
    expect(localizedEntrySubtitle(makeEntry('Track · User title'), russian)).toBe('User title');
    expect(localizedEntrySubtitle(makeEntry('Folder', 'Folder'), russian)).toBe('Папка');
  });

  it('keeps library sync summaries interpolated in English fallback and translates them with a locale', () => {
    expect(upToDateLabel(2)).toBe('Library up to date · 2 songs');
    expect(describeLibrarySync('Syncing songs 1/3').detail).toBe('1 of 3 songs · you can browse while this runs');
    const spanish = (source: string, variables?: Record<string, string | number>) => translate(source, 'es', variables);
    expect(upToDateLabel(2, spanish)).toBe('Biblioteca actualizada · 2 canciones');
    expect(describeLibrarySync('Syncing songs 1/3', spanish).detail).toBe('1 de 3 canciones · puedes explorar mientras se completa');
  });
});
