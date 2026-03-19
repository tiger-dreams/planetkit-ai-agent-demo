# System Architecture

## Overview

This document describes the architecture for the PlanetKit AI Agent Demo — a LINE LIFF video conferencing application with AI Agent (Gemini 2.0) integration, Agent Call (1-to-1 outbound voice), and group conferencing.

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Vite + React 18 + TypeScript | SPA with mobile-first UI |
| Styling | Tailwind CSS + shadcn/ui | Responsive component library |
| Video SDK | LINE PlanetKit Web SDK 5.5 | WebRTC group conferencing |
| AI | Google Gemini 2.0 Multimodal Live API | Real-time voice AI agent |
| Auth | LINE LIFF | In-app authentication |
| Backend | Vercel Serverless Functions (6) | API endpoints |
| Database | Vercel Postgres (Neon) | Event logging, session tracking |
| AI Runtime | Puppeteer on Windows VM | Headless Chrome for AI Agent |
| Scheduling | Upstash QStash | Delayed retry scheduling |

---

## Three Main Features

### 1. Group Video Conference

Simple client-side WebRTC connection — no backend state required.

```
User A ──WebRTC──► Planet Server ◄──WebRTC── User B
                        │
                   Room-based routing
                   (same Room ID = same call)
```

**Key files:**
- `src/pages/SetupPage.tsx` — Room selection, LIFF auth
- `src/components/PlanetKitMeetingArea.tsx` — Conference logic (770+ lines)
- `src/components/TileView.tsx` — Adaptive video grid
- `src/utils/token-generator.ts` — Client-side JWT (demo only)

### 2. AI Agent in Group Call (Bridge Architecture)

AI Agent joins the conference as a separate participant via a headless Chrome instance on a Windows VM.

```
┌── Client Browser ──┐    ┌── Windows VM ────────────────────────┐
│                     │    │                                      │
│  PlanetKitMeeting  │    │  server-windows.js (Express :3000)   │
│   [Invite AI Btn]──┼───►│    │                                 │
│   [Listen/Respond]──┼───►│    ▼ puppeteer.launch()             │
│                     │    │  Chrome (headless:false, off-screen) │
│                     │    │    ┌─ HeadlessAgentPage ──────────┐ │
│                     │    │    │ PlanetKit Conference (WebRTC) │ │
│                     │    │    │ AudioWorklet → Gemini WS      │ │
│                     │    │    │ Gemini response → PlanetKit   │ │
│                     │    │    └───────────────────────────────┘ │
└─────────────────────┘    └──────────────────────────────────────┘
         │                              │
         └──── Both connect to ────────►│
                Planet Server (same room)
```

**Audio Pipeline:**
1. Room audio → `captureStream()` → AudioWorklet (PCM16, 16kHz)
2. PCM16 chunks → Gemini WebSocket (`realtimeInput`)
3. Gemini audio response → Float32 Ring Buffer → AudioContext (24kHz)
4. AudioContext → `MediaStreamDestination` → `setCustomMediaStream()` → Room

**Listen/Respond Mode (Dual Safety Net):**
- **Gemini instruction**: `clientContent` message tells Gemini to stop/start speaking
- **Audio output gate**: Code-level block prevents audio from reaching PlanetKit
- Audio **input** continues in Listen mode to maintain conversational context

**Key files:**
- `src/pages/HeadlessAgentPage.tsx` — Runs in Puppeteer on VM
- `src/services/ai-agent-service.ts` — Gemini WebSocket client (643 lines)
- `src/config/ai-agent-languages.ts` — Multi-language prompts & voices
- `render-service/server-windows.js` — Puppeteer orchestration
- `api/ai-agent-session.ts` — Gemini config endpoint

**Why Windows VM?**
Linux headless Chrome breaks Web Audio API (AudioWorklet fails silently). Windows with `headless: false` + `--window-position=-2000,0` (off-screen) keeps audio functional.

---

## API Endpoints (Vercel Functions)

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/ai-agent-session` | POST | Returns AI provider WebSocket config (Gemini or OpenAI) |
| `/api/line` | GET, POST | `get-followers`, `get-token`, `send-invite` |
| `/api/planetkit-callback` | GET, POST | PlanetKit group call event callback |

---

## Security Notes

1. **Token Generation** — Client-side JWT in this demo. **Production must use server-side generation.**
2. **API Credentials** — Store in environment variables, never in code
3. **LIFF Authentication** — Validated by LINE Platform
4. **Callback URLs** — Register in PlanetKit Console for event delivery
