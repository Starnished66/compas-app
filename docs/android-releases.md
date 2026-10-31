# Android release drafts

Tag a release only after updating `expo.version` and `expo.android.versionCode` in `app.json`. The tag must be `v<version>` and may include a strict SemVer prerelease suffix such as `v0.4.1-beta.1`. The GitHub Actions workflow builds the signed release APK with the configured production signing key, generates `android-update.json` and `SHA256SUMS`, and creates a **draft** release. It does not publish the release. When an owner manually publishes a prerelease, a separate workflow verifies its assets and updates the `updates-beta` prerelease feed; stable releases do not update that feed.

Configure these repository secrets:

- `ANDROID_KEYSTORE_BASE64`: base64 encoded production keystore
- `ANDROID_STORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The workflow exposes these to Gradle as `COMPAS_ANDROID_KEYSTORE_PATH`, `COMPAS_ANDROID_STORE_PASSWORD`, `COMPAS_ANDROID_KEY_ALIAS`, and `COMPAS_ANDROID_KEY_PASSWORD`, and sets `COMPAS_ANDROID_RELEASE=1` so a missing signing configuration fails the build. Keep the keystore and passwords out of the repository. Before creating the manifest, the workflow reads the APK's package, version, version code and minimum SDK from its actual metadata, and requires the established production signing certificate SHA-256 (`c18af8d9623d54ef37f8db4e4b5217e37467a137d8bc8dd9eaa6c6c45ec8ba74`). Review the draft APK and generated feed before publishing; the app updater accepts only the canonical stable release asset URL and verifies the APK digest and package metadata before opening Android's installer.
