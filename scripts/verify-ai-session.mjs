import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../api/ai-agent-session.ts', import.meta.url), 'utf8');
const code = ts.transpile(source, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });

async function session(env, body) {
  const module = { exports: {} };
  const context = vm.createContext({ exports: module.exports, module, process: { env }, console: { log() {}, error() {} } });
  vm.runInContext(code, context);
  let status;
  let data;
  const response = {
    setHeader() {},
    status(value) { status = value; return this; },
    json(value) { data = JSON.parse(JSON.stringify(value)); return this; },
  };
  await module.exports.default({ method: 'POST', body }, response);
  return { status, data };
}

test('Gemini session selects stable 3.8 Live and retains 16kHz audio and selected voice', async () => {
  const { status, data } = await session({ GEMINI_API_KEY: 'fake-test-key' }, {
    provider: 'gemini', voice: 'Leda', language: 'th', systemPrompt: 'Speak Thai in this demo.',
  });
  assert.equal(status, 200);
  assert.equal(data.mockMode, false);
  assert.equal(data.model, 'models/gemini-3.8-live');
  assert.match(data.wsEndpoint, /v1beta\.GenerativeService\.BidiGenerateContent$/);
  assert.equal(data.config.sampleRate, 16000);
  assert.deepEqual(data.config.responseModalities, ['AUDIO']);
  assert.equal(data.config.voice, 'Leda');
  assert.equal(data.config.language, 'th');
  assert.equal(data.config.systemPrompt, 'Speak Thai in this demo.');
});

test('missing Gemini key keeps explicit mock behavior', async () => {
  const { status, data } = await session({}, { provider: 'gemini' });
  assert.equal(status, 200);
  assert.equal(data.mockMode, true);
  assert.equal(data.apiKey, undefined);
});

test('changing Gemini model preserves OpenAI provider selection', async () => {
  const { data } = await session({ OPENAI_API_KEY: 'fake-openai-key' }, { provider: 'openai' });
  assert.equal(data.provider, 'openai');
  assert.match(data.wsEndpoint, /^wss:\/\/api\.openai\.com\//);
});

test('model setup rejection reaches callers instead of reporting a ready AI agent', async () => {
  const serviceSource = readFileSync(new URL('../src/services/ai-agent-service.ts', import.meta.url), 'utf8');
  const serviceCode = ts.transpile(serviceSource, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
  let cleaned = false;
  class RejectedProvider {
    setCallbacks() {}
    async connect() { throw new Error('Model not available for this project'); }
    disconnect() { cleaned = true; }
  }
  const module = { exports: {} };
  const context = vm.createContext({
    exports: module.exports, module,
    require: name => {
      if (name.includes('gemini-provider')) return { GeminiProvider: RejectedProvider };
      if (name.includes('openai-provider')) return { OpenAIProvider: RejectedProvider };
      if (name.includes('ai-provider')) return { PROVIDER_AUDIO_CONFIG: {} };
      throw new Error(`Unexpected import: ${name}`);
    },
    fetch: async () => ({ ok: true, json: async () => ({ provider: 'gemini', mockMode: false }) }),
    console: { log() {}, warn() {}, error() {} },
  });
  vm.runInContext(serviceCode, context);
  const service = new module.exports.AIAgentService();
  await assert.rejects(service.connect({ language: 'en' }), /Model not available/);
  assert.equal(service.getState(), 'error');
  assert.equal(cleaned, true);
});

test('headless model setup failure leaves the room and never signals ready', async () => {
  const headlessSource = readFileSync(new URL('../src/pages/HeadlessAgentPage.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('headless.tsx', headlessSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'initializeAgent') initializer = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(initializer);
  let left = false;
  let closed = false;
  const window = {};
  const context = vm.createContext({
    window,
    roomAudioCleanupRef: { current: null },
    console: { log() {}, error() {}, warn() {} },
    setupAIAgent() {}, joinPlanetKitConference: async () => {},
    setupAudioRouting: async () => { throw new Error('Setup rejected'); },
    setIsConnected: value => assert.equal(value, false),
    conferenceRef: { current: { leaveConference: async () => { left = true; } } },
    audioContextRef: { current: { close: async () => { closed = true; } } },
  });
  await vm.runInContext(ts.transpile(`(${initializer})()`, { target: ts.ScriptTarget.ES2020 }), context);
  assert.equal(window.agentConnected, false);
  assert.equal(left, true);
  assert.equal(closed, true);
});
