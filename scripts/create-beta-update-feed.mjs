import { readFile, writeFile } from 'node:fs/promises';

const [metadataPath, manifestPath, checksumsPath, outputPath] = process.argv.slice(2);
if (!metadataPath || !manifestPath || !checksumsPath || !outputPath) {
  throw new Error('Usage: node scripts/create-beta-update-feed.mjs <release.json> <manifest.json> <SHA256SUMS> <output.json>');
}
const release = JSON.parse(await readFile(metadataPath, 'utf8'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const checksums = await readFile(checksumsPath, 'utf8');
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)$/;
const tag = release.tagName;
const version = typeof tag === 'string' && tag.startsWith('v') ? tag.slice(1) : '';
if (!release.isPrerelease || release.isDraft || tag.length > 65 || !versionPattern.test(version) || version.length > 64 || manifest.version !== version ||
  manifest.schema !== 1 || manifest.packageName !== 'com.compas.remote' || !Number.isSafeInteger(manifest.versionCode) || manifest.versionCode < 1 || manifest.versionCode > 2147483647 ||
  !Number.isSafeInteger(manifest.minSdk) || manifest.minSdk < 28 || !Number.isSafeInteger(manifest.size) ||
  manifest.size < 1 || manifest.size > 268435456 || typeof manifest.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(manifest.sha256)) {
  throw new Error('Published prerelease metadata or update manifest is invalid');
}
const apkName = `compas-${version}.apk`;
const apkUrl = `https://github.com/Starnished66/compas-app/releases/download/${tag}/${apkName}`;
const apk = release.assets?.find((asset) => asset.name === apkName);
if (!apk || apk.size !== manifest.size || manifest.url !== apkUrl ||
  !checksums.split(/\r?\n/).some((line) => line === `${manifest.sha256}  ${apkName}`)) {
  throw new Error('Prerelease APK asset, version manifest, and checksum file do not match');
}
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
