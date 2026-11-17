# PlanetKit AI Agent Demo

A mobile-first LINE LIFF video conferencing application with **AI Agent** powered by Google Gemini Live API or OpenAI Realtime API, built on **LINE PlanetKit Web SDK 6.0** with the official Virtual Background plugin.

## Human-to-human group calls (start here)

The standard `/setup` → `/planetkit_meeting` flow uses PlanetKit Conference for
human-to-human audio/video calls. Two participants can use it without inviting
an AI agent. AI provider keys and a browser agent service are only needed for
AI features, not for ordinary group calls.

For a two-person consultation demo:

1. Configure the same Evaluation service, credentials and LIFF app on your deployment.
2. Sign in with two **different LINE accounts**, one for each participant.
3. Open `/setup?room=consultation-demo` on each participant's device (or share the
   LIFF invitation for that room). Join the room, then use the meeting's Connect button.
4. Confirm both participants appear, hear each other and can mute/unmute, turn
   cameras off/on, leave and rejoin. Up to four participant tiles are shown.

The setup page currently requires LINE login **for both participants**, including
when opened in an external browser. A separate clinician application with its
own authentication is not included. To build that experience, implement the
clinician's authentication and issue that user's PlanetKit token on your server;
join the same service, environment and room with a distinct user ID. Room IDs
alone do not provide patient authorization or room access control.

This is an unofficial integration demo, not a completed telemedicine system.
Appointment scheduling, patient/clinician roles and medical-data controls are
application responsibilities. Screen sharing and file transfer are not
implemented in this sample. See [sync and validation notes](docs/SYNC_STATUS.md)
for the current comparison scope and checks.

## Features

- **LINE LIFF Integration** - Seamless LINE authentication and in-app browser support
- **PlanetKit Web SDK 6.0** - HD group video conferencing with WebRTC
- **Virtual Background (Blur)** - One-tap on/off blur via `@line/planet-kit-virtual-background` 2.0.0. Uses the official SDK 6.0 / plugin 2.0 pairing and waits for model initialization before enabling blur. The processed canvas is overlaid onto the local self-tile so the user sees the blur effect on themselves as well as remote peers.
- **Media Statistics Panel** - Live `getCurrentStats()` polling at 2s intervals. Displays the SDK's raw outbound/inbound × audio/video fields (packetsSent/Received, bytesSent/Received, packetsLost, jitter, fps, frameWidth/Height, fir/pli/nackCount, …) without any reinterpretation.
- **AI Agent (Multi-Provider)** - Real-time AI assistant with support for:
  - **Google Gemini 3.8 Live API** - Default provider with 16kHz input audio
  - **OpenAI Realtime API** - Alternative provider with server-side VAD
- **Barge-in Support** - Interrupt AI responses by speaking (auto-cancels AI output)
- **Listen / Respond Mode** - Toggle AI between passive listening and active conversation
- **Agent Call (1-to-1)** - Outbound voice calls via PlanetKit Agent Call API
- **Multi-language Support** - Korean, English, Japanese, Traditional Chinese, Thai
- **Mobile-first UI** - Portrait-optimized adaptive video grid with touch-friendly controls. SDK version is shown at the bottom of the Setup screen for quick verification.

Gemini now uses the stable `gemini-3.8-live` model. See
[migration, pricing and verification notes](docs/GEMINI_LIVE.md) before deployment.

## Architecture Overview

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

See [system architecture](docs/ARCHITECTURE.md) and the
[Render architecture diagram](docs/architecture-ai-agent-windows-vm.puml).
The diagram keeps its historical filename for existing links.

## Prerequisites

Before getting started, you need:

1. **LINE Official Account (OA)** - For LINE Messaging API (push messages, invite links)
   - Create at: https://developers.line.biz/console/
   - Obtain: Channel ID, Channel Secret
2. **LINE LIFF App** - For LINE in-app authentication
   - Create within your LINE Login channel
   - Obtain: LIFF ID
3. **LINE Planet Console Account** - For PlanetKit video/audio SDK
   - Obtain: Service ID, API Key, API Secret
   - Register callback URLs for event notifications
4. **AI Provider API Key** - Optional; only for AI Agent features:
   - **Gemini**: Get API key at https://aistudio.google.com
   - **OpenAI**: Get API key at https://platform.openai.com/api-keys (requires Realtime API access)
5. **Vercel Account** (Free Hobby plan works) - Frontend + serverless API deployment
6. **Render browser service** - Optional; only for AI Agent features. Use a compatible service or adapt the source implementation linked above; its Docker runtime is not bundled here.

## Step-by-Step Setup Guide

### Phase 1: Local Development

```bash
git clone <this-repo>
cd planetkit-ai-agent-demo
npm install
cp .env.example .env    # Fill in your credentials
npm run dev             # Starts on localhost:8080
```

### Phase 2: LINE LIFF Configuration

1. Go to [LINE Developers Console](https://developers.line.biz/console/)
2. Create a LINE Login channel
3. Create a LIFF app within the channel
4. Set `VITE_LIFF_ID` in your `.env`
5. Set LIFF Endpoint URL to `http://localhost:8080` (for local dev)

### Phase 3: PlanetKit Configuration

1. Access LINE Planet Console
2. Create a Service and obtain Service ID, API Key, API Secret
3. Set `VITE_PLANETKIT_EVAL_*` values in your `.env`
4. Test basic video conferencing with two different LINE logins (the current setup requires LIFF authentication)

### Phase 4: Vercel Deployment

1. Push your repo to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Set all environment variables from `.env` in Vercel dashboard
4. Deploy and note your domain (e.g., `your-app.vercel.app`)

### Phase 5: Callback & LIFF Endpoint Registration

Register callback URLs in PlanetKit Console:
- **Group Call**: `https://{domain}/api/planetkit-callback`

Update LIFF Endpoint URL in LINE Developers Console to your Vercel domain.

### Phase 6: Optional AI Agent Setup (Render)

1. Connect a compatible Render browser service, or prepare one from the source
   implementation linked above. This repository alone does not contain its Docker setup.
2. Set Render `FRONTEND_URL=https://your-app.vercel.app`.
3. Set Vercel `VITE_RENDER_SERVICE_URL=https://your-service.onrender.com` and
   rebuild the frontend so Vite includes the URL.
4. Set Vercel `GEMINI_API_KEY` for the default Gemini provider. Set
   `OPENAI_API_KEY` only if using the alternative provider.
5. Check the Render `/health` endpoint, invite the agent, then confirm its
   PlanetKit peer and two-way audio. Render's `202 Accepted` response only
   confirms that startup was scheduled.

| Setting | Configure on | Purpose |
|---------|--------------|---------|
| `VITE_RENDER_SERVICE_URL` | Frontend build / Vercel | HTTPS URL of the Render browser service for meeting controls |
| `FRONTEND_URL` | Render | Vercel origin used to load `/headless-agent` |
| `GEMINI_API_KEY` | Vercel server environment | Read by `/api/ai-agent-session` for Gemini 3.8 Live configuration |
| `OPENAI_API_KEY` | Vercel server environment, optional | Alternative provider configuration |

The current session API returns the Gemini API key to its browser caller. Keeping
it in a Vercel environment variable does not make it server-only during a session.
Review session access and credential handling before exposing this demo publicly.

**Selecting AI Provider:**
When inviting an AI Agent, specify the provider via the `provider` parameter:
- Default: `gemini` (Google Gemini 3.8 Live API)
- Alternative: `openai` (OpenAI Realtime API)

Example API call:
```json
POST /join-as-agent
{
  "roomId": "room-123",
  "userId": "ai-agent",
  "language": "en",
  "voice": "Kore",
  "provider": "openai"
}
```

### Phase 7: End-to-End Test

1. Open LIFF URL in LINE app → join a conference
2. Click "Invite AI Agent" button → AI Agent joins the room
3. Toggle Listen / Respond mode
4. Test multi-language support (ko, en, ja, zh-TW, th)

## Important Notes

### Token Generation

> **This demo generates PlanetKit access tokens client-side (`token-generator.ts`) for convenience. In production, tokens MUST be generated on your App Server.** Exposing API Secret in client-side code is a security risk. See [PlanetKit Documentation](https://docs.lineplanet.me) for server-side token generation guide.

### `mediaHtmlElement` key — `myVideo` (not `localVideo`)

The official [`ConferenceMediaHtmlElement`](https://docs.lineplanet.me/api-reference/client/web/6.0/global.html#ConferenceMediaHtmlElement) typedef defines `myVideo` and `roomAudio`. Using a non-spec key (e.g. `localVideo`) makes the SDK silently ignore it, leaving `srcObject` unset and forcing a fallback `getUserMedia()` in `evtConnected`. On Android LINE WebView this second `getUserMedia()` collides with the SDK's RTC tracks and can drop a peer who has just joined within ~1 second. This repo passes `myVideo` correctly.

### Runtime and validation scope

The current architecture uses Vercel plus a Render Docker browser service. The
bundled Windows/Puppeteer script is a legacy alternative. These instructions
reflect source configuration; they do not establish deployment status or
end-to-end audio/video quality. See [Gemini validation notes](docs/GEMINI_LIVE.md).

## Project Structure

```
planetkit-ai-agent-demo/
├── src/
│   ├── App.tsx                      # Routes
│   ├── components/
│   │   ├── PlanetKitMeetingArea.tsx  # Main conference UI + AI Agent controls
│   │   ├── TileView.tsx             # Adaptive video grid
│   │   ├── PlanetKitConfigPanel.tsx  # SDK configuration panel
│   │   └── ui/                      # shadcn/ui components
│   ├── pages/
│   │   ├── SetupPage.tsx            # Setup wizard with LINE LIFF login
│   │   ├── HeadlessAgentPage.tsx    # Agent page loaded by Render Chrome
│   │   ├── AIAgentBridgeMeeting.tsx # AI Agent management in group calls
│   │   └── ...
│   ├── services/
│   │   ├── ai-agent-service.ts      # Multi-provider AI client orchestrator
│   │   └── providers/
│   │       ├── base-provider.ts     # Abstract base class for AI providers
│   │       ├── gemini-provider.ts   # Gemini 3.8 Live API implementation
│   │       └── openai-provider.ts   # OpenAI Realtime API implementation
│   ├── config/
│   │   └── ai-agent-languages.ts    # Multi-language prompts & voices
│   └── utils/
│       └── token-generator.ts       # PlanetKit JWT (DEMO ONLY)
├── api/                             # Vercel Serverless Functions
│   ├── ai-agent-session.ts          # AI provider WebSocket config
│   ├── line.ts                      # LINE messaging & token
│   └── planetkit-callback.ts        # PlanetKit event callback
├── render-service/
│   ├── server-windows.js            # Legacy Windows/Puppeteer alternative (not Render Docker)
│   └── package.json
└── docs/
    ├── ARCHITECTURE.md
    ├── architecture-ai-agent-windows-vm.puml
    └── userflow-ai-agent-media-flow.puml
```

## API Endpoints (Vercel Serverless Functions)

| Endpoint | Description |
|----------|-------------|
| `/api/ai-agent-session` | Returns AI provider WebSocket config (Gemini or OpenAI) |
| `/api/line` | LINE messaging, token, user list |
| `/api/planetkit-callback` | PlanetKit group call event callback |

## Developer Resources

- [PlanetKit Documentation](https://docs.lineplanet.me)
- [LINE LIFF Documentation](https://developers.line.biz/en/docs/liff/)
- **Gemini:**
  - [Google AI Studio (API Key)](https://aistudio.google.com)
  - [Gemini Multimodal Live API](https://ai.google.dev/gemini-api/docs/multimodal-live)
- **OpenAI:**
  - [OpenAI Platform (API Key)](https://platform.openai.com/api-keys)
  - [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime)

## Tech Stack

- **Frontend**: Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Video SDK**: LINE PlanetKit Web SDK 6.0 + `@line/planet-kit-virtual-background` 2.0.0
- **AI Providers**:
  - Google Gemini 3.8 Live API (WebSocket, 16kHz input)
  - OpenAI Realtime API (WebSocket, 24kHz input, server-side VAD)
- **Auth**: LINE LIFF (LINE Front-end Framework)
- **Backend**: Vercel Serverless Functions + Vercel Postgres
- **AI Agent Runtime**: Render Docker / Selenium / Chrome / Xvfb / PulseAudio (runtime supplied separately; see repository scope above)
