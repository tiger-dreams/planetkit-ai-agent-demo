# Public reference sync — 2026-11-17

This is a curated public demo, not a mirror of the source application.

## WebPlanetKit 6.0 update

- Pin `@line/planet-kit` to `6.0.0` and the virtual background plugin to
  `2.0.0`, including the lockfile. The plugin's packaged README explicitly
  pairs WebPlanetKit >= 6.0 with plugin ^2.0.0.
- Read initial peer mute state from `PeerInfo.isMicMuted`. Preserve subsequent
  mute/unmute event handling.
- Wait for `waitForVirtualBackgroundReady()` and video source reassignment
  before enabling blur.
- Handle rejected peer video requests, release the pending element and allow
  another request. Ignore stale completion after a peer leaves or is replaced.
- Wait for optional headless AI stream injection to succeed before marking it
  complete, avoid concurrent injections and retry on the next audio chunk if
  injection fails.
- Retain the single `{ active, inactive }` talking-status event argument: both
  actual 6.0 eval and real bundles use that form. The MCP API reference currently
  lists two arguments; blindly applying that signature would break the demo.
- No call parameter changes were needed for the existing shared join helper or
  browser bridge. New SDK features such as Document PiP are not enabled here.

Validation: nine callback/deferred-promise regression tests, TypeScript checking
and production build pass. These are mocked checks, not real account/media tests.

## Comparison

- Source repository: `tiger-dreams/viva-connect-test`, `main` at
  `24aeaa0` (latest remote commit checked on 2026-11-17).
- Public baseline: `tiger-dreams/planetkit-ai-agent-demo`, `32dd720`.
- Source group-call SDK fixes (`e2dbb5b`) and wake-lock behavior (`ce590cc`)
  were missing from the public baseline.

## Earlier 5.6 source sync

- SDK 5.6 `Conference({})` construction, canonical peer IDs, correct
  `removePeerVideo(userId)` argument and talking-status callback shape.
- Shared conference join configuration for service, room, identity and media.
- Reuse the SDK local camera stream before requesting a fallback, resume media
  playback after attachment and video-tile moves, and prevent local-preview
  initialization from discarding peers that joined in the meantime. Stop late
  camera tracks if permission resolves after the user disconnects.
- Keep the screen awake during active calls when supported, release the lock
  on disconnect/unmount and reacquire on visibility changes.
- Guard duplicate AI invitations/detections and reset AI UI state on disconnect.
- SDK delegate corrections in the optional browser bridge and headless agent.
- Type corrections so the public application's TypeScript check can run cleanly.

## Deliberate boundaries

The source also contains unrelated applications, Salesforce/CS workflows,
private deployment configuration and a different SDK 6 headless AI pipeline.
Those source-specific features are not copied into this public demo, even though
its shared SDK dependency is now 6.0. Its optional AI audio pipeline,
provider selection and transcription code are not a full mirror of the source;
AI provider/model availability and actual AI audio were not validated in this sync.
Existing public simplifications and configurable deployment URLs are preserved.

## Patient/clinician group-call coverage

- Human group audio/video uses PlanetKit Conference; AI is optional.
- Each participant needs their own user ID/token and matching environment,
  service and room. Two users and an additional participant are covered by the
  SDK delegate replay checks; the current layout shows up to four tiles.
- Both users currently authenticate through LINE/LIFF. A clinician-only login,
  independent web/native application, booking, room authorization, screen sharing
  and file exchange are not supplied by this example.
- Demo token generation remains client-side. Use Evaluation credentials only;
  production tokens must be generated and authorized on an application server.

## Validation

Run `npm ci`, `npm run test:group`, `npm run typecheck` and `npm run build`.
The group tests simulate room join configuration and replay real component SDK
callbacks for join, repeated peer updates, initial mute state, mute/unmute,
speaking status and leave, plus local-preview and disconnect/camera-permission
races. Deferred-promise checks cover failed video requests and headless AI
stream injection success, retries and concurrent callbacks. They do
not connect to PlanetKit or establish actual media transport.

No real LINE login, two-device audio/video call or customer environment was
exercised during this update. Before relying on the sample, check actual calls
on the target LINE iOS/Android and clinician browser, including camera/microphone
permissions, two-way media, mute/camera controls, leave/rejoin and screen lock.

The existing repository-wide lint command still fails (83 errors, 18 warnings;
baseline: 87 errors, 18 warnings). No new lint error categories were introduced.
Dependency audit reports 26 existing advisories (14 moderate, 12 high); dependency
upgrades other than the two LINE Planet packages were not included in this update.
