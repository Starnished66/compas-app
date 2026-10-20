// Capture import-time failures before loading the app's module graph.
const { installJavaScriptCrashCapture } = require('./modules/compas-diagnostics/src');
installJavaScriptCrashCapture();

const { registerRootComponent } = require('expo');
const AppRoot = require('./AppRoot').default;
registerRootComponent(AppRoot);
