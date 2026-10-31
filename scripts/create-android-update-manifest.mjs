import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { apksignerCertificateSha256 } = require('./apksigner-certificate.cjs');

const apkPath = process.argv[2];
const tag = process.argv[3];
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?$/;
if (!apkPath || !tag?.startsWith('v') || tag.length > 65 || !versionPattern.test(tag.slice(1))) {
  throw new Error('Usage: node scripts/create-android-update-manifest.mjs <apk-path> <vX.Y.Z-tag>');
}
const size = (await stat(apkPath)).size;
if (!size || size > 268435456) throw new Error(`APK size ${size} is outside the supported range`);
const app = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8')).expo;
const sdkRoot = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
if (!sdkRoot) throw new Error('Android SDK is required to inspect the release APK');
const buildTools = (await readdir(join(sdkRoot, 'build-tools'))).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
if (!buildTools) throw new Error('Android build-tools are unavailable');
const toolsDir = join(sdkRoot, 'build-tools', buildTools);
const badging = execFileSync(join(toolsDir, 'aapt'), ['dump', 'badging', apkPath], { encoding: 'utf8' });
const apkInfo = /package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/.exec(badging);
const apkMinSdk = /^sdkVersion:'(\d+)'$/m.exec(badging);
if (!apkInfo || !apkMinSdk) throw new Error('Could not read package/version/minSdk from the release APK');
const [, packageName, rawVersionCode, version] = apkInfo;
const versionCode = Number(rawVersionCode);
const minSdk = Number(apkMinSdk[1]);
const expoBuildProperties = app.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-build-properties')?.[1]?.android;
const expectedMinSdk = app.android.minSdkVersion ?? expoBuildProperties?.minSdkVersion ?? 28;
if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2147483647 || version.length > 64 || !Number.isSafeInteger(minSdk) || tag !== `v${version}` ||
  packageName !== 'com.compas.remote' || app.version !== version || app.android.versionCode !== versionCode ||
  app.android.package !== packageName || expectedMinSdk !== minSdk) {
  throw new Error(`APK metadata does not match the tag and app.json: ${JSON.stringify({ tag, packageName, version, versionCode, minSdk })}`);
}
const signerOutput = execFileSync(join(toolsDir, 'apksigner'), ['verify', '--print-certs', apkPath], { encoding: 'utf8' });
const certificateSha256 = apksignerCertificateSha256(signerOutput);
const expectedCertificateSha256 = 'c18af8d9623d54ef37f8db4e4b5217e37467a137d8bc8dd9eaa6c6c45ec8ba74';
if (certificateSha256 !== expectedCertificateSha256) throw new Error(`Release APK is not signed by the established production certificate (got ${certificateSha256 ?? 'none'})`);
const digest = createHash('sha256');
let hashedBytes = 0;
for await (const chunk of createReadStream(apkPath)) {
  hashedBytes += chunk.length;
  if (hashedBytes > 268435456) throw new Error('APK grew beyond the supported size while hashing');
  digest.update(chunk);
}
if (hashedBytes !== size) throw new Error('APK size changed while hashing');
const sha256 = digest.digest('hex');
const manifest = {
  schema: 1,
  packageName,
  version,
  versionCode,
  minSdk,
  url: `https://github.com/Starnished66/compas-app/releases/download/${tag}/compas-${version}.apk`,
  size,
  sha256,
};
await writeFile('android-update.json', `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile('SHA256SUMS', `${sha256}  compas-${version}.apk\n`);
