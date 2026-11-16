const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports = {}) {
  const source = fs.readFileSync(`${__dirname}/../${file}`, 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(javascript, { module, exports: module.exports, require: (name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  } });
  return module.exports;
}

const availability = load('src/session/transferAvailability.ts');

// Run the hook with controlled requests and explicit renders.
const errors = load('src/ui/transfer/sdBrowserError.ts', {
  '../../data/nativeTransferError': load('src/data/nativeTransferError.ts'),
  '../../session/transferAvailability': availability,
});
function browser(api, seed, t = (value) => value, initialShowHidden = false, initialPath = '') {
  const slots = [];
  let cursor = 0;
  let cleanup;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useCallback: (fn) => fn,
    useEffect: (effect) => { cleanup ??= effect(); },
  };
  const { useSdBrowser } = load('src/ui/transfer/useSdBrowser.ts', {
    react,
    '../../i18n': { useI18n: () => ({ t }) },
    './sdBrowserError': errors,
    '../../session/transferAvailability': availability,
  });
  const render = () => { cursor = 0; return useSdBrowser(api, initialPath, undefined, seed, initialShowHidden); };
  render.unmount = () => cleanup?.();
  return render;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const page = (name) => ({ entries: [{ path: name, name, isDirectory: true, size: 0 }], nextOffset: null });
async function checkBrowser() {
  const requests = [];
  const api = { list: (path, offset) => {
    const request = deferred(); requests.push({ ...request, path, offset }); return request.promise;
  }, mkdir: async () => {} };
  const render = browser(api, { ...page('seed'), loaded: true });
  assert.equal(render().entries[0].name, 'seed');
  assert.equal(render().loaded, false, 'Seed cannot authorize Save here');
  const initial = render().load('');
  assert.equal(render().loaded, false);
  requests[0].resolve({ ...page('root'), nextOffset: 50 }); await initial;
  assert.equal(render().loaded, true);
  const append = render().load('', true);
  assert.equal(requests[1].offset, 50);
  requests[1].reject(new Error('read failed')); await append;
  const retry = render().retry();
  assert.equal(requests[2].offset, 50);
  requests[2].resolve(page('second')); await retry;
  assert.equal(render().entries.length, 2);
  const stale = render().load('old');
  const fresh = render().load('new');
  assert.equal(render().loaded, false);
  assert.equal(render().entries.length, 0);
  requests[4].resolve(page('new')); await fresh;
  requests[3].resolve(page('old')); await stale;
  assert.equal(render().path, 'new');
  assert.equal(render().entries[0].name, 'new');
  render().setEditing({ kind: 'mkdir' }); render().setEditValue('Album');
  const mkdir = render().saveEdit();
  await new Promise(setImmediate);
  assert.equal(requests[5].path, 'new');
  assert.equal(requests[5].offset, 0);
  requests[5].resolve(page('Album')); await mkdir;
  assert.equal(render().editing, null);
  assert.equal(render().loading, false);
  const missing = render().load('deleted');
  requests[6].reject(Object.assign(new Error('folder_not_found'), { statusCode: 404 })); await missing;
  assert.equal(render().loaded, false);
  assert.equal(render().error, 'Could not read this folder.');
  assert.equal(render().canRetry, true);
  await render().mutate(async () => { throw new Error('Could not delete file.'); });
  assert.equal(render().error, 'Could not delete file.');
  assert.equal(render().canRetry, false, 'A failed delete offers no folder Retry');
  await render().retry();
  assert.equal(requests.length, 7, 'Retry after a failed delete sends nothing');
  const pending = render().load('pending'); render().reset();
  requests[7].resolve(page('late')); await pending;
  assert.equal(render().loaded, false);
  assert.equal(render().entries.length, 0);
  const unmounted = render().load('unmounted'); render.unmount();
  requests[8].resolve(page('late')); await unmounted;
  assert.equal(render().loaded, false);
  const independent = browser(api);
  assert.equal(independent().entries.length, 0);
  console.log('Hook: seed validation, navigation, pagination, Retry, mkdir reload, missing folder, failed delete and reset passed');
}
async function checkHidden() {
  const requests = [];
  const api = { list: (path, offset, showHidden) => {
    const request = deferred(); requests.push({ ...request, path, offset, showHidden }); return request.promise;
  } };
  const render = browser(api);
  const first = render().load('Music');
  requests[0].resolve({ ...page('visible'), nextOffset: 50 }); await first;
  const old = render().load('Music', true);
  const toggled = render().toggleHidden();
  assert.equal(requests[1].offset, 50);
  assert.equal(requests[2].offset, 0);
  assert.equal(requests[2].path, 'Music');
  assert.equal(requests[2].showHidden, true);
  assert.equal(render().entries.length, 0);
  requests[2].resolve(page('.hidden')); await toggled;
  requests[1].resolve(page('stale')); await old;
  assert.equal(render().entries[0].name, '.hidden');
  const off = render().toggleHidden();
  assert.equal(requests[3].showHidden, false);
  assert.equal(requests[3].offset, 0);
  requests[3].resolve(page('visible')); await off;

  // Execute the picker with its own hook and the screen's opening props.
  const screen = fs.readFileSync(`${__dirname}/../src/ui/screens/TransferScreen.tsx`, 'utf8');
  assert.match(screen, /initialShowHidden=\{sd.showHidden\}/);
  const source = fs.readFileSync(`${__dirname}/../src/ui/sheets/TransferDestinationSheet.tsx`, 'utf8');
  const body = source.slice(source.indexOf('function DestinationBrowser'), source.indexOf('const styles'));
  for (const choice of [true, false]) {
    let picker;
    const effects = [];
    const context = {
      React: { createElement: () => null }, styles: {},
      useI18n: () => ({ t: (text) => text }), useRef: (current) => ({ current }),
      useEffect: (effect) => effects.push(effect),
      useSdBrowser: (transfer, path, failure, seed, hidden) => {
        picker = browser(transfer, seed, undefined, hidden, path);
        return picker();
      },
      SheetStepTitle: () => null, AppText: () => null, SdBrowserView: () => null, View: () => null, Button: () => null,
      props: { visible: true, available: true, initialPath: '.destination', initialShowHidden: choice, transfer: api },
    };
    vm.runInNewContext(ts.transpileModule(`${body}\nDestinationBrowser(props);`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
    }).outputText, context);
    effects[0]();
    const request = requests.at(-1);
    assert.equal(request.showHidden, choice);
    assert.equal(request.path, '.destination');
    assert.equal(request.offset, 0);
    request.resolve(page('.child')); await new Promise(setImmediate);
    assert.equal(picker().showHidden, choice);
    assert.equal(render().showHidden, false, 'Picker does not change the screen');
  }
  console.log('Hidden files: page-zero reload, stale response rejection, independent picker opening choice passed');
}

async function checkRemoteHidden() {
  const { RemoteApi } = load('src/data/RemoteApi.ts', {
    './redirectGuard': {}, './cryptoUtils': {}, './dacMode': {}, './SettingsApi': {}, './PluginsApi': {}, './HttpTransport': {},
  });
  const api = new RemoteApi({});
  const queries = [];
  api.jsonGet = async (path, params) => {
    queries.push(params);
    return { path: '', entries: [], offset: 0, total: 0, next_offset: null };
  };
  for (const choice of [undefined, false, true]) await api.importFiles('', 0, 50, choice);
  assert.equal(queries[0].some(([key]) => key === 'show_hidden'), false);
  assert.equal(queries[1].some(([key]) => key === 'show_hidden'), false);
  assert.equal(queries[2].find(([key]) => key === 'show_hidden')[1], '1');
  api.send = async (method, path) => ({ statusCode: path.endsWith('mkdir') ? 201 : 200 });
  await api.renameImportFile('.old', '.new');
  await api.createImportDirectory('.parent', '.child');
  for (const name of ['.', '..', 'bad/name']) {
    await assert.rejects(api.renameImportFile('.old', name), /Enter a valid file name/);
    await assert.rejects(api.createImportDirectory('', name), /Enter a valid file name/);
  }
  assert.equal(errors.sdBrowserError(new Error('Enter a valid file name'), (key) => `translated:${key}`), 'translated:Enter a valid file name');
  console.log('Remote API: hidden query opt-in and hidden rename/mkdir validation passed');
}

async function checkUpload(outcome) {
  const source = fs.readFileSync(`${__dirname}/../src/ui/screens/TransferScreen.tsx`, 'utf8');
  const body = source.slice(source.indexOf('  const upload = async'), source.indexOf('  // The app may not have noticed'));
  const reads = [];
  let uploads = 0;
  const controller = { current: null };
  const api = {
    status: { state: 'ready' }, mkdir: async () => assert.equal(reads.length, 0),
    upload: async () => {
      assert.equal(reads.length, 0, 'No listings between files');
      uploads++;
      if (uploads === 2 && outcome !== 'finished') {
        if (outcome === 'cancelled') controller.current.abort();
        throw new Error('Upload interrupted');
      }
    },
  };
  const noop = () => {};
  const context = {
    AbortController, Date, Error, Map, uploadControllerRef: controller, phoneHiddenRef: { current: false },
    uploading: false, ready: true, connected: true, selected: new Map([['phone', {}]]),
    transferRef: { current: api }, aliveRef: { current: true }, MAX_FILE_BYTES: Infinity, PROGRESS_INTERVAL_MS: 150,
    collectLocalFiles: async () => Array.from({ length: 3 }, (_, i) => ({ path: String(i), name: String(i), relativeDir: 'Album', size: 1 })),
    planTransfer: load('src/session/transferPlan.ts').planTransfer, localFileUri: (path) => path,
    isConnectionError: () => false, localizedMessage: (text) => text, t: (text) => text,
    setChoosingDestination: noop, setError: noop, setNotice: noop, setPreparing: noop,
    setJob: noop, setSelected: noop, setUploadedSinceFinish: noop, setPane: noop,
    loadSd: (path) => { assert.equal(controller.current, null); reads.push(path); },
  };
  await vm.runInNewContext(ts.transpileModule(`${body}\nupload('Music');`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  assert.equal(uploads, outcome === 'finished' ? 3 : 2);
  assert.deepEqual(reads, ['Music']);
}
(async () => {
  await checkBrowser();
  await checkHidden();
  await checkRemoteHidden();
  for (const outcome of ['finished', 'failed', 'cancelled']) await checkUpload(outcome);
  console.log('Upload: one destination reload after completion, failure or cancellation; no per-file reloads');
})().catch((error) => { console.error(error); process.exitCode = 1; });
