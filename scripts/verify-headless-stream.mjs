import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/pages/HeadlessAgentPage.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('headless.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let audioOutput;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleAudioOutput') {
    audioOutput = node.initializer.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(audioOutput, 'Missing headless audio output handler');

const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(setCustomMediaStream) {
  const conferenceRef = { current: { setCustomMediaStream } };
  const stream = {};
  const chunks = [];
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    conferenceRef,
    mediaStreamDestRef: { current: { stream } },
    audioContextRef: { current: {
      state: 'running',
      _playbackNode: { port: { postMessage: message => chunks.push(message.audioChunk) } },
    } },
  });
  const code = ts.transpile(`(${audioOutput});`, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
  const output = vm.runInContext(code, context);
  return { conferenceRef, stream, chunks, output: () => output(new Float32Array([0.1])) };
}

test('headless stream injects once after deferred success while audio keeps flowing', async () => {
  let calls = 0;
  let resolveInjection;
  let injectedStream;
  const run = setup(stream => {
    calls++;
    injectedStream = stream;
    return new Promise(resolve => { resolveInjection = resolve; });
  });
  run.output();
  run.output();
  assert.equal(run.conferenceRef.current._aiStreamInjected, undefined);
  await flush();
  assert.equal(calls, 1);
  assert.equal(injectedStream, run.stream);
  run.output();
  await flush();
  assert.equal(calls, 1, 'Do not reinject while the SDK promise is pending');
  assert.equal(run.chunks.length, 3, 'Pending injection must not block audio buffering');
  assert.equal(run.conferenceRef.current._aiStreamInjected, undefined);
  resolveInjection();
  await flush();
  assert.equal(run.conferenceRef.current._aiStreamInjected, true);
  assert.equal(run.conferenceRef.current._aiStreamInjectionPending, false);
  run.output();
  await flush();
  assert.equal(calls, 1, 'Successful injection is reused for later chunks');
});

for (const failure of ['deferred rejection', 'synchronous throw']) {
  test(`headless stream retries after ${failure}`, async () => {
    let calls = 0;
    let rejectInjection;
    const run = setup(() => {
      calls++;
      if (calls === 1) {
        if (failure === 'synchronous throw') throw new Error('SDK failure');
        return new Promise((resolve, reject) => { rejectInjection = reject; });
      }
      return Promise.resolve();
    });
    run.output();
    await flush();
    if (rejectInjection) {
      run.output();
      await flush();
      assert.equal(calls, 1);
      rejectInjection(new Error('SDK failure'));
      await flush();
    }
    assert.equal(run.conferenceRef.current._aiStreamInjected, undefined);
    assert.equal(run.conferenceRef.current._aiStreamInjectionPending, false);
    run.output();
    await flush();
    assert.equal(calls, 2);
    assert.equal(run.conferenceRef.current._aiStreamInjected, true);
  });
}

test('headless stream completion updates only its originating conference', async () => {
  let resolveInjection;
  const run = setup(() => new Promise(resolve => { resolveInjection = resolve; }));
  run.output();
  await flush();
  const original = run.conferenceRef.current;
  run.conferenceRef.current = {};
  resolveInjection();
  await flush();
  assert.equal(original._aiStreamInjected, true);
  assert.equal(run.conferenceRef.current._aiStreamInjected, undefined);
});
