import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/PlanetKitMeetingArea.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('meeting.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const transpile = text => ts.transpile(text, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
function handler(name, context) {
  let found;
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === name) found = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, `Missing SDK delegate ${name}`);
  return vm.runInContext(transpile(`(${found});`), context);
}

const helper = { exports: {} };
vm.runInNewContext(transpile(readFileSync(new URL('../src/utils/planetkit-conference.ts', import.meta.url), 'utf8')), helper);
const build = helper.exports.buildConferenceJoinParams;

test('patient and clinician join the same group service/room with separate identities, without AI', () => {
  const input = { serviceId: 'test-service', roomId: 'consultation-001', roomAudio: {}, myVideo: {}, delegate: {} };
  const patient = build({ ...input, userId: 'patient-001', accessToken: 'patient-token' });
  const doctor = build({ ...input, userId: 'doctor-001', accessToken: 'doctor-token' });
  assert.equal(patient.roomId, doctor.roomId);
  assert.equal(patient.myServiceId, doctor.roomServiceId);
  assert.notEqual(patient.myId, doctor.myId);
  assert.notEqual(patient.accessToken, doctor.accessToken);
  assert.equal(patient.mediaType, 'video');
  assert.equal(patient.cameraOn, true);
  assert.equal(patient.micOn, true);
  assert.equal(patient.mediaHtmlElement.myVideo, input.myVideo);
  assert.equal(patient.mediaHtmlElement.roomAudio, input.roomAudio);
  assert.equal('aiProvider' in patient, false);
});

test('SDK peer event replay deduplicates users, updates speaking, removes departed video by user ID', () => {
  let participants = [{ id: 'patient-001', isLocal: true }];
  const removedVideos = [];
  const requestedVideos = [];
  const context = vm.createContext({
    console: { log() {} },
    config: { userId: 'patient-001', displayName: 'Patient' },
    isVideoOn: true, isAudioOn: true,
    remoteVideoElementsRef: { current: new Map() },
    localVideoRef: { current: {} },
    planetKitConference: {
      requestPeerVideo: value => requestedVideos.push(value),
      removePeerVideo: value => removedVideos.push(value),
    },
    document: { createElement: () => ({ style: {} }) },
    setParticipants: update => { participants = typeof update === 'function' ? update(participants) : update; },
    aiAgentJoinedRef: { current: false },
    setAiAgentJoined() {}, setAiAgentMode() {}, setIsAIAgentInviter() {}, setAiAgentSessionUsed() {}, toast() {}, language: 'en',
  });
  const peers = handler('evtPeerListUpdated', context);
  const doctor = { userId: 'doctor-001', displayName: 'Doctor' };
  const nurse = { userId: 'nurse-001', displayName: 'Nurse' };
  peers({ addedPeers: [doctor], removedPeers: [], totalPeersCount: 1 });
  peers({ addedPeers: [doctor, nurse], removedPeers: [], totalPeersCount: 2 });
  assert.deepEqual(Array.from(participants, p => p.id), ['patient-001', 'doctor-001', 'nurse-001']);
  assert.equal(requestedVideos.length, 2);
  assert.equal(requestedVideos[0].userId, doctor.userId);
  handler('evtPeersTalkingStatusUpdated', context)({ active: [doctor.userId], inactive: [nurse.userId] });
  assert.equal(participants.find(p => p.id === doctor.userId).isSpeaking, true);
  assert.equal(participants.find(p => p.id === nurse.userId).isSpeaking, false);
  peers({ addedPeers: [], removedPeers: [doctor], totalPeersCount: 1 });
  assert.deepEqual(removedVideos, [doctor.userId]);
  assert.equal(participants.some(p => p.id === doctor.userId), false);
});

test('SDK local-preview readiness does not drop a clinician who joined concurrently', async () => {
  let participants = [{ id: 'doctor-001', name: 'Doctor' }];
  let fallbackCalls = 0;
  const stream = { getVideoTracks: () => [{}] };
  const context = vm.createContext({
    console: { log() {}, warn() {} },
    connectionAttemptRef: { current: 1 }, attemptId: 1,
    config: { userId: 'patient-001', displayName: 'Patient' },
    localVideoRef: { current: { srcObject: stream, play: async () => {} } },
    navigator: { mediaDevices: { getUserMedia: async () => { fallbackCalls++; return stream; } } },
    setParticipants: update => { participants = typeof update === 'function' ? update(participants) : update; },
    setConnectionStatus() {}, setConnectionStartTime() {}, Date,
    toast() {}, t: { connectionSuccessTitle: 'Connected', connectionSuccessDescription: '' },
  });
  await handler('evtConnected', context)();
  assert.deepEqual(Array.from(participants, p => p.id), ['patient-001', 'doctor-001']);
  assert.equal(fallbackCalls, 0, 'SDK camera stream must be reused');
});

test('camera permission finishing after disconnect stops late tracks and does not restore participants', async () => {
  let resolveMedia;
  let stopped = false;
  let participantUpdates = 0;
  const attempts = { current: 1 };
  const video = { srcObject: null, play: async () => {} };
  const context = vm.createContext({
    console: { log() {}, warn() {} },
    connectionAttemptRef: attempts, attemptId: 1,
    config: { userId: 'patient-001' }, localVideoRef: { current: video },
    navigator: { mediaDevices: { getUserMedia: () => new Promise(resolve => { resolveMedia = resolve; }) } },
    setParticipants() { participantUpdates++; },
    setConnectionStatus() {}, setConnectionStartTime() {}, Date, toast() {}, t: {},
  });
  const connected = handler('evtConnected', context)();
  attempts.current++; // Disconnect/unmount invalidates this conference attempt.
  resolveMedia({ getVideoTracks: () => [{}], getTracks: () => [{ stop() { stopped = true; } }] });
  await connected;
  assert.equal(stopped, true);
  assert.equal(video.srcObject, null);
  assert.equal(participantUpdates, 0);
});
