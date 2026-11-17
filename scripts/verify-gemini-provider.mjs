import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const config = {
  provider: 'gemini',
  model: 'models/gemini-3.8-live',
  wsEndpoint: 'wss://example.invalid/live',
  apiKey: 'mock-key',
  mockMode: false,
  config: {
    voice: 'Kore', language: 'ko', systemPrompt: 'Test assistant', sampleRate: 16000,
    responseModalities: ['AUDIO'],
  },
};
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup() {
  const sockets = [];
  const timers = new Map();
  let nextTimer = 0;
  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    readyState = MockWebSocket.CONNECTING;
    sent = [];
    closeCalls = 0;
    constructor(url) {
      this.url = url;
      sockets.push(this);
    }
    send(message) { this.sent.push(JSON.parse(message)); }
    close() { this.closeCalls++; this.readyState = MockWebSocket.CLOSED; }
    open() { this.readyState = MockWebSocket.OPEN; this.onopen?.({}); }
    receive(message) { this.onmessage?.({ data: message instanceof Blob ? message : JSON.stringify(message) }); }
    remoteClose(code = 1008, reason = 'Setup rejected') {
      this.readyState = MockWebSocket.CLOSED;
      this.onclose?.({ code, reason });
    }
  }
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    WebSocket: MockWebSocket, Blob, btoa, atob,
    setTimeout: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
  });
  const modules = new Map();
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    const source = readFileSync(new URL(`../src/${path}.ts`, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    });
    const module = { exports: {} };
    const require = id => {
      if (id === './base-provider') return load('services/providers/base-provider');
      if (id === '@/config/ai-agent-languages') return load('config/ai-agent-languages');
      throw new Error(`Unexpected test dependency: ${id}`);
    };
    vm.runInContext(`(function(require, module, exports) { ${outputText}\n})`, context)(require, module, module.exports);
    modules.set(path, module.exports);
    return module.exports;
  }
  const { GeminiProvider } = load('services/providers/gemini-provider');
  const provider = new GeminiProvider();
  const audio = [];
  const transcripts = [];
  const errors = [];
  provider.setCallbacks({
    onAudioOutput: chunk => audio.push(Array.from(chunk)),
    onTranscript: (text, isFinal) => transcripts.push({ text, isFinal }),
    onError: error => errors.push(error),
  });
  const connect = (sessionConfig = config) => {
    const promise = provider.connect(sessionConfig);
    return { promise, socket: sockets.at(-1) };
  };
  return { provider, sockets, timers, connect, audio, transcripts, errors };
}

async function connected(run) {
  const connection = run.connect();
  connection.socket.open();
  connection.socket.receive({ setupComplete: {} });
  await connection.promise;
  return connection.socket;
}

test('connect waits for setupComplete and retains the timeout after transport open', async () => {
  const run = setup();
  const { promise, socket } = run.connect();
  let settled = false;
  promise.then(() => { settled = true; });
  socket.open();
  await flush();
  assert.equal(settled, false);
  assert.equal(run.provider.getState(), 'connecting');
  assert.equal(run.timers.size, 1);
  run.provider.sendAudio(new Int16Array([1]).buffer);
  run.provider.sendTextMessage('too early');
  run.provider.sendInitialGreeting('en');
  assert.equal(socket.sent.length, 1, 'Only setup may be sent before acknowledgment');
  socket.receive({ setupComplete: {} });
  await promise;
  assert.equal(run.provider.getState(), 'connected');
  assert.equal(run.timers.size, 0);
  run.provider.disconnect();
});

test('Gemini 3.8 setup uses AUDIO and output transcription without unsupported options', async () => {
  const run = setup();
  const { promise, socket } = run.connect({
    ...config, config: { ...config.config, responseModalities: ['TEXT', 'AUDIO'] },
  });
  socket.open();
  const { setup: payload } = socket.sent[0];
  assert.equal(payload.model, 'models/gemini-3.8-live');
  assert.deepEqual(payload.generationConfig.responseModalities, ['AUDIO']);
  assert.deepEqual(payload.outputAudioTranscription, {});
  assert.equal(payload.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');
  assert.equal(payload.systemInstruction.parts[0].text, 'Test assistant');
  assert.doesNotMatch(JSON.stringify(payload), /thinking|affective|proactive/i);
  socket.receive({ setupComplete: {} });
  await promise;
  run.provider.disconnect();
});

for (const failure of ['server error', 'transport error', 'early close', 'timeout before open', 'timeout after open', 'disconnect']) {
  test(`pending connect rejects on ${failure} and releases its timer/socket`, async () => {
    const run = setup();
    const { promise, socket } = run.connect();
    const rejection = assert.rejects(promise, /invalid model|connection error|closed before setup|setup timeout|disconnected before setup/i);
    if (failure !== 'timeout before open') socket.open();
    if (failure === 'server error') socket.receive({ error: { code: 400, message: 'invalid model' } });
    if (failure === 'transport error') socket.onerror?.({});
    if (failure === 'early close') socket.remoteClose();
    if (failure.startsWith('timeout')) {
      const timer = [...run.timers.values()][0];
      assert.equal(timer.delay, 15000);
      timer.callback();
    }
    if (failure === 'disconnect') run.provider.disconnect();
    await rejection;
    assert.equal(run.timers.size, 0);
    assert.equal(socket.readyState, 3);
    assert.equal(socket.onopen, null);
    assert.equal(socket.onmessage, null);
    assert.equal(socket.onclose, null);
    assert.equal(socket.onerror, null);
    assert.equal(run.provider.getState(), failure === 'disconnect' || failure === 'early close' ? 'disconnected' : 'error');
    assert.equal(run.errors.length, failure === 'disconnect' ? 0 : 1);
  });
}

test('replacement connect rejects the old attempt and ignores late decoded messages', async () => {
  const run = setup();
  const first = run.connect();
  const rejection = assert.rejects(first.promise, /disconnected before setup/);
  first.socket.open();
  let finishDecode;
  class DelayedBlob extends Blob {
    text() { return new Promise(resolve => { finishDecode = resolve; }); }
  }
  first.socket.receive(new DelayedBlob());
  const oldMessage = first.socket.onmessage;
  const second = run.connect();
  await rejection;
  second.socket.open();
  finishDecode(JSON.stringify({ setupComplete: {} }));
  oldMessage({ data: JSON.stringify({ error: { message: 'late old failure' } }) });
  await flush();
  assert.equal(run.provider.getState(), 'connecting');
  assert.equal(run.timers.size, 1);
  assert.equal(run.errors.length, 0);
  second.socket.receive({ setupComplete: {} });
  await second.promise;
  assert.equal(run.provider.getState(), 'connected');
  run.provider.disconnect();
});

test('audio uses realtimeInput.audio and client content works after setup', async () => {
  const run = setup();
  const socket = await connected(run);
  const samples = new Int16Array([-32768, 0, 16384]);
  run.provider.sendAudio(samples.buffer);
  assert.deepEqual(socket.sent[1], {
    realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: Buffer.from(samples.buffer).toString('base64') } },
  });
  run.provider.sendTextMessage('Remember this');
  run.provider.sendInitialGreeting('en');
  run.provider.sendFarewell('en');
  for (const message of socket.sent.slice(2)) {
    assert.equal(message.clientContent.turns[0].role, 'user');
    assert.equal(message.clientContent.turnComplete, true);
  }
  run.provider.disconnect();
});

test('emits spoken output transcription and PCM audio while ignoring thought text', async () => {
  const run = setup();
  const socket = await connected(run);
  const samples = new Int16Array([-32768, 0, 16384]);
  socket.receive(new Blob([JSON.stringify({ serverContent: {
    modelTurn: { parts: [
      { text: 'internal reasoning', thought: true },
      { text: 'other model text' },
      { inlineData: { mimeType: 'audio/pcm;rate=24000', data: Buffer.from(samples.buffer).toString('base64') } },
    ] },
    outputTranscription: { text: 'Hello there' },
  } })]));
  await flush();
  assert.deepEqual(run.audio, [[-1, 0, 0.5]]);
  assert.deepEqual(run.transcripts, [{ text: 'Hello there', isFinal: false }]);
  assert.equal(run.provider.getState(), 'speaking');
  socket.receive({ serverContent: { outputTranscription: { text: 'Friend' }, turnComplete: true } });
  assert.deepEqual(run.transcripts[1], { text: 'Friend', isFinal: false });
  assert.equal(run.provider.getState(), 'listening');
  run.provider.disconnect();
});

test('listen mode keeps streaming input and suppresses generated audio until respond mode', async () => {
  const run = setup();
  const socket = await connected(run);
  const data = Buffer.from(new Int16Array([1000]).buffer).toString('base64');
  const output = { serverContent: { modelTurn: { parts: [{ inlineData: { data } }] } } };
  run.provider.setMode('listen');
  assert.match(socket.sent.at(-1).clientContent.turns[0].parts[0].text, /LISTEN-ONLY/);
  run.provider.sendAudio(new Int16Array([1000]).buffer);
  assert.ok(socket.sent.at(-1).realtimeInput.audio);
  socket.receive(output);
  assert.equal(run.audio.length, 0);
  run.provider.setMode('respond');
  socket.receive(output);
  assert.equal(run.audio.length, 1);
  socket.remoteClose(1000, 'Done');
  assert.equal(run.provider.getState(), 'disconnected');
  assert.equal(run.errors.length, 0);
});

test('server errors after setup close the session and notify the consumer', async () => {
  const run = setup();
  const socket = await connected(run);
  socket.receive({ error: { message: 'session expired' } });
  assert.equal(run.provider.getState(), 'error');
  assert.deepEqual(run.errors, ['session expired']);
  assert.equal(socket.readyState, 3);
  assert.equal(run.timers.size, 0);
});
