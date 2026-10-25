import { letterOfTitle, NON_LETTER_KEY, OTHER_SCRIPT_KEY, railLetters } from '../alphabetIndex';
import { LibraryItem } from '../libraryItems';

describe('letterOfTitle', () => {
  it('folds accents and ligatures to the letter the player sorts them under', () => {
    expect(letterOfTitle('Ángel')).toBe('A');
    expect(letterOfTitle('Él')).toBe('E');
    expect(letterOfTitle('Única')).toBe('U');
    expect(letterOfTitle('Œsophage')).toBe('O');
    expect(letterOfTitle('Ørsted')).toBe('O');
    expect(letterOfTitle('Łódź')).toBe('L');
  });

  it('skips leading punctuation, quotes and spaces', () => {
    expect(letterOfTitle('...and Soon the World Will Cease to Be')).toBe('A');
    expect(letterOfTitle('’Til Death')).toBe('T');
    expect(letterOfTitle('¿Bolero yo?')).toBe('B');
    expect(letterOfTitle('  "Heroes"')).toBe('H');
    expect(letterOfTitle('[MESSAGE FROM THE CLERGY]')).toBe('M');
  });

  it('lists digits first and other scripts after Z', () => {
    expect(letterOfTitle('12 Little Spells')).toBe(NON_LETTER_KEY);
    expect(letterOfTitle('...')).toBe(NON_LETTER_KEY);
    expect(letterOfTitle('Желаю значит получу')).toBe('Ж');
    expect(letterOfTitle('風の歌')).toBe(OTHER_SCRIPT_KEY);
    expect(letterOfTitle('© Symbol')).toBe(OTHER_SCRIPT_KEY);
  });
});

describe('railLetters', () => {
  it('follows the list order', () => {
    const items = ['#', 'A', 'Z', 'Ж'].map((letter) => ({ key: letter, type: 'letter', letter })) as LibraryItem[];
    expect(railLetters(items).map((entry) => entry.letter)).toEqual(['#', 'A', 'Z', 'Ж']);
  });
});
