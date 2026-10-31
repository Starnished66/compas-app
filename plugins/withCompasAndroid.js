const { withAndroidManifest, withAppBuildGradle } = require('@expo/config-plugins');

const RELEASE_SIGNING = `
// Compas release signing: credentials stay in the build environment, never in generated sources.
def compasStore = System.getenv('COMPAS_ANDROID_KEYSTORE_PATH')
def compasReleaseRequired = System.getenv('COMPAS_ANDROID_RELEASE') == '1'
def compasStorePassword = System.getenv('COMPAS_ANDROID_STORE_PASSWORD')
def compasKeyAlias = System.getenv('COMPAS_ANDROID_KEY_ALIAS')
def compasKeyPassword = System.getenv('COMPAS_ANDROID_KEY_PASSWORD')
def compasHasSigning = compasStore && compasStorePassword && compasKeyAlias && compasKeyPassword
if (compasReleaseRequired && !compasHasSigning) {
    throw new GradleException('Release signing credentials are required for a distributed Compas APK')
}
if (compasHasSigning) {
    android.signingConfigs.create('compasRelease') {
        storeFile file(compasStore)
        storePassword compasStorePassword
        keyAlias compasKeyAlias
        keyPassword compasKeyPassword
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.compasRelease
}
`;

function withCompasAndroid(config) {
  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('// Compas release signing:')) {
      config.modResults.contents += RELEASE_SIGNING;
    }
    return config;
  });
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;

    // Ensure permissions
    const permissionsToAdd = [
      { name: 'android.permission.INTERNET' },
      { name: 'android.permission.ACCESS_NETWORK_STATE' },
      { name: 'android.permission.ACCESS_WIFI_STATE' },
      { name: 'android.permission.CHANGE_WIFI_MULTICAST_STATE' },
      { name: 'android.permission.ACCESS_LOCAL_NETWORK' },
      { name: 'android.permission.FOREGROUND_SERVICE' },
      { name: 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK' },
      { name: 'android.permission.POST_NOTIFICATIONS' },
      { name: 'android.permission.BLUETOOTH_CONNECT' },
      {
        name: 'android.permission.BLUETOOTH_SCAN',
        attributes: { 'android:usesPermissionFlags': 'neverForLocation' },
      },
      {
        name: 'android.permission.BLUETOOTH',
        attributes: { 'android:maxSdkVersion': '30' },
      },
      {
        name: 'android.permission.BLUETOOTH_ADMIN',
        attributes: { 'android:maxSdkVersion': '30' },
      },
      {
        name: 'android.permission.ACCESS_FINE_LOCATION',
        attributes: { 'android:maxSdkVersion': '30' },
      },
    ];

    if (!androidManifest['uses-permission']) {
      androidManifest['uses-permission'] = [];
    }

    const existingPerms = new Set(
      androidManifest['uses-permission'].map((p) => p.$?.['android:name'])
    );

    for (const perm of permissionsToAdd) {
      if (!existingPerms.has(perm.name)) {
        androidManifest['uses-permission'].push({
          $: {
            'android:name': perm.name,
            ...(perm.attributes || {}),
          },
        });
      }
    }

    // Configure application attributes
    const app = androidManifest.application?.[0];
    if (app) {
      if (!app.$) app.$ = {};
      app.$['android:usesCleartextTraffic'] = 'true';
      // Android 10 needs legacy storage for direct file reads in the Transfer tab.
      app.$['android:requestLegacyExternalStorage'] = 'true';

      // Ensure MediaActionReceiver
      if (!app.receiver) {
        app.receiver = [];
      }
      const receiverName = 'com.compas.remote.mediasession.MediaActionReceiver';
      const hasReceiver = app.receiver.some(
        (r) => r.$?.['android:name'] === receiverName
      );
      if (!hasReceiver) {
        app.receiver.push({
          $: {
            'android:name': receiverName,
            'android:exported': 'false',
          },
        });
      }

      // Ensure RemotePlaybackService
      if (!app.service) {
        app.service = [];
      }
      const serviceName = 'com.compas.remote.mediasession.RemotePlaybackService';
      const hasService = app.service.some(
        (s) => s.$?.['android:name'] === serviceName
      );
      if (!hasService) {
        app.service.push({
          $: {
            'android:name': serviceName,
            'android:exported': 'false',
            'android:foregroundServiceType': 'mediaPlayback',
          },
        });
      }

      // Names the player as the output device in the media notification.
      const routeProviderName = 'com.compas.remote.mediasession.PlayerRouteProviderService';
      if (!app.service.some((s) => s.$?.['android:name'] === routeProviderName)) {
        app.service.push({
          $: {
            'android:name': routeProviderName,
            'android:exported': 'true',
          },
          'intent-filter': [{ action: [{ $: { 'android:name': 'android.media.MediaRoute2ProviderService' } }] }],
        });
      }
    }

    return config;
  });
}

module.exports = withCompasAndroid;
