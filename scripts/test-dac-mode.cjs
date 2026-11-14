const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(require.resolve('../src/data/dacMode.ts'), 'utf8');
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(javascript, { exports: loaded.exports, module: loaded });
const { parseDacMode, dacModeText, dacDisplayTrack, isDacActive, dacControlsDisabled } = loaded.exports;

for (const mode of ['none', 'bluetooth', 'usb']) {
  assert.equal(parseDacMode(mode, false), mode);
  assert.equal(dacControlsDisabled(mode), mode !== 'none');
}
assert.equal(parseDacMode(undefined, true), 'bluetooth');
assert.equal(parseDacMode(undefined, false), 'none');
const plain = (value) => JSON.parse(JSON.stringify(value));
const mark = (source) => `[${source}]`;
assert.deepEqual(plain(dacModeText('bluetooth', false, (x) => x)), { title: 'Bluetooth DAC', subtitle: 'Waiting for Bluetooth audio' });
assert.deepEqual(plain(dacModeText('bluetooth', true, (x) => x)), { title: 'Bluetooth DAC', subtitle: 'Receiving Bluetooth audio' });
assert.deepEqual(plain(dacModeText('usb', false, (x) => x)), { title: 'USB DAC', subtitle: 'Waiting for USB audio' });
assert.deepEqual(plain(dacModeText('usb', true, (x) => x)), { title: 'USB DAC', subtitle: 'Receiving USB audio' });
assert.deepEqual(plain(dacModeText('usb', true, mark)), { title: '[USB DAC]', subtitle: '[Receiving USB audio]' });
assert.equal(dacModeText('none', true, mark), null);
assert.equal(dacModeText(undefined, true, mark), null);
assert.equal(isDacActive('usb'), true);
assert.equal(isDacActive('none'), false);
assert.equal(isDacActive(undefined), false);

const track = { id: 'now_playing', title: 'Song', artist: 'Artist', album: 'Album', duration: '3:00' };
assert.equal(dacDisplayTrack(track, 'none', true, mark), track);
assert.equal(dacDisplayTrack(track, undefined, true, mark), track);
assert.deepEqual(plain(dacDisplayTrack(track, 'bluetooth', false, mark)), {
  id: 'now_playing', title: '[Bluetooth DAC]', artist: '[Waiting for Bluetooth audio]', album: '', duration: '3:00',
});
assert.equal(dacDisplayTrack({ ...track, title: '' }, 'usb', true, mark).artist, '[Receiving USB audio]');
assert.equal(track.title, 'Song');
console.log('Remote DAC mode mapping and playback-control gating passed');
