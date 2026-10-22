const fs = require('fs');
const path = require('path');
const { withAndroidColors, withAndroidStyles, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');

// The "compás" wordmark on the boot-logo black, from assets/splash/. The same
// layer list is the window background, so the wordmark stays visible behind
// React Native's transparent root until the UI first renders.
const BACKGROUND = '#0B0C10';
const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

function setItem(style, name, value) {
  style.item = (style.item || []).filter((item) => item.$.name !== name);
  style.item.push({ $: { name }, _: value });
}

function withCompasSplash(config) {
  config = withAndroidColors(config, (config) => {
    config.modResults = AndroidConfig.Colors.assignColorValue(config.modResults, {
      name: 'splashscreen_background',
      value: BACKGROUND,
    });
    return config;
  });

  config = withAndroidStyles(config, (config) => {
    const styles = config.modResults.resources.style || [];
    const appTheme = styles.find((s) => s.$.name === 'AppTheme');
    const splashTheme = styles.find((s) => s.$.name === 'Theme.App.SplashScreen');
    if (appTheme) setItem(appTheme, 'android:windowBackground', '@drawable/splash_window');
    if (splashTheme) {
      setItem(splashTheme, 'android:windowSplashScreenBackground', '@color/splashscreen_background');
      setItem(splashTheme, 'android:windowSplashScreenAnimatedIcon', '@drawable/splashscreen_logo');
      setItem(splashTheme, 'android:windowBackground', '@drawable/splash_window');
    }
    return config;
  });

  return withDangerousMod(config, [
    'android',
    (config) => {
      const source = path.join(config.modRequest.projectRoot, 'assets', 'splash');
      const res = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
      for (const density of DENSITIES) {
        const dir = path.join(res, `drawable-${density}`);
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(path.join(source, `splashscreen_logo-${density}.png`), path.join(dir, 'splashscreen_logo.png'));
      }
      fs.mkdirSync(path.join(res, 'drawable'), { recursive: true });
      fs.copyFileSync(path.join(source, 'splash_window.xml'), path.join(res, 'drawable', 'splash_window.xml'));
      return config;
    },
  ]);
}

module.exports = withCompasSplash;
