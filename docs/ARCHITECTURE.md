# System Architecture

Reviewed against source on 2026-11-17. Runtime configuration is documented here;
live deployment and end-to-end media quality require separate validation.

## Overview

The demo uses Vercel for its React/LIFF frontend and serverless APIs, LINE
PlanetKit Web SDK 6.0 for group calls, and Gemini 3.8 Live for AI voice.
Human-to-human calls can run without an AI provider or browser agent service.

## Runtime responsibilities

| Component | Responsibility |
|-----------|----------------|
| Client browser / LINE LIFF | User authentication, meeting UI, participant media and AI controls |
| Vercel | Frontend including `/headless-agent`; `/api/ai-agent-session`, LINE API and PlanetKit callback |
| Render browser service | Docker/Linux runtime; Xvfb, PulseAudio, Selenium and Chrome lifecycle |
| LINE Planet | PlanetKit conference media and participant signaling |
| Gemini 3.8 Live | AI audio input/output over WebSocket |

## AI agent bridge

The AI runs as a separate PlanetKit participant in Chrome on Render. Render
runs a Docker/Linux service: `start-xvfb.sh` starts Xvfb and PulseAudio, then
Supervisor starts `server-selenium.js`. Selenium launches Chrome with the virtual
display; this implementation does not use Chrome's `--headless` mode. The route
name `/headless-agent` describes the unattended agent page, not a Chrome flag.

```text
Client browser (LINE LIFF)
  ├─ WebRTC ↔ LINE Planet conference
  └─ POST /join-as-agent → Render browser service (Docker / Linux)
                             └─ Selenium → Chrome on Xvfb + PulseAudio
                                  └─ Vercel /headless-agent
                                       ├─ WebRTC ↔ same Planet conference
                                       ├─ POST /api/ai-agent-session → Vercel
                                       └─ WebSocket ↔ Gemini 3.8 Live
```

Vercel hosts the frontend and the session API. Render controls the browser
lifecycle. PlanetKit carries conference media between participants; Gemini
provides AI voice responses. The agent page bridges these two media paths.

1. The meeting sends `POST /join-as-agent` to the Render service.
2. Render returns `202 Accepted` while browser startup continues in the background.
3. Chrome loads `/headless-agent` from `FRONTEND_URL` and joins the PlanetKit room.
4. The page requests provider configuration from Vercel `/api/ai-agent-session`.
5. The page connects to Gemini 3.8 Live over WebSocket and bridges room audio.

A successful control response means the request was accepted. Confirm the AI
participant through PlanetKit `evtPeerListUpdated` and verify two-way audio
separately; HTTP success alone does not establish media readiness.

**Audio pipeline (Gemini):** room audio → `captureStream()` → AudioWorklet →
PCM16 at 16 kHz → Gemini WebSocket → 24 kHz response playback →
`MediaStreamDestination` → `setCustomMediaStream()` → PlanetKit room.
Listen mode gates AI output while continuing audio input for context.

### Render implementation and repository scope

This public repository includes the frontend/session API and the legacy
`render-service/server-windows.js` Puppeteer alternative. It does **not** include
the Selenium Docker runtime. Connect a compatible existing Render browser service,
or use the [source project's Render implementation](https://github.com/tiger-dreams/viva-connect-test/tree/main/render-service)
as a reference. Its `Dockerfile`, `render.yaml`, `start-xvfb.sh`,
`supervisord.conf`, and `server-selenium.js` define the Render path described here.
Do not deploy this repository's `render-service/` folder as though those files
were included. Review the source service's dependencies and unrelated workloads
before reusing it.

The Windows script remains a legacy alternative; it is not the current Render
setup. Linux is not generally unsupported: the source runtime uses visible Chrome
on Xvfb with PulseAudio.

## Configuration

| Setting | Configure on | Purpose |
|---------|--------------|---------|
| `VITE_RENDER_SERVICE_URL` | Frontend build / Vercel | HTTPS URL of the Render browser service for meeting controls |
| `FRONTEND_URL` | Render | Vercel origin used to load `/headless-agent` |
| `GEMINI_API_KEY` | Vercel server environment | Read by `/api/ai-agent-session` for Gemini 3.8 Live configuration |
| `OPENAI_API_KEY` | Vercel server environment, optional | Alternative provider configuration |

The current session API returns the Gemini API key to its browser caller. Keeping
it in a Vercel environment variable does not make it server-only during a session.
Review session access and credential handling before exposing this demo publicly.

## Source map

| Source | Role |
|--------|------|
| `src/components/PlanetKitMeetingArea.tsx` | Meeting controls and participant events |
| `src/pages/HeadlessAgentPage.tsx` | Agent conference participant and media bridge |
| `src/services/ai-agent-service.ts` | Provider orchestration and audio routing |
| `src/services/providers/gemini-provider.ts` | Gemini WebSocket protocol |
| `api/ai-agent-session.ts` | Vercel provider session configuration |
| `render-service/server-windows.js` | Bundled legacy Windows alternative |

See the [Render component diagram](architecture-ai-agent-windows-vm.puml).
Its historical filename is retained for compatibility.

## Vercel API endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/ai-agent-session` | Provider WebSocket configuration |
| `/api/line` | LINE token, follower and invitation actions |
| `/api/planetkit-callback` | PlanetKit group-call events |

## Security and verification

The demo generates PlanetKit JWTs in the client. Move token issuance and PlanetKit
secrets to an application server for production. Vite variables are embedded in
the frontend build; do not use a `VITE_` variable for provider API keys.

Check the browser service's health, invite the AI, observe its PlanetKit peer,
and verify media in both directions. A health check, session configuration
response or accepted invitation does not demonstrate a working audio bridge.
