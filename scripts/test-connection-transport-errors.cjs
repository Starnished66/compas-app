const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const ConnectionStatus = {
  Connected: 'Connected',
  Connecting: 'Connecting',
  Disconnected: 'Disconnected',
  Error: 'Error',
};

function load(file, imports = {}) {
  const source = fs.readFileSync(`${__dirname}/../${file}`, 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(javascript, {
    module,
    exports: module.exports,
    Error,
    require: (name) => {
      assert.ok(name in imports, `Unexpected import: ${name}`);
      return imports[name];
    },
  });
  return module.exports;
}

const { selectConnectionTransport } = load('src/session/connectionTransportSelection.ts', {
  '../data/types': { ConnectionStatus },
});
const { wifiImportErrorMessage } = load('src/session/wifiImportError.ts');

const failed = {
  selectedConnectionTransport: 'Bluetooth',
  connectionStatus: ConnectionStatus.Error,
  connectionTransport: 'Wifi',
  connectionMessage: 'Select a paired Bluetooth player first.',
  pinDialogVisible: false,
  pinRetryDelaySeconds: 0,
};
const selectedWifi = selectConnectionTransport(failed, 'Wifi');
assert.equal(selectedWifi.selectedConnectionTransport, 'Wifi');
assert.equal(selectedWifi.connectionStatus, ConnectionStatus.Disconnected);
assert.equal(selectedWifi.connectionMessage, null);
assert.equal(failed.connectionMessage, 'Select a paired Bluetooth player first.');
assert.equal(selectConnectionTransport(failed, 'Bluetooth'), failed, 'Selecting the current transport preserves its error');

for (const state of [
  { ...failed, connectionStatus: ConnectionStatus.Connected },
  { ...failed, connectionStatus: ConnectionStatus.Connecting },
  { ...failed, pinDialogVisible: true },
  { ...failed, pinDialogVisible: false, pinRetryDelaySeconds: 20 },
]) {
  const next = selectConnectionTransport(state, 'Wifi');
  assert.equal(next.selectedConnectionTransport, 'Wifi');
  assert.equal(next.connectionStatus, state.connectionStatus);
  assert.equal(next.connectionMessage, state.connectionMessage);
}

const message = 'Turn on Wi-Fi on the player and try again.';
assert.equal(wifiImportErrorMessage('wifi_disabled'), message);
assert.equal(wifiImportErrorMessage({ statusCode: 409, responseBody: '{"code":"player_storage_busy"}' }),
  'The player is busy with another task. Finish it and try again.');
assert.equal(wifiImportErrorMessage({ statusCode: 500, responseBody: '{"code":"future_error"}' }, 'Remote API returned HTTP 500: {"code":"future_error"}'),
  'Remote API returned HTTP 500: {"code":"future_error"}');
assert.equal(wifiImportErrorMessage(new Error('The player did not respond.')), 'The player did not respond.');

console.log('Transport error clearing and Wi-Fi import error normalization passed');
