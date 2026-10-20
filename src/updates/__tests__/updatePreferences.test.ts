import { emptySaved, noticeKey, parseSavedUpdates } from '../updatePreferences';
import type { ReleaseNotice } from '../releaseUpdates';

const cachedFirmware: ReleaseNotice = {
  kind: 'firmware',
  title: 'Player 1.2.3',
  version: 'v1.2.3',
  releaseUrl: 'https://github.com/Starnished66/compas-player/releases/tag/v1.2.3',
  publishedAt: '2026-08-21T14:30:00Z',
  releaseId: '42',
};

const persisted = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({ checkedAt: Date.now() - 1000, firmware: cachedFirmware, seen: [], notified: [], alerts: false, ...overrides });

describe('parseSavedUpdates', () => {
  it('resets absent, malformed, and non-object persisted data', () => {
    expect(parseSavedUpdates(null)).toEqual(emptySaved());
    expect(parseSavedUpdates('{broken')).toEqual(emptySaved());
    expect(parseSavedUpdates('null')).toEqual(emptySaved());
    expect(parseSavedUpdates('[]')).toEqual(emptySaved());
  });

  it('clears a future check timestamp while retaining other valid preferences', () => {
    const saved = parseSavedUpdates(persisted({ checkedAt: Date.now() + 60_000, alerts: true }));
    expect(saved.checkedAt).toBe(0);
    expect(saved.firmware).toEqual(cachedFirmware);
    expect(saved.alerts).toBe(true);
  });

  it('drops cached firmware notices with an untrusted release URL', () => {
    const notice = { ...cachedFirmware, releaseUrl: 'https://example.com/releases/v1.2.3' };
    const saved = parseSavedUpdates(persisted({ firmware: notice, seen: ['firmware:42:v1.2.3'] }));
    expect(saved.firmware).toBeNull();
    expect(saved.seen).toEqual(['firmware:42:v1.2.3']);
  });

  it.each([
    ['missing title', { title: undefined }],
    ['blank release ID', { releaseId: '  ' }],
    ['invalid published date', { publishedAt: 'yesterday-ish' }],
    ['wrong published date type', { publishedAt: 123 }],
    ['non-stable cached version', { version: 'v1.2.3-beta' }],
  ])('drops malformed cached notice fields (%s)', (_case, fields) => {
    const saved = parseSavedUpdates(persisted({ firmware: { ...cachedFirmware, ...fields } }));
    expect(saved.firmware).toBeNull();
  });

  it('keeps only the newest 20 string keys and accepts alerts only when true', () => {
    const seen = [...Array.from({ length: 22 }, (_, index) => `seen-${index}`), null, 123];
    const notified = [...Array.from({ length: 22 }, (_, index) => `notice-${index}`), false];
    const saved = parseSavedUpdates(persisted({ seen, notified, alerts: 'true' }));

    expect(saved.seen).toEqual(Array.from({ length: 20 }, (_, index) => `seen-${index + 2}`));
    expect(saved.notified).toEqual(Array.from({ length: 20 }, (_, index) => `notice-${index + 2}`));
    expect(saved.alerts).toBe(false);
  });

  it('uses a stable key for a release notice', () => {
    expect(noticeKey(cachedFirmware)).toBe('firmware:42:v1.2.3');
  });
});
