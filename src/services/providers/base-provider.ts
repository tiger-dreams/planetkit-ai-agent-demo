/**
 * Base AI Provider Abstract Class
 *
 * Defines the common interface for AI providers (Gemini, OpenAI, etc.)
 */

import type { AISessionConfig } from '@/types/ai-provider';

export type ProviderState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'speaking'
  | 'listening'
  | 'error'
  | 'disconnected';

export type ProviderMode = 'respond' | 'listen';

export interface ProviderEventCallbacks {
  onAudioOutput?: (audioData: Float32Array) => void;
  onStateChange?: (state: ProviderState) => void;
  onError?: (error: string) => void;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onModeChange?: (mode: ProviderMode) => void;
}

export abstract class BaseAIProvider {
  protected ws: WebSocket | null = null;
  protected state: ProviderState = 'idle';
  protected mode: ProviderMode = 'respond';
  protected callbacks: ProviderEventCallbacks = {};

  // --- Abstract methods to be implemented by each provider ---

  /**
   * Connect to the AI provider's WebSocket endpoint
   */
  abstract connect(config: AISessionConfig): Promise<void>;

  /**
   * Send audio data to the provider
   */
  abstract sendAudio(pcm16: ArrayBuffer): void;

  /**
   * Send a text message to the provider
   */
  abstract sendTextMessage(text: string): void;

  /**
   * Send initial greeting trigger
   */
  abstract sendInitialGreeting(language: string): void;

  /**
   * Send farewell message before disconnecting
   */
  abstract sendFarewell(language: string): void;

  /**
   * Send mode instruction (respond/listen)
   */
  abstract sendModeInstruction(mode: ProviderMode): void;

  /**
   * Clean up and disconnect
   */
  abstract disconnect(): void;

  /**
   * Cancel current AI response (for barge-in/interruption)
   */
  abstract cancelCurrentResponse(): void;

  // --- Common methods ---

  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: ProviderEventCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Get current state
   */
  getState(): ProviderState {
    return this.state;
  }

  /**
   * Get current mode
   */
  getMode(): ProviderMode {
    return this.mode;
  }

  /**
   * Set mode and notify
   */
  setMode(newMode: ProviderMode): void {
    if (this.mode === newMode) return;
    const oldMode = this.mode;
    this.mode = newMode;
    console.log(`[Provider] Mode: ${oldMode} -> ${newMode}`);
    this.sendModeInstruction(newMode);
    this.callbacks.onModeChange?.(newMode);
  }

  // --- Protected helper methods ---

  protected setState(newState: ProviderState): void {
    if (this.state === newState) return;
    console.log(`[Provider] State: ${this.state} -> ${newState}`);
    this.state = newState;
    this.callbacks.onStateChange?.(newState);
  }

  protected emitAudioOutput(audioData: Float32Array): void {
    // Suppress audio output in listen mode
    if (this.mode === 'listen') return;
    this.callbacks.onAudioOutput?.(audioData);
  }

  protected emitError(error: string): void {
    this.callbacks.onError?.(error);
  }

  protected emitTranscript(text: string, isFinal: boolean): void {
    this.callbacks.onTranscript?.(text, isFinal);
  }

  // --- Utility methods ---

  protected arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const CHUNK = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
    }
    return btoa(binary);
  }

  protected base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  protected pcm16ToFloat32(pcm16: Int16Array): Float32Array {
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768;
    }
    return float32;
  }
}
