import { Platform } from 'react-native';
import { fetchAppUpdateManifest } from '../../modules/compas-updates/src';

export const FIRMWARE_RELEASES_API_URL =
  'https://api.github.com/repos/Starnished66/compas-player/releases/latest';

export const FIRMWARE_RELEASES_PAGE_URL =
  'https://github.com/Starnished66/compas-player/releases/tag';

export const SUPPORTED_FIRMWARE_ASSETS = [
  'r1.upt',
  'r3proii.upt',
  'r3ii_2025.upt',
] as const;

export const RELEASE_CHECK_TIMEOUT_MS = 10_000;

/** Canonical latest-release manifest and app release page. */
export const APP_UPDATE_URL = 'https://github.com/Starnished66/compas-app/releases/latest/download/android-update.json';
export const APP_BETA_UPDATE_URL = 'https://github.com/Starnished66/compas-app/releases/download/updates-beta/android-update.json';
export const APP_RELEASES_API_URL = 'https://github.com/Starnished66/compas-app/releases';
export const MAX_APPLICATION_APK_SIZE = 268435456;
const APPLICATION_PACKAGE = 'com.compas.remote';
export type ApplicationUpdateChannel = 'stable' | 'beta';

export type ReleaseNoticeKind = 'firmware' | 'application';

export interface ReleaseNotice {
  kind: ReleaseNoticeKind;
  title: string;
  version: string;
  releaseUrl: string;
  publishedAt: string | null;
  releaseId: string;
  versionCode?: number;
  size?: number;
  sha256?: string;
  minSdk?: number;
  channel?: ApplicationUpdateChannel;
}

/** Stable manifest source. Beta uses the owner-maintained prerelease alias feed. */
export interface ApplicationUpdateConfig {
  sourceUrl: string;
}

export const APPLICATION_UPDATE_CONFIG: Readonly<ApplicationUpdateConfig> =
  Object.freeze({ sourceUrl: APP_UPDATE_URL });

type LatestReleasePayload = {
  id: number | string;
  tag_name: string;
  name?: unknown;
  draft: boolean;
  prerelease: boolean;
  html_url: string;
  published_at?: unknown;
  assets: Array<{ name: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStableFirmwareTag(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))?$/.test(value)
  );
}

function isLatestReleasePayload(value: unknown): value is LatestReleasePayload {
  if (!isRecord(value)) return false;
  if (
    !(typeof value.id === 'number' || typeof value.id === 'string') ||
    typeof value.tag_name !== 'string' ||
    typeof value.draft !== 'boolean' ||
    typeof value.prerelease !== 'boolean' ||
    typeof value.html_url !== 'string' ||
    !Array.isArray(value.assets)
  ) {
    return false;
  }

  return value.assets.every((asset) => isRecord(asset) && typeof asset.name === 'string');
}

function trustedReleaseUrl(tag: string): string {
  return `${FIRMWARE_RELEASES_PAGE_URL}/${encodeURIComponent(tag)}`;
}

function toFirmwareNotice(payload: unknown): ReleaseNotice | null {
  if (!isLatestReleasePayload(payload)) return null;
  if (payload.draft || payload.prerelease || !isStableFirmwareTag(payload.tag_name)) return null;
  if (payload.html_url !== trustedReleaseUrl(payload.tag_name)) return null;

  const assetNames = new Set(payload.assets.map((asset) => asset.name));
  const hasSupportedFirmware = SUPPORTED_FIRMWARE_ASSETS.some((name) => assetNames.has(name));
  if (!hasSupportedFirmware || !assetNames.has('SHA256SUMS')) return null;

  const publishedAt =
    typeof payload.published_at === 'string' && !Number.isNaN(Date.parse(payload.published_at))
      ? payload.published_at
      : null;

  return {
    kind: 'firmware',
    title: typeof payload.name === 'string' && payload.name.trim() ? payload.name : payload.tag_name,
    version: payload.tag_name,
    releaseUrl: trustedReleaseUrl(payload.tag_name),
    publishedAt,
    releaseId: String(payload.id),
  };
}

/**
 * Fetches and validates the latest stable firmware release. It only returns a
 * release page announcement; it never downloads firmware or checksum assets.
 * A payload that fails validation resolves to null; network, timeout and HTTP
 * errors reject, and UpdatesProvider reports them as a failed check.
 */
export async function fetchLatestFirmwareRelease(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = RELEASE_CHECK_TIMEOUT_MS,
  channel: ApplicationUpdateChannel = 'stable',
): Promise<ReleaseNotice | null> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const request = fetchImpl(FIRMWARE_RELEASES_API_URL, {
      method: 'GET',
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    const timeoutRequest = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error('Release check timed out'));
      }, Math.max(1, timeoutMs));
    });
    const response = await Promise.race([request, timeoutRequest]);
    if (!response.ok) {
      throw new Error(`Firmware release check failed with HTTP status ${response.status}`);
    }

    const payload = await Promise.race([response.json(), timeoutRequest]);
    return toFirmwareNotice(payload);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/**
 * Strict numeric version comparison, used for firmware notices today and for a
 * future configured application feed.
 * Supports optional `v` prefixes and SemVer-style prerelease identifiers,
 * including the app's current `0.3.6-8` form. Invalid versions return null.
 */
export function compareApplicationVersions(current: string, candidate: string): -1 | 0 | 1 | null {
  const left = parseVersion(current);
  const right = parseVersion(candidate);
  if (!left || !right) return null;

  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] < right.core[index]) return -1;
    if (left.core[index] > right.core[index]) return 1;
  }

  if (!left.prerelease && !right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      const leftNumber = Number(leftPart);
      const rightNumber = Number(rightPart);
      if (!Number.isSafeInteger(leftNumber) || !Number.isSafeInteger(rightNumber)) return null;
      return leftNumber < rightNumber ? -1 : 1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function parseVersion(value: string): {
  core: [number, number, number];
  prerelease: string[] | null;
} | null {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
    value,
  );
  if (!match) return null;
  const core = [Number(match[1]), Number(match[2]), Number(match[3] ?? '0')] as [number, number, number];
  if (!core.every(Number.isSafeInteger)) return null;
  return { core, prerelease: match[4] ? match[4].split('.') : null };
}

/**
 * True only when the installed player version parses and is older than the
 * release. An unknown version (not connected, no `device_info`, or a label such
 * as "Development Build") never claims the release is newer, so no notice fires.
 */
export function isFirmwareReleaseNewer(installed: string | null | undefined, release: string): boolean {
  if (!installed) return false;
  return compareApplicationVersions(installed.trim(), release) === -1;
}

/** Read a bounded release manifest and accept only the canonical GitHub asset URL. */
export async function fetchApplicationUpdateNotice(
  config: Readonly<ApplicationUpdateConfig> = APPLICATION_UPDATE_CONFIG,
  fetchImpl?: typeof fetch,
  installedVersionCode = 0,
  deviceApiLevel = 0,
  timeoutMs = RELEASE_CHECK_TIMEOUT_MS,
  channel: ApplicationUpdateChannel = 'stable',
): Promise<ReleaseNotice | null> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    let text: string;
    let status: number;
    if (fetchImpl) {
      const feedUrl = channel === 'beta' ? APP_BETA_UPDATE_URL : config.sourceUrl;
      const request = fetchImpl(feedUrl, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal });
      const timeoutRequest = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => { controller.abort(); reject(new Error('Application update check timed out')); }, Math.max(1, timeoutMs));
      });
      const response = await Promise.race([request, timeoutRequest]);
      status = response.status;
      if (status !== 404 && !response.ok) throw new Error(`Application update check failed with HTTP status ${status}`);
      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > 16 * 1024) throw new Error('Application update manifest is too large');
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        while (true) {
          const { done, value } = await Promise.race([reader.read(), timeoutRequest]);
          if (done) break;
          total += value.byteLength;
          if (total > 16 * 1024) { await reader.cancel(); throw new Error('Application update manifest is too large'); }
          chunks.push(value);
        }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        text = new TextDecoder().decode(bytes);
      } else {
        text = await Promise.race([response.text(), timeoutRequest]);
        if (new TextEncoder().encode(text).byteLength > 16 * 1024) throw new Error('Application update manifest is too large');
      }
    } else {
      if (Platform.OS !== 'android') return null;
      const response = await fetchAppUpdateManifest(channel);
      status = response.status;
      text = response.body;
    }
    if (status === 404) return null;
    if (new TextEncoder().encode(text).byteLength > 16 * 1024) throw new Error('Application update manifest is too large');
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { throw new Error('Application update manifest is invalid'); }
    if (!isRecord(payload) || payload.schema !== 1 || payload.packageName !== APPLICATION_PACKAGE ||
      !isApplicationVersion(payload.version, channel) || !Number.isSafeInteger(payload.versionCode) || (payload.versionCode as number) < 1 || (payload.versionCode as number) > 2147483647 || (payload.versionCode as number) <= installedVersionCode ||
      !Number.isSafeInteger(payload.minSdk) || (payload.minSdk as number) < 28 || (payload.minSdk as number) > deviceApiLevel ||
      !Number.isSafeInteger(payload.size) || (payload.size as number) < 1 || (payload.size as number) > MAX_APPLICATION_APK_SIZE ||
      typeof payload.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(payload.sha256) || typeof payload.url !== 'string' ||
      payload.url !== `https://github.com/Starnished66/compas-app/releases/download/v${payload.version}/compas-${payload.version}.apk`) return null;
    return {
      kind: 'application', title: `Compás Remote ${payload.version}`, version: payload.version as string,
      releaseUrl: `https://github.com/Starnished66/compas-app/releases/tag/v${payload.version}`,
      publishedAt: null, releaseId: `v${payload.version}`, versionCode: payload.versionCode as number,
      size: payload.size as number, sha256: payload.sha256, minSdk: payload.minSdk as number, channel,
    };
  } finally { if (timeout !== undefined) clearTimeout(timeout); }
}

function isApplicationVersion(value: unknown, channel: ApplicationUpdateChannel): value is string {
  if (typeof value !== 'string' || value.length > 64) return false;
  const pattern = channel === 'stable'
    ? /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
    : /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))$/;
  const match = pattern.exec(value);
  return !!match && match.slice(1, 4).every((part) => Number.isSafeInteger(Number(part)));
}

/** Check firmware and Android app feeds independently so either can succeed alone. */
export async function checkReleaseUpdates(
  _installedAppVersion: string,
  installedVersionCode = 0,
  deviceApiLevel = 0,
  fetchImpl?: typeof fetch,
  applicationChannel: ApplicationUpdateChannel = 'stable',
): Promise<{ firmware: ReleaseNotice | null; application: ReleaseNotice | null; firmwareError: boolean; applicationError: boolean }> {
  const [firmwareResult, applicationResult] = await Promise.allSettled([
    fetchLatestFirmwareRelease(fetchImpl),
    fetchApplicationUpdateNotice(APPLICATION_UPDATE_CONFIG, fetchImpl, installedVersionCode, deviceApiLevel, RELEASE_CHECK_TIMEOUT_MS, applicationChannel),
  ]);
  return {
    firmware: firmwareResult.status === 'fulfilled' ? firmwareResult.value : null,
    application: applicationResult.status === 'fulfilled' ? applicationResult.value : null,
    firmwareError: firmwareResult.status === 'rejected',
    applicationError: applicationResult.status === 'rejected',
  };
}
