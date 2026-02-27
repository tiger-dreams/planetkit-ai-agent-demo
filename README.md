# PlanetKit AI Agent Demo

A mobile-first LINE LIFF video conferencing application with **AI Agent** powered by Google Gemini 2.0 Multimodal Live API, built on **LINE PlanetKit Web SDK 5.5**.

## Features

- **LINE LIFF Integration** - Seamless LINE authentication and in-app browser support
- **PlanetKit Web SDK 5.5** - HD group video conferencing with WebRTC
- **AI Agent (Gemini 2.0)** - Real-time AI assistant that joins group calls via voice
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
3. AudioWorklet encodes to PCM16 (16kHz) → sent to Gemini via WebSocket
4. Gemini responds with audio → decoded to Float32 → routed through `MediaStreamDestination`
5. AI voice broadcast to all participants via `setCustomMediaStream()`

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
4. **Google AI Studio Account** - For AI Agent (Gemini API)
   - Get API key at: https://aistudio.google.com
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
- **Group Call**: `https://{domain}/api/callback?action=planetkit`
- **Agent Call status**: `https://{domain}/api/callback?action=agent-call`
- **Agent Call notify**: `https://{domain}/api/callback?action=notify`
- **1-to-1 Call lifecycle**: `https://{domain}/api/callback?action=one-to-one-call`

Update LIFF Endpoint URL in LINE Developers Console to your Vercel domain.

### Phase 6: AI Agent Setup (Windows VM)

1. Provision a Windows VM (Azure recommended) and install Chrome browser
2. Install Node.js (v18+)
3. Copy the `render-service/` folder to the VM
4. Install dependencies: `cd render-service && npm install`
5. Set environment variables:
   ```
   FRONTEND_URL=https://your-app.vercel.app
   GEMINI_API_KEY=your-gemini-api-key
   CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
   PORT=3000
   ```
6. Start the server: `node server-windows.js` (use PM2 for production)
7. Open firewall port 3000
8. Set `VITE_RENDER_SERVICE_URL=http://your-vm-ip:3000` in Vercel env vars

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
│   │   └── ai-agent-service.ts      # Gemini 2.0 WebSocket client
│   ├── config/
│   │   └── ai-agent-languages.ts    # Multi-language prompts & voices
│   └── utils/
│       └── token-generator.ts       # PlanetKit JWT (DEMO ONLY)
├── api/                             # Vercel Serverless Functions (6 total)
│   ├── ai-agent-session.ts          # Gemini WebSocket config
│   ├── agent-call.ts                # Agent Call initiation
│   ├── callback.ts                  # Unified PlanetKit callbacks
│   ├── line.ts                      # LINE messaging & token
│   ├── retry.ts                     # Retry scheduling (QStash)
│   └── planetkit-callback.ts        # Legacy callback proxy
├── render-service/
│   ├── server-windows.js            # Windows VM Puppeteer orchestration
│   └── package.json
└── docs/
    ├── ARCHITECTURE.md
    ├── architecture-ai-agent-windows-vm.puml
    └── userflow-ai-agent-media-flow.puml
```

## API Endpoints (6 Vercel Serverless Functions)

Compatible with Vercel Hobby plan (max 12 functions):

| Endpoint | Description |
|----------|-------------|
| `/api/ai-agent-session` | Returns Gemini WebSocket config |
| `/api/agent-call` | Agent Call DB init & call initiation |
| `/api/callback` | Unified PlanetKit event callbacks |
| `/api/line` | LINE messaging, token, user list |
| `/api/retry` | Retry scheduling via QStash |
| `/api/planetkit-callback` | Legacy proxy to unified callback |

## Developer Resources

- [PlanetKit Documentation](https://docs.lineplanet.me)
- [LINE LIFF Documentation](https://developers.line.biz/en/docs/liff/)
- [Google AI Studio (Gemini API Key)](https://aistudio.google.com)
- [Gemini Multimodal Live API](https://ai.google.dev/gemini-api/docs/multimodal-live)

## Tech Stack

- **Frontend**: Vite + React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **Video SDK**: LINE PlanetKit Web SDK 5.5
- **AI**: Google Gemini 2.0 Multimodal Live API (WebSocket)
- **Auth**: LINE LIFF (LINE Front-end Framework)
- **Backend**: Vercel Serverless Functions + Vercel Postgres
- **AI Agent Runtime**: Puppeteer on Windows VM
