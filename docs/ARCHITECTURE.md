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

### 3. Agent Call (1-to-1 Outbound)

Server-orchestrated outbound voice call via PlanetKit Agent Call API.

```
Trigger ──► API ──► PlanetKit Agent Call API ──► Callback
                                                    │
                                              Notify callback
                                                    │
                                              LINE push message
                                              [Accept Call] button
                                                    │
                                              User opens LIFF
                                              Auto-accepts call
```

**Timeout & Retry:**
- 60s no answer → status `missed` → LINE push with retry option
- User clicks retry → QStash schedules 5-min delay → re-initiates call
- Max 3 retry attempts

**Key files:**
- `src/pages/AgentCallTrigger.tsx` — Trigger UI
- `src/pages/AgentCallMeeting.tsx` — Call acceptance UI
- `api/agent-call.ts` — Call initiation + DB init
- `api/callback.ts` — All callback handling
- `api/retry.ts` — QStash retry scheduling

---

## API Endpoints (6 Vercel Functions)

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/ai-agent-session` | POST | Returns Gemini WebSocket config |
| `/api/agent-call` | GET, POST | `init-db`: create tables, `initiate`: start call |
| `/api/callback` | GET, POST | Unified handler for all PlanetKit callbacks |
| `/api/line` | GET, POST | `get-followers`, `get-token`, `send-invite` |
| `/api/retry` | POST | `schedule`: queue retry, `execute`: run retry |
| `/api/planetkit-callback` | GET, POST | Legacy proxy to `/api/callback?action=planetkit` |

---

## Database Schema

### `planetkit_events` — Group call events
| Column | Type | Description |
|--------|------|-------------|
| event_type | VARCHAR | GCALL_EVT_START, USER_JOIN, USER_LEAVE, etc. |
| room_id | VARCHAR | Conference room ID |
| user_id | VARCHAR | Participant user ID |
| data | JSONB | Raw callback data |

### `agent_call_sessions` — 1-to-1 call sessions
| Column | Type | Description |
|--------|------|-------------|
| sid | VARCHAR(UNIQUE) | PlanetKit session ID |
| status | VARCHAR | initiated → ringing → answered → ended / missed |
| is_retry | BOOLEAN | Whether this is a retry call |
| retry_count | INTEGER | Number of retry attempts |

### `agent_call_events` — Call lifecycle events
### `agent_call_retry_queue` — Pending retry jobs

---

## Security Notes

1. **Token Generation** — Client-side JWT in this demo. **Production must use server-side generation.**
2. **API Credentials** — Store in environment variables, never in code
3. **LIFF Authentication** — Validated by LINE Platform
4. **Callback URLs** — Register in PlanetKit Console for event delivery
