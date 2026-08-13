const test = require('node:test');
const assert = require('node:assert');
const { computeWhisperOutputDirectory } = require('../scripts/after-pack');

// Regression test for a real bug: prepareWhisperRuntime built the runtime
// successfully, electron-builder reported success, and the packaged app
// still couldn't find it — because it was written next to Aside.app instead
// of inside Contents/Resources, which is the only place
// src/whisper-runtime.js's locateWhisperRuntime() actually looks
// (process.resourcesPath resolves inside the bundle on macOS).

test('macOS: writes inside the .app bundle Contents/Resources, not beside it', () => {
  const dir = computeWhisperOutputDirectory('darwin', '/build/dist/mac-arm64', 'Aside');
  assert.strictEqual(dir, '/build/dist/mac-arm64/Aside.app/Contents/Resources/whisper-runtime');
});

test('win32: writes to a sibling resources dir (matches process.resourcesPath there)', () => {
  const dir = computeWhisperOutputDirectory('win32', 'C:\\build\\dist\\win-unpacked', 'Aside');
  assert.match(dir, /resources[\\/]whisper-runtime$/);
  assert.ok(!dir.includes('.app'), 'Windows build must not get a macOS-style .app path');
});

test('linux: writes to a sibling resources dir', () => {
  const dir = computeWhisperOutputDirectory('linux', '/build/dist/linux-unpacked', 'Aside');
  assert.strictEqual(dir, '/build/dist/linux-unpacked/resources/whisper-runtime');
});

test('macOS path uses the actual product filename, not a hardcoded app name', () => {
  const dir = computeWhisperOutputDirectory('darwin', '/build/dist/mac-arm64', 'SomeOtherFork');
  assert.ok(dir.includes('SomeOtherFork.app/'), 'must not hardcode "Aside" — forks/rebrands change productFilename');
});
