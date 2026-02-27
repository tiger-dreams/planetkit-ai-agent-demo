/**
 * AI Agent Service - Gemini 2.0 Multimodal Live WebSocket Client
 *
 * Connects to the Gemini Live API via WebSocket for real-time
 * bidirectional audio streaming. Captures microphone audio as PCM16,
 * sends it to Gemini, and plays back the AI's audio response.
 */

import { AgentLanguage, AGENT_FAREWELL_MESSAGES, AGENT_GREETING_TRIGGERS } from '@/config/ai-agent-languages';

// --- Types ---

export type AIAgentState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'speaking'
  | 'listening'
  | 'error'
  | 'disconnected';

export type AIAgentMode = 'respond' | 'listen';

export interface AIAgentSessionConfig {
  language: AgentLanguage;
  voice?: string;
  systemPrompt?: string;
}

interface SessionResponse {
  mockMode: boolean;
  provider?: string;
  model?: string;
  wsEndpoint?: string;
  apiKey?: string;
  config?: {
    voice: string;
    language: string;
    systemPrompt: string;
    sampleRate: number;
    responseModalities: string[];
  };
  message?: string;
}

export interface AIAgentEventMap {
  stateChange: AIAgentState;
  error: string;
  transcript: { text: string; isFinal: boolean };
  audioLevel: number;
  audioOutput: Float32Array;
  modeChange: AIAgentMode;
}

type EventCallback<T> = (data: T) => void;

// --- Constants ---

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const AUDIO_WORKLET_NAME = 'pcm-capture-processor';

// Inline AudioWorklet processor code (avoids separate file)
const WORKLET_CODE = `
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 1024;
    this._buffer = new Float32Array(this._bufferSize);
    this._writeIndex = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._writeIndex++] = channelData[i];
      if (this._writeIndex >= this._bufferSize) {
        // Convert float32 to PCM16
        const pcm16 = new Int16Array(this._bufferSize);
        for (let j = 0; j < this._bufferSize; j++) {
          const s = Math.max(-1, Math.min(1, this._buffer[j]));
          pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage({ pcm16: pcm16.buffer }, [pcm16.buffer]);
        this._buffer = new Float32Array(this._bufferSize);
        this._writeIndex = 0;
      }
    }
    return true;
  }
}
registerProcessor('${AUDIO_WORKLET_NAME}', PCMCaptureProcessor);
`;

// --- Service ---

export class AIAgentService {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private additionalSources: MediaStreamAudioSourceNode[] = [];

  private state: AIAgentState = 'idle';
  private isMuted = false;
  private mode: AIAgentMode = 'respond';
  private sessionConfig: SessionResponse | null = null;
  private pendingAudioSource: MediaStream | null = null;

  // Event listeners
  private listeners: { [K in keyof AIAgentEventMap]?: EventCallback<AIAgentEventMap[K]>[] } = {};

  // --- Public API ---

  on<K extends keyof AIAgentEventMap>(event: K, callback: EventCallback<AIAgentEventMap[K]>) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(callback);
  }

  off<K extends keyof AIAgentEventMap>(event: K, callback: EventCallback<AIAgentEventMap[K]>) {
    const list = this.listeners[event];
    if (list) {
      this.listeners[event] = list.filter((cb) => cb !== callback) as any;
    }
  }

  getState(): AIAgentState {
    return this.state;
  }

  isMicMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Connect to the AI agent. Fetches session config from backend,
   * opens WebSocket to Gemini, and starts microphone capture.
   */
  async connect(config: AIAgentSessionConfig): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      console.warn('[AIAgent] Already connected or connecting');
      return;
    }

    this.setState('connecting');

    try {
      // 1. Fetch session configuration from our backend
      const sessionResp = await fetch('/api/ai-agent-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!sessionResp.ok) {
        throw new Error(`Session API returned ${sessionResp.status}`);
      }

      this.sessionConfig = await sessionResp.json();

      if (this.sessionConfig!.mockMode) {
        console.log('[AIAgent] Running in mock mode:', this.sessionConfig!.message);
        this.setState('connected');
        // In mock mode, we don't open a real WebSocket
        return;
      }

      // 2. Open WebSocket to Gemini Live API
      const wsUrl = `${this.sessionConfig!.wsEndpoint}?key=${this.sessionConfig!.apiKey}`;
      await this.openWebSocket(wsUrl);

      // 3. Send setup message
      this.sendSetupMessage();

      // 4. Start microphone capture
      await this.startMicCapture();

      this.setState('connected');
      console.log('[AIAgent] Connected successfully');

      // 5. Send initial greeting trigger
      this.sendInitialGreeting();
    } catch (err: any) {
      console.error('[AIAgent] Connection error:', err);
      this.setState('error');
      this.emit('error', err.message || 'Connection failed');
      this.cleanup();
    }
  }

  /**
   * Disconnect from the AI agent and release all resources.
   */
  disconnect(): void {
    console.log('[AIAgent] Disconnecting...');
    this.cleanup();
    this.setState('disconnected');
  }

  /**
   * Toggle microphone mute state.
   */
  toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isMuted;
      });
    }
    return this.isMuted;
  }

  /**
   * Set mute state explicitly.
   */
  setMute(muted: boolean): void {
    this.isMuted = muted;
    if (this.micStream) {
      this.micStream.getAudioTracks().forEach((track) => {
        track.enabled = !this.isMuted;
      });
    }
  }

  /**
   * Get current agent mode.
   */
  getMode(): AIAgentMode {
    return this.mode;
  }

  /**
   * Set agent mode: 'respond' (normal) or 'listen' (silent observer).
   * In listen mode, Gemini receives a text instruction to stop responding
   * and audio output is suppressed as a safety net.
   * Audio input continues so Gemini maintains conversation context.
   */
  setMode(newMode: AIAgentMode): void {
    if (this.mode === newMode) return;
    const oldMode = this.mode;
    this.mode = newMode;
    console.log(`[AIAgent] Mode: ${oldMode} -> ${newMode}`);
    this.sendModeInstruction(newMode);
    this.emit('modeChange', newMode);
  }

  /**
   * Add an external audio source (e.g., room audio) to the Gemini input pipeline.
   * The browser's audio graph mixes it with the microphone automatically.
   */
  addAudioSource(stream: MediaStream): void {
    if (!this.audioContext || !this.workletNode) {
      // Pipeline not ready yet (evtConnected fires before Gemini WebSocket connects)
      // Queue it and apply once startMicCapture() initializes the pipeline
      this.pendingAudioSource = stream;
      return;
    }
    this._connectAudioSource(stream);
  }

  private _connectAudioSource(stream: MediaStream): void {
    const source = this.audioContext!.createMediaStreamSource(stream);
    source.connect(this.workletNode!);
    this.additionalSources.push(source);
    console.log('[AIAgent] Room audio connected to Gemini input');
  }

  /**
   * Send a farewell message to Gemini, triggering a closing statement.
   * Called before the agent auto-leaves (session timeout or empty room).
   */
  sendFarewell(language: AgentLanguage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const text = AGENT_FAREWELL_MESSAGES[language] ?? AGENT_FAREWELL_MESSAGES.en;
    const message = {
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    };
    console.log('[AIAgent] Sending farewell message');
    this.ws.send(JSON.stringify(message));
  }

  // --- WebSocket ---

  private openWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
        this.ws?.close();
      }, 15000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        console.log('[AIAgent] WebSocket connected');
        resolve();
      };

      this.ws.onclose = (ev) => {
        clearTimeout(timeout);
        console.log('[AIAgent] WebSocket closed:', ev.code, ev.reason);
        if (this.state === 'connected' || this.state === 'listening' || this.state === 'speaking') {
          this.setState('disconnected');
        }
      };

      this.ws.onerror = (ev) => {
        clearTimeout(timeout);
        console.error('[AIAgent] WebSocket error:', ev);
        this.emit('error', 'WebSocket connection error');
        reject(new Error('WebSocket error'));
      };

      this.ws.onmessage = (ev) => {
        this.handleServerMessage(ev.data);
      };
    });
  }

  private sendSetupMessage(): void {
    if (!this.ws || !this.sessionConfig) return;

    const cfg = this.sessionConfig.config!;
    const setup = {
      setup: {
        model: this.sessionConfig.model,
        generationConfig: {
          responseModalities: cfg.responseModalities,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: cfg.voice,
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: cfg.systemPrompt }],
        },
      },
    };

    console.log('[AIAgent] Sending setup message');
    this.ws.send(JSON.stringify(setup));
  }

  private sendInitialGreeting(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.sessionConfig) return;

    const language = (this.sessionConfig.config?.language || 'ko') as AgentLanguage;
    const text = AGENT_GREETING_TRIGGERS[language] ?? AGENT_GREETING_TRIGGERS.en;

    console.log('[AIAgent] Sending initial greeting trigger');
    
    const message = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [{ text: `(System: The call has just connected. Please introduce yourself using this text: "${text}")` }]
          }
        ],
        turnComplete: true
      }
    };

    this.ws.send(JSON.stringify(message));
  }

  private sendModeInstruction(mode: AIAgentMode): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const text = mode === 'listen'
      ? '(System instruction: You are now in LISTEN-ONLY mode. Do NOT speak, generate any audio, or make any sound. Silently absorb and remember everything being discussed. When you are switched back to respond mode, you will have full context of the conversation.)'
      : '(System instruction: You are now available to respond when addressed. Do NOT speak immediately or summarize what you heard. Wait silently until a participant directly asks you a question or addresses you. When asked, use your full knowledge of the conversation, including what was discussed during listen-only mode, to provide a helpful response.)';

    const message = {
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    };

    console.log(`[AIAgent] Sending mode instruction: ${mode}`);
    this.ws.send(JSON.stringify(message));
  }

  private handleServerMessage(rawData: string | Blob): void {
    if (rawData instanceof Blob) {
      rawData.text().then((text) => this.parseServerMessage(text));
    } else {
      this.parseServerMessage(rawData);
    }
  }

  private parseServerMessage(text: string): void {
    try {
      const msg = JSON.parse(text);

      // Setup complete acknowledgment
      if (msg.setupComplete) {
        console.log('[AIAgent] Setup complete');
        return;
      }

      // Server content (audio response from Gemini)
      if (msg.serverContent) {
        const content = msg.serverContent;

        if (content.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            // Audio data
            if (part.inlineData?.data) {
              // Listen mode: suppress audio output (safety net alongside Gemini instruction)
              if (this.mode === 'listen') return;

              this.setState('speaking');
              const pcmBytes = this.base64ToArrayBuffer(part.inlineData.data);
              const float32 = this.pcm16ToFloat32(new Int16Array(pcmBytes));

              // Emit immediately - let the consumer handle scheduling
              this.emit('audioOutput', float32);
            }
            // Text transcript
            if (part.text) {
              console.log('[AIAgent] Transcript:', part.text);
              this.emit('transcript', { text: part.text, isFinal: false });
            }
          }
        }

        // Turn complete
        if (content.turnComplete) {
          console.log('[AIAgent] Turn complete');
          this.setState('listening');
        }
      }

      // Tool calls (future expansion)
      if (msg.toolCall) {
        console.log('[AIAgent] Tool call received:', msg.toolCall);
      }
    } catch (err) {
      console.warn('[AIAgent] Failed to parse server message:', err);
    }
  }

  // --- Microphone Capture ---

  private async startMicCapture(): Promise<void> {
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: INPUT_SAMPLE_RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });

    // Register worklet from inline code
    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);

    if (this.audioContext.audioWorklet) {
      await this.audioContext.audioWorklet.addModule(workletUrl);
    } else {
      // Fallback or error for browsers without AudioWorklet support
      throw new Error('AudioWorklet is not supported in this browser');
    }

    URL.revokeObjectURL(workletUrl);

    this.sourceNode = this.audioContext.createMediaStreamSource(this.micStream);
    this.workletNode = new AudioWorkletNode(this.audioContext, AUDIO_WORKLET_NAME);

    this.workletNode.port.onmessage = (ev) => {
      if (this.isMuted) return;
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      const pcm16Buffer: ArrayBuffer = ev.data.pcm16;

      // VAD: RMS 기반 침묵 감지 → 침묵 프레임은 전송 스킵하여 Gemini 과금 절감
      const pcm16 = new Int16Array(pcm16Buffer);
      let sum = 0;
      for (let i = 0; i < pcm16.length; i++) sum += pcm16[i] * pcm16[i];
      const rms = Math.sqrt(sum / pcm16.length);
      if (rms < 30) return; // 침묵 임계값 (200→30: WebRTC 경유 시 신호 레벨이 낮음)

      const base64 = this.arrayBufferToBase64(pcm16Buffer);

      const message = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
              data: base64,
            },
          ],
        },
      };

      this.ws.send(JSON.stringify(message));
    };

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.audioContext.destination); // required to keep worklet running

    // Apply pending room audio source (queued from evtConnected before pipeline was ready)
    if (this.pendingAudioSource) {
      this._connectAudioSource(this.pendingAudioSource);
      this.pendingAudioSource = null;
    }

    this.setState('listening');
    console.log('[AIAgent] Microphone capture started');
  }

  // --- Audio Playback ---



  private resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
    const ratio = fromRate / toRate;
    const outputLength = Math.round(input.length / ratio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * ratio;
      const low = Math.floor(srcIndex);
      const high = Math.min(low + 1, input.length - 1);
      const frac = srcIndex - low;
      output[i] = input[low] * (1 - frac) + input[high] * frac;
    }
    return output;
  }

  // --- Utility ---

  private setState(newState: AIAgentState): void {
    if (this.state === newState) return;
    console.log(`[AIAgent] State: ${this.state} -> ${newState}`);
    this.state = newState;
    this.emit('stateChange', newState);
  }

  private emit<K extends keyof AIAgentEventMap>(event: K, data: AIAgentEventMap[K]): void {
    const cbs = this.listeners[event];
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[AIAgent] Event listener error (${event}):`, err);
        }
      }
    }
  }

  private cleanup(): void {
    // Close WebSocket
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    // Stop mic
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }

    // Disconnect audio nodes
    this.additionalSources.forEach((s) => s.disconnect());
    this.additionalSources = [];
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => { });
      this.audioContext = null;
    }

    // this.playbackQueue = [];
    // this.isPlaying = false;
    this.sessionConfig = null;
    this.mode = 'respond';
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    // Process in chunks to avoid call stack limits on large buffers
    const CHUNK = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private pcm16ToFloat32(pcm16: Int16Array): Float32Array {
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }
    return float32;
  }
}

// Singleton export
export const aiAgentService = new AIAgentService();
