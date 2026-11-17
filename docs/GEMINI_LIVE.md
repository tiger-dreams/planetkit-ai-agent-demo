# Gemini 3.8 Live migration

Updated: 2026-11-17.

The session API now selects `models/gemini-3.8-live` instead of
`models/gemini-2.5-flash-native-audio-latest`. Deploy the API and frontend from
the same revision, then reload any already-open agent browser pages so they use
the updated provider. Existing sessions keep their previous configuration.

The existing Vercel `GEMINI_API_KEY` remains the credential source. No new key or
billing setting is required by this code change. Model availability and quota
still depend on that key's project. The app does not enable paid billing.

## Live protocol

- Keep the `v1beta` BidiGenerateContent WebSocket endpoint, 16kHz PCM input,
  24kHz PCM output and `AUDIO` response modality.
- Wait for `setupComplete` before starting microphone capture or greeting.
  Reject setup errors, early socket closure and handshake timeout. Failed
  headless startup releases the conference/audio resources and does not signal
  readiness to the runner.
- Enable output audio transcription and read the dedicated
  `serverContent.outputTranscription` event. Model thought/text parts are not
  treated as spoken transcripts.
- Omit thinking configuration, affective-dialog configuration and any attempt
  to disable proactive audio. These are incompatible with the default 3.8 Live
  model. No search tools, video input or Extended Thinking are enabled here.

## Published prices

USD per million tokens, standard paid Gemini Developer API pricing:

| Token type | 2.5 Flash Native Audio | 3.8 Live |
| --- | ---: | ---: |
| Audio input | $3.00 | $3.00 |
| Audio output | $12.00 | $12.00 |
| Text input | $0.50 | $0.75 |
| Text output | $2.00 | $4.50 |

Both model sections list free-tier input/output as free of charge, subject to
project-specific quota. Equal audio token rates do not guarantee equal session
cost: token usage, prompts, transcripts and conversation context can differ.
This update does not inspect the account's actual tier, quota or billing usage.

Free-tier data handling and existing client API-key exposure still need to be
considered before using real customer data. This migration does not implement
the separate authentication and ephemeral-token improvements.

## Audio input and troubleshooting

The unattended agent uses the PlanetKit room stream as its only audio input.
It does not request the runner's microphone, which can be a synthetic device.
Interactive AI pages keep microphone input as the default. Room audio may attach
after conference connection; the agent waits for a live track and follows track
replacement without stopping tracks owned by PlanetKit.

PCM input includes silent frames. Gemini's automatic voice-activity detection
needs the audio between words and after speech to determine a turn boundary.
The local RMS threshold is used for barge-in detection, not to drop PCM frames.
The input AudioContext must reach `running` before startup succeeds.

In viva-connect-test, the existing Render `POST /agent-status` endpoint with
`includeDiagnostics: true` exposes the agent's `service` diagnostics during an
active call. Check `audioInput`, `hasRoomAudioSource`, `roomAudioTracks`,
`audioContextState`, `actualInputSampleRate`, `capturedAudioFrames`,
`speechAudioFrames` and `forwardedAudioFrames`. Compare successive snapshots:
no captured frames suggests a capture/track problem; captured frames with no
speech suggests a muted or silent source. Forwarded frames only establish that
the local provider send method was called, not that Gemini recognized speech.
These diagnostics contain states and counters rather than recorded audio.

A greeting is triggered by text and does not validate user audio capture.
An agent-ready log, HTTP 202 or model setup acknowledgment is also insufficient
to prove two-way conversation. Confirm a second spoken answer after a user
utterance before treating a live test as passed.

## Verification

Run `npm run test:ai`, `npm run test:group`, `npm run typecheck` and
`npm run build`. The API/provider/capture/room-source
tests use mocked WebSockets and Web Audio objects, including execution of the
actual PCM worklet. They cover speech followed by silence and another utterance,
input-context startup, mute/unmute, resource cleanup, delayed room tracks and
track replacement. They do not establish live model access or real two-way
audio. After deployment, use a short synthetic conversation to verify a greeting,
a spoken question, a second answer, interruption and listen/respond switching.

## Sources

- [Model and migration rules](https://aistudio.google.com/docs/models/gemini-3.8-live)
- [WebSocket guide](https://aistudio.google.com/docs/live-api/get-started-websocket)
- [3.8 Live pricing](https://aistudio.google.com/docs/pricing#gemini-3.8-live)
- [2.5 Native Audio pricing](https://aistudio.google.com/docs/pricing#gemini-2.5-flash-native-audio)
