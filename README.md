# PlanetKit AI Agent Demo

A mobile-first LINE LIFF video conferencing application with **AI Agent** powered by Google Gemini 2.0 Live API or OpenAI Realtime API, built on **LINE PlanetKit Web SDK 5.5**.

## Features

- **LINE LIFF Integration** - Seamless LINE authentication and in-app browser support
- **PlanetKit Web SDK 5.5** - HD group video conferencing with WebRTC
- **AI Agent (Multi-Provider)** - Real-time AI assistant with support for:
  - **Google Gemini 2.0 Live API** - Default provider with 16kHz input audio
  - **OpenAI Realtime API** - Alternative provider with server-side VAD
- **Barge-in Support** - Interrupt AI responses by speaking (auto-cancels AI output)
- **Listen / Respond Mode** - Toggle AI between passive listening and active conversation
- **Agent Call (1-to-1)** - Outbound voice calls via PlanetKit Agent Call API
- **Multi-language Support** - Korean, English, Japanese, Traditional Chinese, Thai
- **Mobile-first UI** - Portrait-optimized adaptive video grid with touch-friendly controls

## Architecture Overview

```
┌─────────────────────┐     ┌──────────────────────────────────────┐
│  Client Browser      │     │  Windows Azure VM                    │
│  (LINE LIFF)         │     │  (Always-on / PM2)                   │
│                      │     │                                      │
│  ┌────────────────┐  │     │  ┌──────────────┐                    │
│  │ PlanetKit      │  │     │  │ server-      │  POST /join-as-   │
│  │ MeetingArea    │──┼─────┼─>│ windows.js   │  agent            │
│  │                │  │     │  └──────┬───────┘                    │
│  │ [AI Agent      │  │     │         │ puppeteer.launch()         │
│  │  Invite Btn]   │  │     │  ┌──────▼───────────────────────┐   │
│  │ [Listen/       │  │     │  │ Chrome (headless:false)       │   │
│  │  Respond Btn]  │  │     │  │  ┌─────────────────────────┐ │   │
│  └────────┬───────┘  │     │  │  │ HeadlessAgentPage       │ │   │
│           │          │     │  │  │  ┌──────────┐           │ │   │
│           │          │     │  │  │  │AudioWork-│──> Gemini  │ │   │
│           │          │     │  │  │  │let 16kHz │<── 2.0 API │ │   │
└───────────┼──────────┘     │  │  │  └──────────┘           │ │   │
            │ WebRTC         │  │  │  PlanetKit Conference    │ │   │
            │                │  │  └─────────────────────────┘ │   │
            ▼                │  └──────────────────────────────┘   │
┌─────────────────────┐     └──────────────────────────────────────┘
│  LINE Planet Server  │◄── WebRTC ──► AI Agent (same conference)
│  (WebRTC Relay)      │
└─────────────────────┘
```

**Audio Pipeline:**
1. Room participants speak → audio sent via WebRTC to Planet Server
2. AI Agent's Chrome captures room audio via `captureStream()`
3. AudioWorklet encodes to PCM16 (16kHz for Gemini, 24kHz for OpenAI) → sent to AI provider via WebSocket
4. AI provider responds with audio → decoded to Float32 (24kHz) → routed through `MediaStreamDestination`
5. AI voice broadcast to all participants via `setCustomMediaStream()`

**Provider-Specific Features:**
| Feature | Gemini 2.0 | OpenAI Realtime |
|---------|------------|-----------------|
| Input Sample Rate | 16kHz | 24kHz |
| Output Sample Rate | 24kHz | 24kHz |
| VAD (Voice Activity Detection) | Client-side | Server-side |
| Barge-in | State transition | `response.cancel` |
| Turn Detection | Client-managed | Server VAD (threshold: 0.5) |

See [docs/architecture-ai-agent-windows-vm.puml](docs/architecture-ai-agent-windows-vm.puml) and [docs/userflow-ai-agent-media-flow.puml](docs/userflow-ai-agent-media-flow.puml) for detailed diagrams.

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
4. **AI Provider API Key** - For AI Agent (at least one required):
   - **Gemini**: Get API key at https://aistudio.google.com
   - **OpenAI**: Get API key at https://platform.openai.com/api-keys (requires Realtime API access)
5. **Vercel Account** (Free Hobby plan works) - Frontend + serverless API deployment
6. **Windows VM** (Azure or similar) - AI Agent service (requires Chrome browser installed)

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
4. Test basic video conferencing locally (access via browser without LIFF)

### Phase 4: Vercel Deployment

1. Push your repo to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Set all environment variables from `.env` in Vercel dashboard
4. Deploy and note your domain (e.g., `your-app.vercel.app`)

### Phase 5: Callback & LIFF Endpoint Registration

Register callback URLs in PlanetKit Console:
- **Group Call**: `https://{domain}/api/planetkit-callback`

Update LIFF Endpoint URL in LINE Developers Console to your Vercel domain.

### Phase 6: AI Agent Setup (Windows VM)

1. Provision a Windows VM (Azure recommended) and install Chrome browser
2. Install Node.js (v18+)
3. Copy the `render-service/` folder to the VM
4. Install dependencies: `cd render-service && npm install`
5. Set environment variables:
   ```
   FRONTEND_URL=https://your-app.vercel.app
   CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
   PORT=3000
   ```
6. Set AI provider API keys in Vercel (at least one required):
   ```
   GEMINI_API_KEY=your-gemini-api-key     # For Gemini provider (default)
   OPENAI_API_KEY=your-openai-api-key     # For OpenAI provider (optional)
   ```
7. Start the server: `node server-windows.js` (use PM2 for production)
8. Open firewall port 3000
9. Set `VITE_RENDER_SERVICE_URL=http://your-vm-ip:3000` in Vercel env vars

**Selecting AI Provider:**
When inviting an AI Agent, specify the provider via the `provider` parameter:
- Default: `gemini` (Google Gemini 2.0 Live API)
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

### Why Windows VM (not Linux)?

Linux headless Chrome (`headless: true`) breaks Web Audio API — AudioWorklet initialization fails silently. Windows VM with `headless: false` + off-screen positioning (`--window-position=-2000,0`) keeps audio fully functional.

## Reference Implementation

This demo was built and tested with:
- **Vercel** - Frontend hosting + Serverless API (Hobby plan, 6 functions)
- **Azure Windows VM** - AI Agent service (Puppeteer + Chrome)
- **Google AI Studio** - Gemini API key (https://aistudio.google.com)

Adapt to your own infrastructure as needed.

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
│   │   ├── HeadlessAgentPage.tsx    # Runs in Puppeteer on Windows VM
│   │   ├── AIAgentBridgeMeeting.tsx # AI Agent management in group calls
│   │   └── ...
│   ├── services/
│   │   ├── ai-agent-service.ts      # Multi-provider AI client orchestrator
│   │   └── providers/
│   │       ├── base-provider.ts     # Abstract base class for AI providers
│   │       ├── gemini-provider.ts   # Gemini 2.0 Live API implementation
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
│   ├── server-windows.js            # Windows VM Puppeteer orchestration
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
- **Video SDK**: LINE PlanetKit Web SDK 5.5
- **AI Providers**:
  - Google Gemini 2.0 Live API (WebSocket, 16kHz input)
  - OpenAI Realtime API (WebSocket, 24kHz input, server-side VAD)
- **Auth**: LINE LIFF (LINE Front-end Framework)
- **Backend**: Vercel Serverless Functions + Vercel Postgres
- **AI Agent Runtime**: Puppeteer on Windows VM
