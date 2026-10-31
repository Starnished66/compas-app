import type { ReleaseNotice } from './releaseUpdates';

export interface SavedUpdates {
  checkedAt: number;
  attemptedAt: number;
  firmware: ReleaseNotice | null;
  application: ReleaseNotice | null;
  seen: string[];
  notified: string[];
  alerts: boolean;
  betaUpdates: boolean;
}

export const emptySaved = (): SavedUpdates => ({
  checkedAt: 0,
  attemptedAt: 0,
  firmware: null,
  application: null,
  seen: [],
  notified: [],
  alerts: false,
  betaUpdates: false,
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

const validCachedApplication = (value: unknown): value is ReleaseNotice => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const n = value as Record<string, unknown>;
  const stableVersion = typeof n.version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(n.version);
  const betaVersion = typeof n.version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*$/.test(n.version);
  return n.kind === 'application' && typeof n.version === 'string' && n.version.length <= 64 && (n.channel === 'stable' ? stableVersion : n.channel === 'beta' && betaVersion) &&
    n.releaseUrl === `https://github.com/Starnished66/compas-app/releases/tag/v${n.version}` && n.releaseId === `v${n.version}` &&
    Number.isSafeInteger(n.versionCode) && (n.versionCode as number) >= 1 && (n.versionCode as number) <= 2147483647 && Number.isSafeInteger(n.minSdk) && (n.minSdk as number) >= 28 && Number.isSafeInteger(n.size) && (n.size as number) > 0 &&
    (n.size as number) <= 268435456 && typeof n.sha256 === 'string' && /^[0-9a-f]{64}$/.test(n.sha256);
};

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
    const attemptedAt = typeof value.attemptedAt === 'number' && Number.isFinite(value.attemptedAt) && value.attemptedAt >= 0 && value.attemptedAt <= Date.now()
      ? value.attemptedAt : checkedAt;

    return {
      checkedAt,
      attemptedAt,
      firmware: validCachedFirmware(value.firmware) ? value.firmware : null,
      application: validCachedApplication(value.application) ? value.application : null,
      seen: stringEntries(value.seen),
      notified: stringEntries(value.notified),
      alerts: value.alerts === true,
      betaUpdates: value.betaUpdates === true,
    };
  } catch {
    return emptySaved();
  }
}
