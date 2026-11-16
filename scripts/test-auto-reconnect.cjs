const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the hook's actual orchestration with controlled native/storage boundaries.
const source = fs.readFileSync(`${__dirname}/../src/session/useRemoteSession.ts`, 'utf8');
const tree = ts.createSourceFile('useRemoteSession.ts', source, ts.ScriptTarget.Latest, true);
const functions = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    functions.set(node.name.text, node.initializer.getText(tree));
  }
  ts.forEachChild(node, visit);
}
visit(tree);
const T = { Wifi: 'Wifi', Bluetooth: 'Bluetooth' };
const ref = (current) => ({ current });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
function harness(transport = T.Wifi) {
  const calls = [];
  const timers = [];
  const ctx = {
    ConnectionTransport: T,
    ConnectionStatus: { Connecting: 'Connecting', Error: 'Error' },
    PREF_WIFI_ADDRESS: 'wifi', PREF_BLUETOOTH_ID: 'bt',
    AsyncStorage: { getItem: async (key) => key === 'wifi' ? '192.0.2.1:8899' : 'AA:BB:CC:DD:EE:FF' },
    autoReconnectTimerRef: ref(null), autoReconnectEnabledRef: ref(true),
    lastConnectionTransportRef: ref(transport), bluetoothPairingRequiredRef: ref(false),
    autoReconnectGenerationRef: ref(0), autoReconnectRunningRef: ref(false),
    autoReconnectDueAtRef: ref(0), apiRef: ref(null),
    stateRef: ref({ pinDialogVisible: false, connectionStatus: 'Error', selectedConnectionTransport: T.Bluetooth, selectedBluetoothPlayerId: 'AA:BB:CC:DD:EE:FF', wifiAddress: '192.0.2.1:8899' }),
    getRequiredPermissionsForWifi: () => [], getRequiredPermissionsForBluetooth: () => ['bluetooth'],
    checkPermissions: async () => true,
    startPlaybackService: async () => {}, stopPlaybackService: async () => {},
    setTimeout: (fn, delay) => { const timer = { fn, delay }; timers.push(timer); return timer; },
    clearTimeout: (timer) => { timer.cleared = true; },
    Date, setState: (update) => { ctx.stateRef.current = update(ctx.stateRef.current); },
    connectDirect: async (...args) => { calls.push(args); return false; },
    resetPairingBlock: async (id) => { calls.push(['reset', id]); },
    rejectConnectChoice: (message) => { throw new Error(message); },
  };
  vm.createContext(ctx);
  const load = (name) => {
    assert.ok(functions.has(name), `Missing production function ${name}`);
    const code = ts.transpileModule(`globalThis.${name} = ${functions.get(name)};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInContext(code, ctx);
  };
  for (const name of ['scheduleAutoReconnect', 'runAutoReconnect', 'pauseForBluetoothPairing', 'connect']) load(name);
  return { ctx, calls, timers, load };
}
(async () => {
  const wifi = harness();
  await wifi.ctx.runAutoReconnect();
  await wifi.ctx.runAutoReconnect();
  assert.deepEqual(wifi.calls.map((call) => call[0]), [T.Wifi, T.Wifi], 'Wi-Fi loss never silently falls back to stale Bluetooth');
  assert.equal(wifi.timers.at(-1).delay, 15000);

  const bt = harness(T.Bluetooth);
  await bt.ctx.runAutoReconnect();
  await bt.ctx.runAutoReconnect();
  assert.deepEqual(bt.calls.map((call) => call[0]), [T.Bluetooth, T.Bluetooth], 'Ordinary Bluetooth outages keep retrying');
  assert.equal(bt.ctx.pauseForBluetoothPairing({ code: 'RFCOMM_ERROR' }), false);
  assert.equal(bt.ctx.pauseForBluetoothPairing({ code: 'BLUETOOTH_PAIRING_REQUIRED' }), true);
  assert.equal(bt.ctx.autoReconnectTimerRef.current, null);
  bt.ctx.scheduleAutoReconnect();
  await bt.ctx.runAutoReconnect();
  assert.equal(bt.calls.length, 2, 'Pairing-required device does not repeatedly open sockets');
  await bt.ctx.connect();
  assert.equal(bt.calls[2][0], 'reset', 'Only explicit Connect re-arms native pairing');
  assert.equal(bt.calls[3][0], T.Bluetooth);
  assert.equal(bt.ctx.bluetoothPairingRequiredRef.current, false);

  const cancelled = harness();
  const storage = deferred();
  cancelled.ctx.AsyncStorage.getItem = () => storage.promise;
  const pending = cancelled.ctx.runAutoReconnect();
  cancelled.ctx.autoReconnectGenerationRef.current++;
  storage.resolve('saved');
  await pending;
  assert.equal(cancelled.calls.length, 0, 'An old storage read cannot reconnect after explicit cancellation');
  assert.equal(cancelled.timers.length, 0);

  const permission = harness(T.Bluetooth);
  const permissionResult = deferred();
  permission.ctx.checkPermissions = () => permissionResult.promise;
  const waiting = permission.ctx.runAutoReconnect();
  await Promise.resolve(); await Promise.resolve();
  permission.ctx.autoReconnectEnabledRef.current = false;
  permissionResult.resolve(true);
  await waiting;
  assert.equal(permission.calls.length, 0, 'Permission completion cannot revive a disconnected session');

  const overlap = harness();
  const response = deferred();
  overlap.ctx.connectDirect = async (...args) => { overlap.calls.push(args); return response.promise; };
  const first = overlap.ctx.runAutoReconnect();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  await overlap.ctx.runAutoReconnect();
  response.resolve(false);
  await first;
  assert.equal(overlap.calls.length, 1, 'Only one automatic recovery attempt can run at a time');

  const pin = harness();
  pin.ctx.stateRef.current.pinDialogVisible = true;
  await pin.ctx.runAutoReconnect();
  assert.equal(pin.calls.length, 0, 'Automatic recovery never races PIN entry');
  for (const boundary of ['pin', 'capabilities', 'status', 'save']) {
    const direct = harness();
    const wait = deferred();
    const requests = [];
    const c = direct.ctx;
    Object.assign(c, {
      requestMissingPermissions: async () => ({ granted: true }),
      RemoteEndpoint: { normalizeWifiAddress: (address) => address },
      createWifiTransport: (address) => address,
      RemoteApi: class {
        setPin() {}
        async capabilities() { requests.push('capabilities'); return boundary === 'capabilities' ? wait.promise : { version: 1 }; }
        async status() { requests.push('status'); return boundary === 'status' ? wait.promise : {}; }
      },
      pinStoreRef: ref({
        get: async () => boundary === 'pin' ? wait.promise : '123456',
        put: async () => { requests.push('save'); return boundary === 'save' ? wait.promise : true; },
      }),
      connectionAttemptRef: ref(0), activeWifiEndpointRef: ref(null), wifiImportOperationRef: ref(0),
      setWifiImportStatus: () => {}, pendingSeekRef: ref(null), pendingVolumeRef: ref(null),
    });
    direct.load('connectDirect');
    const attempt = c.connectDirect(T.Wifi, '192.0.2.1:8899', undefined, undefined, 0);
    // Drain the finite promise chain until it reaches the controlled boundary.
    for (let i = 0; i < 12; i++) await Promise.resolve();
    c.autoReconnectGenerationRef.current++;
    wait.resolve(boundary === 'capabilities' ? { version: 1 } : boundary === 'pin' ? '123456' : true);
    assert.equal(await attempt, false);
    assert.equal(c.apiRef.current, null, `Cancellation during ${boundary} cannot commit a stale session`);
    assert.deepEqual(requests, {
      pin: [], capabilities: ['capabilities'], status: ['capabilities', 'status'],
      save: ['capabilities', 'status', 'save'],
    }[boundary], `Cancellation during ${boundary} stops subsequent native/storage requests`);
  }

  const resetCancelled = harness(T.Bluetooth);
  const reset = deferred();
  resetCancelled.ctx.resetPairingBlock = () => reset.promise;
  const explicit = resetCancelled.ctx.connect();
  resetCancelled.ctx.autoReconnectGenerationRef.current++;
  reset.reject(new Error('Bluetooth unavailable'));
  await explicit;
  assert.equal(resetCancelled.calls.length, 0, 'A late reset failure cannot overwrite a newer choice');

  console.log('Automatic transport recovery, pairing circuit, cancellation and explicit retry passed');
})().catch((err) => { console.error(err); process.exitCode = 1; });
