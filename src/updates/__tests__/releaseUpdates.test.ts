import {
  APPLICATION_UPDATE_CONFIG,
  APP_RELEASES_API_URL,
  APP_UPDATE_URL,
  FIRMWARE_RELEASES_API_URL,
  RELEASE_CHECK_TIMEOUT_MS,
  checkReleaseUpdates,
  compareApplicationVersions,
  fetchApplicationUpdateNotice,
  fetchLatestFirmwareRelease,
  isFirmwareReleaseNewer,
} from '../releaseUpdates';

function release(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 42,
    tag_name: 'v1.2.3',
    name: 'Compás Player 1.2.3',
    draft: false,
    prerelease: false,
    html_url: 'https://github.com/Starnished66/compas-player/releases/tag/v1.2.3',
    published_at: '2026-08-21T14:30:00Z',
    assets: [{ name: 'r3ii_2025.upt' }, { name: 'SHA256SUMS' }],
    ...overrides,
  };
}

function response(payload: unknown, ok = true): Response {
  return { ok, json: jest.fn().mockResolvedValue(payload) } as unknown as Response;
}

describe('fetchLatestFirmwareRelease', () => {
  it('returns trusted stable firmware release metadata without downloading assets', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(release()));

    await expect(fetchLatestFirmwareRelease(fetchImpl)).resolves.toEqual({
      kind: 'firmware',
      title: 'Compás Player 1.2.3',
      version: 'v1.2.3',
      releaseUrl: 'https://github.com/Starnished66/compas-player/releases/tag/v1.2.3',
      publishedAt: '2026-08-21T14:30:00Z',
      releaseId: '42',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      FIRMWARE_RELEASES_API_URL,
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/vnd.github+json' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('throws ordinary errors for HTTP and network failures and returns null for malformed payloads', async () => {
    await expect(fetchLatestFirmwareRelease(jest.fn().mockResolvedValue(response({}, false)))).rejects.toThrow(
      'HTTP status',
    );
    await expect(fetchLatestFirmwareRelease(jest.fn().mockRejectedValue(new Error('offline')))).rejects.toThrow(
      'offline',
    );
    await expect(fetchLatestFirmwareRelease(jest.fn().mockResolvedValue(response({ id: 1 })))).resolves.toBeNull();
    await expect(
      fetchLatestFirmwareRelease(jest.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new Error()) })),
    ).rejects.toThrow();
  });

  it('aborts a request at the timeout bound and returns no notice', async () => {
    jest.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const fetchImpl = jest.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        signal = init?.signal as AbortSignal;
        return new Promise<Response>(() => {});
      });

      const pending = fetchLatestFirmwareRelease(fetchImpl, RELEASE_CHECK_TIMEOUT_MS);
      const rejected = expect(pending).rejects.toThrow('timed out');
      await jest.advanceTimersByTimeAsync(RELEASE_CHECK_TIMEOUT_MS);
      await rejected;
      expect(signal?.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['draft', { draft: true }],
    ['prerelease', { prerelease: true }],
    ['noncanonical version', { tag_name: 'v1.2' }],
    ['untrusted release URL', { html_url: 'https://example.com/releases/v1.2.3' }],
    ['missing supported firmware', { assets: [{ name: 'other.upt' }, { name: 'SHA256SUMS' }] }],
    ['missing checksum manifest', { assets: [{ name: 'r1.upt' }] }],
    ['malformed assets', { assets: [{ name: 1 }] }],
  ])('rejects %s releases', async (_label, overrides) => {
    await expect(
      fetchLatestFirmwareRelease(jest.fn().mockResolvedValue(response(release(overrides)))),
    ).resolves.toBeNull();
  });

  it('uses the version tag as the title when the release name is blank', async () => {
    const notice = await fetchLatestFirmwareRelease(
      jest.fn().mockResolvedValue(response(release({ name: '  ' }))),
    );
    expect(notice?.title).toBe('v1.2.3');
  });
});

describe('application update placeholder', () => {
  it('keeps source and destination unconfigured and makes no request', async () => {
    const fetchImpl = jest.fn();
    expect(APPLICATION_UPDATE_CONFIG).toEqual({ sourceUrl: null, updateUrl: null });
    expect(APP_RELEASES_API_URL).toBeNull();
    expect(APP_UPDATE_URL).toBeNull();
    await expect(fetchApplicationUpdateNotice(APPLICATION_UPDATE_CONFIG, fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns a firmware announcement and a null application notice from the combined check', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response(release()));
    const result = await checkReleaseUpdates('0.3.6-8', fetchImpl);
    expect(result.firmware?.kind).toBe('firmware');
    expect(result.application).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('compareApplicationVersions', () => {
  it('compares numeric components and prerelease identifiers without lexicographic mistakes', () => {
    expect(compareApplicationVersions('0.3.6-8', '0.3.6-9')).toBe(-1);
    expect(compareApplicationVersions('v0.3.6-10', '0.3.6-9')).toBe(1);
    expect(compareApplicationVersions('0.3.9', '0.3.10')).toBe(-1);
    expect(compareApplicationVersions('0.3.6-8', '0.3.6')).toBe(-1);
    expect(compareApplicationVersions('0.3.6', '0.3.6')).toBe(0);
  });

  it('returns null for invalid versions and identifies downgrades', () => {
    expect(compareApplicationVersions('0.3.6-8', '0.3.6-7')).toBe(1);
    expect(compareApplicationVersions('0.3.6', '0.3.5')).toBe(1);
    expect(compareApplicationVersions('0.3.x', '0.4.0')).toBeNull();
    expect(compareApplicationVersions('0.3.06', '0.4.0')).toBeNull();
  });
});

describe('isFirmwareReleaseNewer', () => {
  it('announces only releases newer than a parseable installed version', () => {
    expect(isFirmwareReleaseNewer('v1.2.0', 'v1.3')).toBe(true);
    expect(isFirmwareReleaseNewer('1.3', 'v1.3')).toBe(false);
    expect(isFirmwareReleaseNewer('v1.4.1', 'v1.3')).toBe(false);
  });

  it('never claims an update when the installed version is unknown', () => {
    expect(isFirmwareReleaseNewer(null, 'v1.3')).toBe(false);
    expect(isFirmwareReleaseNewer(undefined, 'v1.3')).toBe(false);
    expect(isFirmwareReleaseNewer('Development Build', 'v1.3')).toBe(false);
  });
});
