import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function setup() {
  const source = readFileSync(new URL('../src/utils/room-audio-input.ts', import.meta.url), 'utf8');
  const code = ts.transpile(source, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
  class MediaStream {
    tracks = [];
    getAudioTracks() { return this.tracks; }
  }
  const listeners = new Map();
  const timers = new Set();
  const element = {
    srcObject: null,
    addEventListener(event, callback) { listeners.set(event, callback); },
    removeEventListener(event, callback) { if (listeners.get(event) === callback) listeners.delete(event); },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, MediaStream,
    setInterval(callback) { timers.add(callback); return callback; },
    clearInterval(callback) { timers.delete(callback); },
    console: { warn() {} },
  });
  const calls = [];
  const dispose = module.exports.watchRoomAudioInput(element, stream => calls.push(stream));
  const tick = () => [...timers].forEach(callback => callback());
  const track = () => ({ readyState: 'live', stop() { assert.fail('SDK tracks must not be stopped'); } });
  return { element, calls, dispose, timers, listeners, tick, MediaStream, track };
}

test('connects room audio when the SDK attaches a stream after conference connection', () => {
  const run = setup();
  run.tick();
  assert.equal(run.calls.length, 0);
  const stream = new run.MediaStream();
  run.element.srcObject = stream;
  run.tick();
  assert.equal(run.calls.length, 0, 'Do not connect an empty stream');
  stream.tracks = [run.track()];
  run.tick();
  assert.deepEqual(run.calls, [stream]);
  run.tick();
  run.listeners.get('playing')();
  assert.equal(run.calls.length, 1, 'Repeated events must not mix the same input twice');
  run.dispose();
});

test('rebinds a replacement track on the same stream and detaches an ended track', () => {
  const run = setup();
  const stream = new run.MediaStream();
  stream.tracks = [run.track()];
  run.element.srcObject = stream;
  run.tick();
  stream.tracks = [run.track()];
  run.tick();
  assert.deepEqual(run.calls, [stream, null, stream]);
  stream.tracks[0].readyState = 'ended';
  run.tick();
  assert.equal(run.calls.at(-1), null);
  const replacement = new run.MediaStream();
  replacement.tracks = [run.track()];
  run.element.srcObject = replacement;
  run.tick();
  assert.equal(run.calls.at(-1), replacement);
  run.dispose();
});

test('reuses an initially empty captureStream until its audio track is ready', () => {
  const run = setup();
  const captured = new run.MediaStream();
  let captureCalls = 0;
  run.element.captureStream = () => { captureCalls++; return captured; };
  run.tick();
  run.tick();
  assert.equal(captureCalls, 1);
  assert.equal(run.calls.length, 0);
  captured.tracks = [run.track()];
  run.tick();
  assert.deepEqual(run.calls, [captured]);
  run.dispose();
});

test('dispose cancels retries and detaches input without stopping room tracks', () => {
  const run = setup();
  const stream = new run.MediaStream();
  stream.tracks = [run.track()];
  run.element.srcObject = stream;
  run.tick();
  const lateEvent = run.listeners.get('loadedmetadata');
  run.dispose();
  assert.equal(run.calls.at(-1), null);
  assert.equal(run.timers.size, 0);
  assert.equal(run.listeners.size, 0);
  const count = run.calls.length;
  lateEvent();
  run.tick();
  assert.equal(run.calls.length, count);
  assert.equal(stream.tracks[0].readyState, 'live');
});
