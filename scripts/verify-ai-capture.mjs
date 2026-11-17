import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/services/ai-agent-service.ts', import.meta.url), 'utf8');
const code = ts.transpile(source, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
const plain = value => JSON.parse(JSON.stringify(value));

function makeStream() {
  const track = { enabled: true, muted: false, readyState: 'live', stopCalls: 0,
    stop() { this.stopCalls++; this.readyState = 'ended'; } };
  return { track, getAudioTracks: () => [track], getTracks: () => [track] };
}

function setup({ initialState = 'running', resume = 'running', actualSampleRate = 16000 } = {}) {
  const contexts = [], worklets = [], providers = [], micStreams = [], events = [], revokedUrls = [];
  const blobs = new Map();
  let Processor;
  class AudioContext {
    constructor() {
      this.state = initialState;
      this.sampleRate = actualSampleRate;
      this.destination = {};
      this.sources = [];
      this.resumeCalls = 0;
      this.closeCalls = 0;
      this.audioWorklet = { addModule: async url => {
        const workletContext = vm.createContext({
          AudioWorkletProcessor: class { constructor() { this.port = {}; } },
          registerProcessor: (_name, value) => { Processor = value; },
        });
        vm.runInContext(await blobs.get(url).text(), workletContext);
      } };
      contexts.push(this);
    }
    async resume() {
      this.resumeCalls++;
      events.push('resume');
      if (resume === 'reject') throw new Error('Audio resume denied');
      this.state = resume;
    }
    createMediaStreamSource(stream) {
      const node = { stream, connections: [], disconnectCalls: 0,
        connect(target) { this.connections.push(target); },
        disconnect() { this.disconnectCalls++; this.connections = []; } };
      this.sources.push(node);
      return node;
    }
    async close() { this.closeCalls++; this.state = 'closed'; }
  }
  class AudioWorkletNode {
    constructor() {
      this.port = {};
      this.disconnectCalls = 0;
      this.processor = new Processor();
      this.processor.port.postMessage = data => this.port.onmessage?.({ data });
      worklets.push(this);
    }
    connect() {}
    disconnect() { this.disconnectCalls++; }
    frame(amplitude) {
      // Run the actual inline processor through eight 128-sample render quanta.
      for (let i = 0; i < 8; i++) this.processor.process([[new Float32Array(128).fill(amplitude)]]);
    }
  }
  class Provider {
    constructor() { this.state = 'idle'; this.sent = []; this.greetings = 0; this.disconnectCalls = 0; this.cancelCalls = 0; providers.push(this); }
    setCallbacks(callbacks) { this.callbacks = callbacks; }
    async connect() { this.state = 'connected'; }
    getState() { return this.state; }
    sendAudio(buffer) { this.sent.push(Array.from(new Int16Array(buffer))); }
    sendInitialGreeting() { events.push('greeting'); this.greetings++; }
    disconnect() { this.disconnectCalls++; this.state = 'disconnected'; }
    cancelCurrentResponse() { this.cancelCalls++; }
  }
  const module = { exports: {} };
  const context = vm.createContext({
    exports: module.exports, module,
    require: name => {
      if (name.includes('gemini-provider')) return { GeminiProvider: Provider };
      if (name.includes('openai-provider')) return { OpenAIProvider: Provider };
      if (name.includes('ai-provider')) return { PROVIDER_AUDIO_CONFIG: { gemini: { inputSampleRate: 16000 } } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    fetch: async () => ({ ok: true, json: async () => ({ provider: 'gemini', mockMode: false }) }),
    navigator: { mediaDevices: { getUserMedia: async () => {
      const stream = makeStream(); micStreams.push(stream); return stream;
    } } },
    AudioContext, AudioWorkletNode, Blob,
    URL: {
      createObjectURL(blob) { const url = `blob:test-${blobs.size}`; blobs.set(url, blob); return url; },
      revokeObjectURL(url) { revokedUrls.push(url); },
    },
    console: { log() {}, warn() {}, error() {} },
  });
  vm.runInContext(code, context);
  const service = new module.exports.AIAgentService();
  return { service, contexts, worklets, providers, micStreams, events, revokedUrls,
    connect: (config = {}) => service.connect({ language: 'en', ...config }),
    frame: amplitude => worklets.at(-1).frame(amplitude) };
}

test('capture forwards speech, trailing silence and subsequent speech through the actual PCM worklet', async () => {
  const run = setup();
  await run.connect();
  run.frame(0.5);
  for (let i = 0; i < 16; i++) run.frame(0);
  run.frame(-0.5);
  const sent = run.providers[0].sent;
  assert.equal(sent.length, 18, 'Server VAD must receive the full silent interval');
  assert.ok(sent[0].every(sample => sample === 16383));
  assert.ok(sent.slice(1, -1).every(frame => frame.every(sample => sample === 0)));
  assert.ok(sent.at(-1).every(sample => sample === -16384));
  const diagnostics = run.service.getDiagnostics();
  assert.equal(diagnostics.capturedAudioFrames, 18);
  assert.equal(diagnostics.speechAudioFrames, 2);
  assert.equal(diagnostics.forwardedAudioFrames, 18);
  assert.equal(diagnostics.actualInputSampleRate, 16000);
  assert.equal(diagnostics.audioContextState, 'running');
  assert.equal(diagnostics.audioInput, 'microphone');
  assert.equal(run.micStreams.length, 1);
  run.service.disconnect();
});

test('suspended input context resumes before greeting and reports its actual sample rate', async () => {
  const run = setup({ initialState: 'suspended', actualSampleRate: 48000 });
  await run.connect();
  assert.deepEqual(run.events, ['resume', 'greeting']);
  assert.equal(run.contexts[0].resumeCalls, 1);
  assert.equal(run.service.getDiagnostics().audioContextState, 'running');
  assert.equal(run.service.getDiagnostics().actualInputSampleRate, 48000);
  run.service.disconnect();
});

for (const resume of ['reject', 'suspended']) {
  test(`input resume ${resume} rejects startup, cleans resources and never greets`, async () => {
    const run = setup({ initialState: 'suspended', resume });
    await assert.rejects(run.connect(), /resume denied|Audio input context is not running/);
    assert.equal(run.service.getState(), 'error');
    assert.equal(run.providers[0].greetings, 0);
    assert.equal(run.providers[0].disconnectCalls, 1);
    assert.equal(run.contexts[0].closeCalls, 1);
    assert.equal(run.micStreams[0].track.stopCalls, 1);
    assert.equal(run.service.getDiagnostics().hasMicStream, false);
    assert.equal(run.service.getDiagnostics().audioContextState, 'none');
    assert.equal(run.worklets.length, 0);
  });
}

test('muting suppresses both speech and silence; unmuting restores forwarding', async () => {
  const run = setup();
  await run.connect();
  run.frame(0.5);
  run.service.setMute(true);
  assert.equal(run.micStreams[0].track.enabled, false);
  run.frame(0.5); run.frame(0);
  assert.equal(run.providers[0].sent.length, 1);
  run.service.setMute(false);
  assert.equal(run.micStreams[0].track.enabled, true);
  run.frame(0.5);
  const diagnostics = run.service.getDiagnostics();
  assert.equal(diagnostics.capturedAudioFrames, 4);
  assert.equal(diagnostics.speechAudioFrames, 2);
  assert.equal(diagnostics.forwardedAudioFrames, 2);
  run.service.disconnect();
});

test('silence resets the local barge-in debounce while still reaching the provider', async () => {
  const run = setup();
  await run.connect();
  run.providers[0].state = 'speaking';
  run.frame(0.5); run.frame(0.5); run.frame(0); run.frame(0.5);
  assert.equal(run.providers[0].cancelCalls, 0);
  run.frame(0.5); run.frame(0.5);
  assert.equal(run.providers[0].cancelCalls, 1);
  assert.equal(run.providers[0].sent.length, 6);
  run.service.disconnect();
});

test('reconnecting resets capture counters and barge-in debounce and detaches the old worklet', async () => {
  const run = setup();
  await run.connect();
  run.providers[0].state = 'speaking';
  run.frame(0.5); run.frame(0.5);
  const oldWorklet = run.worklets[0];
  run.service.disconnect();
  assert.equal(oldWorklet.port.onmessage, null);
  assert.equal(oldWorklet.disconnectCalls, 1);
  assert.equal(run.contexts[0].closeCalls, 1);
  assert.equal(run.micStreams[0].track.stopCalls, 1);
  await run.connect();
  const diagnostics = run.service.getDiagnostics();
  assert.equal(diagnostics.capturedAudioFrames, 0);
  assert.equal(diagnostics.speechAudioFrames, 0);
  assert.equal(diagnostics.forwardedAudioFrames, 0);
  oldWorklet.frame(0.5);
  assert.equal(run.service.getDiagnostics().capturedAudioFrames, 0);
  run.providers[1].state = 'speaking';
  run.frame(0.5);
  assert.equal(run.providers[1].cancelCalls, 0);
  assert.equal(run.service.getDiagnostics().forwardedAudioFrames, 1);
  run.service.disconnect();
});

test('room source replacement, null and cleanup detach nodes without stopping SDK tracks', async () => {
  const run = setup();
  const first = makeStream(), second = makeStream();
  run.service.setRoomAudioSource(first);
  assert.equal(run.service.getDiagnostics().hasRoomAudioSource, false);
  await run.connect();
  const firstSource = run.contexts[0].sources.find(node => node.stream === first);
  assert.ok(firstSource, 'A room stream queued before startup must connect once capture is ready');
  assert.equal(run.service.getDiagnostics().hasRoomAudioSource, true);
  assert.deepEqual(plain(run.service.getDiagnostics().roomAudioTracks), [{ enabled: true, muted: false, readyState: 'live' }]);
  // The SDK can replace a track on the same MediaStream object.
  const replacementTrack = makeStream().track;
  first.getAudioTracks = () => [replacementTrack];
  run.service.setRoomAudioSource(first);
  assert.equal(firstSource.disconnectCalls, 1);
  const reboundSource = run.contexts[0].sources.at(-1);
  assert.notEqual(reboundSource, firstSource);
  run.service.setRoomAudioSource(second);
  assert.equal(reboundSource.disconnectCalls, 1);
  const secondSource = run.contexts[0].sources.find(node => node.stream === second);
  assert.equal(secondSource.connections.length, 1);
  run.service.setRoomAudioSource(null);
  assert.equal(secondSource.disconnectCalls, 1);
  assert.equal(run.service.getDiagnostics().hasRoomAudioSource, false);
  assert.deepEqual(plain(run.service.getDiagnostics().roomAudioTracks), []);
  run.service.setRoomAudioSource(first);
  const finalSource = run.contexts[0].sources.at(-1);
  run.service.disconnect();
  assert.equal(finalSource.disconnectCalls, 1);
  assert.equal(first.track.stopCalls, 0);
  assert.equal(second.track.stopCalls, 0);
  assert.equal(replacementTrack.stopCalls, 0);
  await run.connect();
  assert.equal(run.service.getDiagnostics().hasRoomAudioSource, false);
  assert.deepEqual(plain(run.service.getDiagnostics().roomAudioTracks), []);
  run.service.disconnect();
});


test('room-only capture skips the microphone and attaches pending SDK audio without stopping its tracks', async () => {
  const run = setup();
  const room = makeStream();
  run.service.setRoomAudioSource(room);
  await run.connect({ audioInput: 'room' });
  assert.equal(run.micStreams.length, 0, 'Room mode must never request a real or fake browser microphone');
  const diagnostics = run.service.getDiagnostics();
  assert.equal(diagnostics.audioInput, 'room');
  assert.equal(diagnostics.hasMicStream, false);
  assert.equal(diagnostics.hasRoomAudioSource, true);
  assert.equal(run.contexts[0].sources.length, 1);
  assert.equal(run.contexts[0].sources[0].stream, room);
  run.frame(0.5); run.frame(0);
  assert.equal(run.providers[0].sent.length, 2);
  run.service.disconnect();
  assert.equal(run.contexts[0].sources[0].disconnectCalls, 1);
  assert.equal(room.track.stopCalls, 0);
  await run.connect();
  assert.equal(run.service.getDiagnostics().audioInput, 'microphone');
  assert.equal(run.micStreams.length, 1, 'A later default session must still capture its microphone');
  run.service.disconnect();
  assert.equal(run.micStreams[0].track.stopCalls, 1);
  assert.equal(room.track.stopCalls, 0);
});
