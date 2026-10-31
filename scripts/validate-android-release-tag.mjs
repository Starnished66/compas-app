import { readFile } from 'node:fs/promises';

const tag = process.argv[2];
const app = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8')).expo;
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?$/;
if (!tag?.startsWith('v') || tag.length > 65 || !versionPattern.test(tag.slice(1)) || tag !== `v${app.version}` ||
  app.android.package !== 'com.compas.remote' || !Number.isSafeInteger(app.android.versionCode) || app.android.versionCode < 1 || app.android.versionCode > 2147483647) {
  throw new Error(`Release tag must match app.json version and package; got ${tag ?? '(missing)'}`);
}
