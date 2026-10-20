import type { ReleaseNotice } from './releaseUpdates';

export interface SavedUpdates {
  checkedAt: number;
  firmware: ReleaseNotice | null;
  seen: string[];
  notified: string[];
  alerts: boolean;
}

export const emptySaved = (): SavedUpdates => ({
  checkedAt: 0,
  firmware: null,
  seen: [],
  notified: [],
  alerts: false,
});

export const noticeKey = (notice: ReleaseNotice): string =>
  `${notice.kind}:${notice.releaseId}:${notice.version}`;

const stableFirmwareVersion = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))?$/.test(value);

const validCachedFirmware = (value: unknown): value is ReleaseNotice => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const notice = value as Record<string, unknown>;
  if (
    notice.kind !== 'firmware' ||
    typeof notice.releaseId !== 'string' ||
    notice.releaseId.trim().length === 0 ||
    notice.releaseId.length > 128 ||
    typeof notice.title !== 'string' ||
    notice.title.trim().length === 0 ||
    !stableFirmwareVersion(notice.version) ||
    notice.releaseUrl !==
      `https://github.com/Starnished66/compas-player/releases/tag/${encodeURIComponent(notice.version)}`
  ) {
    return false;
  }

  return (
    notice.publishedAt === null ||
    (typeof notice.publishedAt === 'string' &&
      notice.publishedAt.trim().length > 0 &&
      !Number.isNaN(Date.parse(notice.publishedAt)))
  );
};

const stringEntries = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(-20) : [];

/** Parse persisted preferences defensively; corrupted and future state resets safely. */
export function parseSavedUpdates(text: string | null): SavedUpdates {
  try {
    const parsed: unknown = JSON.parse(text || '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return emptySaved();
    const value = parsed as Record<string, unknown>;
    const checkedAt =
      typeof value.checkedAt === 'number' &&
      Number.isFinite(value.checkedAt) &&
      value.checkedAt >= 0 &&
      value.checkedAt <= Date.now()
        ? value.checkedAt
        : 0;

    return {
      checkedAt,
      firmware: validCachedFirmware(value.firmware) ? value.firmware : null,
      seen: stringEntries(value.seen),
      notified: stringEntries(value.notified),
      alerts: value.alerts === true,
    };
  } catch {
    return emptySaved();
  }
}
