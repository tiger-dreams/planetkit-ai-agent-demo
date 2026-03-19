/**
 * AI Agent Service - Multi-Provider Support
 *
 * Connects to AI providers (Google Gemini / OpenAI Realtime) via WebSocket
 * for real-time bidirectional audio streaming.
 * Captures microphone audio as PCM16, sends it to the AI provider,
 * and emits the AI's audio response for playback.
 */

import type { AgentLanguage } from '@/config/ai-agent-languages';
import type { AIProvider, AISessionConfig } from '@/types/ai-provider';
import { PROVIDER_AUDIO_CONFIG } from '@/types/ai-provider';
import { BaseAIProvider, type ProviderState, type ProviderMode } from './providers/base-provider';
import { GeminiProvider } from './providers/gemini-provider';
import { OpenAIProvider } from './providers/openai-provider';

// --- Types ---

export type AIAgentState = ProviderState;
export type AIAgentMode = ProviderMode;

export interface AIAgentSessionConfig {
  language: AgentLanguage;
  voice?: string;
  systemPrompt?: string;
  provider?: AIProvider;
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
  private provider: BaseAIProvider | null = null;
  private currentProviderType: AIProvider = 'gemini';
  private audioContext: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private additionalSources: MediaStreamAudioSourceNode[] = [];

  private state: AIAgentState = 'idle';
  private isMuted = false;
  private mode: AIAgentMode = 'respond';
  private sessionConfig: AISessionConfig | null = null;
  private pendingAudioSource: MediaStream | null = null;
  private currentLanguage: AgentLanguage = 'ko';

  // Barge-in debounce for Gemini (avoid triggering on brief noise)
  private lastBargeInTime = 0;
  private consecutiveSpeechFrames = 0;

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

  getCurrentProvider(): AIProvider {
    return this.currentProviderType;
  }

  /**
   * Connect to the AI agent. Fetches session config from backend,
   * creates the appropriate provider, and starts microphone capture.
   */
  async connect(config: AIAgentSessionConfig): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      console.warn('[AIAgent] Already connected or connecting');
      return;
    }

    this.setState('connecting');
    this.currentLanguage = config.language;
    this.currentProviderType = config.provider || 'gemini';

    try {
      // 1. Fetch session configuration from our backend
      const sessionResp = await fetch('/api/ai-agent-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          provider: this.currentProviderType,
        }),
      });

      if (!sessionResp.ok) {
        throw new Error(`Session API returned ${sessionResp.status}`);
      }

      this.sessionConfig = await sessionResp.json();

      if (this.sessionConfig!.mockMode) {
        console.log('[AIAgent] Running in mock mode:', (this.sessionConfig as any).message);
        this.setState('connected');
        return;
      }

      // 2. Create the appropriate provider
      this.provider = this.createProvider(this.sessionConfig!.provider);

      // Set up event callbacks
      this.provider.setCallbacks({
        onAudioOutput: (data) => this.emit('audioOutput', data),
        onStateChange: (state) => this.setState(state),
        onError: (error) => this.emit('error', error),
        onTranscript: (text, isFinal) => this.emit('transcript', { text, isFinal }),
        onModeChange: (mode) => {
          this.mode = mode;
          this.emit('modeChange', mode);
        },
      });

      // 3. Connect via provider
      await this.provider.connect(this.sessionConfig!);

      // 4. Start microphone capture with provider-specific sample rate
      await this.startMicCapture();

      this.setState('connected');
      console.log(`[AIAgent] Connected successfully via ${this.currentProviderType}`);

      // 5. Send initial greeting trigger
      this.provider.sendInitialGreeting(config.language);
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
   */
  setMode(newMode: AIAgentMode): void {
    if (this.mode === newMode) return;
    const oldMode = this.mode;
    this.mode = newMode;
    console.log(`[AIAgent] Mode: ${oldMode} -> ${newMode}`);

    if (this.provider) {
      this.provider.setMode(newMode);
    }

    this.emit('modeChange', newMode);
  }

  /**
   * Add an external audio source (e.g., room audio) to the AI input pipeline.
   */
  addAudioSource(stream: MediaStream): void {
    if (!this.audioContext || !this.workletNode) {
      this.pendingAudioSource = stream;
      return;
    }
    this._connectAudioSource(stream);
  }

  /**
   * Send a farewell message to the AI, triggering a closing statement.
   */
  sendFarewell(language: AgentLanguage): void {
    if (this.provider) {
      this.provider.sendFarewell(language);
    }
  }

  // --- Private methods ---

  private createProvider(providerType: AIProvider): BaseAIProvider {
    console.log(`[AIAgent] Creating provider: ${providerType}`);

    switch (providerType) {
      case 'openai':
        return new OpenAIProvider();
      case 'gemini':
      default:
        return new GeminiProvider();
    }
  }

  private _connectAudioSource(stream: MediaStream): void {
    if (!this.audioContext || !this.workletNode) return;

    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.workletNode);
    this.additionalSources.push(source);
    console.log('[AIAgent] Room audio connected to AI input');
  }

  private async startMicCapture(): Promise<void> {
    // Get sample rate based on provider
    const sampleRate = PROVIDER_AUDIO_CONFIG[this.currentProviderType].inputSampleRate;
    console.log(`[AIAgent] Starting mic capture at ${sampleRate}Hz for ${this.currentProviderType}`);

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate });

    // Register worklet from inline code
    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);

    if (this.audioContext.audioWorklet) {
      await this.audioContext.audioWorklet.addModule(workletUrl);
    } else {
      throw new Error('AudioWorklet is not supported in this browser');
    }

    URL.revokeObjectURL(workletUrl);

    this.sourceNode = this.audioContext.createMediaStreamSource(this.micStream);
    this.workletNode = new AudioWorkletNode(this.audioContext, AUDIO_WORKLET_NAME);

    this.workletNode.port.onmessage = (ev) => {
      if (this.isMuted) return;
      if (!this.provider) return;

      const pcm16Buffer: ArrayBuffer = ev.data.pcm16;

      // VAD: RMS-based silence detection
      const pcm16 = new Int16Array(pcm16Buffer);
      let sum = 0;
      for (let i = 0; i < pcm16.length; i++) sum += pcm16[i] * pcm16[i];
      const rms = Math.sqrt(sum / pcm16.length);

      // Silence threshold (higher to reduce false triggers)
      if (rms < 50) {
        this.consecutiveSpeechFrames = 0;
        return;
      }

      // Barge-in: Cancel AI response if user starts speaking while AI is talking
      // For Gemini, we need to detect this client-side (OpenAI does it server-side)
      if (this.currentProviderType === 'gemini' && this.provider.getState() === 'speaking') {
        this.consecutiveSpeechFrames++;
        const now = Date.now();

        // Require 3 consecutive speech frames (~150ms at 1024 samples/16kHz)
        // and at least 500ms since last barge-in to avoid rapid re-triggers
        if (this.consecutiveSpeechFrames >= 3 && (now - this.lastBargeInTime) > 500) {
          console.log('[AIAgent] User speech detected during AI response - triggering barge-in');
          this.provider.cancelCurrentResponse();
          this.lastBargeInTime = now;
          this.consecutiveSpeechFrames = 0;
        }
      }

      // Send audio to provider
      this.provider.sendAudio(pcm16Buffer);
    };

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.audioContext.destination);

    // Apply pending room audio source
    if (this.pendingAudioSource) {
      this._connectAudioSource(this.pendingAudioSource);
      this.pendingAudioSource = null;
    }

    this.setState('listening');
    console.log('[AIAgent] Microphone capture started');
  }

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
    // Disconnect provider
    if (this.provider) {
      this.provider.disconnect();
      this.provider = null;
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
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    this.sessionConfig = null;
    this.mode = 'respond';
  }
}

// Singleton export
export const aiAgentService = new AIAgentService();
