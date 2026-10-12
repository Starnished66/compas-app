const NON_ASCII = /[^\x00-\x7f]/;
const COMBINING_MARKS = /[̀-ͯ]/g;
const UNDECOMPOSED_LETTERS = /[ßæœøłđðþı]/g;
const LETTER_SPELLINGS: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
};

export function titleSortKey(title: string): string {
  const lower = title.toLowerCase();
  if (!NON_ASCII.test(lower)) return lower;
  return lower
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(UNDECOMPOSED_LETTERS, (letter) => LETTER_SPELLINGS[letter]);
}

export function sortedByTitle<T>(items: readonly T[], titleOf: (item: T) => string): T[] {
  const keyed = items.map((item, index) => ({ item, index, key: titleSortKey(titleOf(item)) }));
  let ordered = true;
  for (let index = 1; ordered && index < keyed.length; index++) ordered = keyed[index - 1].key <= keyed[index].key;
  if (ordered) return items.slice();
  keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.index - b.index));
  return keyed.map(({ item }) => item);
}
