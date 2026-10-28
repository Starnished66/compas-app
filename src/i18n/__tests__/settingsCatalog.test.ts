import { catalogs } from '../catalogs';

declare const require: (name: string) => unknown;
const fs = require('fs') as { readFileSync: (path: string, encoding: string) => string };
const path = require('path') as { join: (...parts: string[]) => string };

const MARKER = '// Player settings screen (remote settings, settings_v1).';
const END = '// Languages with incomplete coverage';

describe('player settings catalog additions', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src', 'i18n', 'catalogs.ts'), 'utf8');
  const start = source.indexOf(MARKER);
  const before = source.slice(0, start);
  const block = source.slice(start, source.indexOf(END));

  it('exists and covers every language', () => {
    expect(start).toBeGreaterThan(0);
    for (const language of ['es', 'de', 'fr', 'it', 'ru']) expect(block).toContain(`Object.assign(catalogs.${language}, {`);
  });

  it('never overrides an entry that already exists', () => {
    const keys = [...block.matchAll(/^ {2}'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1].replace(/\\'/g, "'"));
    expect(keys.length).toBeGreaterThan(30);
    const clashes = keys.filter((key) => before.includes(`'${key.replace(/'/g, "\\'")}':`) || before.includes(`"${key}":`));
    expect(clashes).toEqual([]);
  });

  it('leaves the German wording of the existing "the player" key alone', () => {
    expect(catalogs.de['the player']).toBe('der Player');
  });
});
