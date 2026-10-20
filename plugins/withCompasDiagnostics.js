const { withMainApplication } = require('@expo/config-plugins');

const IMPORT = 'import com.compas.remote.diagnostics.CrashHandlerInstaller';
const CALL = 'CrashHandlerInstaller.install(this)';

function withCompasDiagnostics(config) {
  return withMainApplication(config, (config) => {
    const result = config.modResults;
    if (result.language !== 'kt') {
      throw new Error('Compás diagnostics requires a Kotlin MainApplication');
    }
    let contents = result.contents;
    if (!contents.includes(IMPORT)) {
      const packageEnd = contents.search(/\n\s*\n/);
      if (packageEnd < 0) throw new Error('Could not locate package declaration in MainApplication.kt');
      contents = `${contents.slice(0, packageEnd)}\n${IMPORT}${contents.slice(packageEnd)}`;
    }
    if (!contents.includes(CALL)) {
      const onCreateStart = contents.indexOf('override fun onCreate()');
      if (onCreateStart < 0) throw new Error('Could not locate onCreate() in MainApplication.kt');
      const superCall = contents.indexOf('super.onCreate()', onCreateStart);
      const bodyEnd = contents.indexOf('\n', superCall);
      if (superCall < 0 || bodyEnd < 0) throw new Error('Could not locate super.onCreate() in MainApplication.kt');
      contents = `${contents.slice(0, bodyEnd + 1)}    ${CALL}\n${contents.slice(bodyEnd + 1)}`;
    }
    result.contents = contents;
    return config;
  });
}

module.exports = withCompasDiagnostics;
