/**
 * OpenAI Realtime API Provider
 *
 * Implements the BaseAIProvider interface for OpenAI's Realtime API.
 * Uses WebSocket for bidirectional audio streaming with server-side VAD.
 */

import { BaseAIProvider, type ProviderMode } from './base-provider';
import type { OpenAISessionConfig } from '@/types/ai-provider';
import { AGENT_GREETING_TRIGGERS, AGENT_FAREWELL_MESSAGES, type AgentLanguage } from '@/config/ai-agent-languages';

export class OpenAIProvider extends BaseAIProvider {
  private sessionConfig: OpenAISessionConfig | null = null;
  private sessionId: string | null = null;

  async connect(config: OpenAISessionConfig): Promise<void> {
    this.sessionConfig = config;
    this.setState('connecting');

    // OpenAI Realtime API uses Sec-WebSocket-Protocol for authentication
    // Format: ['realtime', 'openai-insecure-api-key.{KEY}', 'openai-beta.realtime-v1']
    const protocols = [
      'realtime',
      `openai-insecure-api-key.${config.apiKey}`,
      'openai-beta.realtime-v1'
    ];

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(config.wsEndpoint, protocols);
      } catch (err) {
        reject(new Error(`Failed to create WebSocket: ${err}`));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
        this.ws?.close();
      }, 15000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        console.log('[OpenAIProvider] WebSocket connected');
        // Session update will be sent after receiving session.created
      };

      this.ws.onclose = (ev) => {
        clearTimeout(timeout);
        console.log('[OpenAIProvider] WebSocket closed:', ev.code, ev.reason);
        if (this.state === 'connected' || this.state === 'listening' || this.state === 'speaking') {
          this.setState('disconnected');
        }
      };

      this.ws.onerror = (ev) => {
        clearTimeout(timeout);
        console.error('[OpenAIProvider] WebSocket error:', ev);
        this.emitError('WebSocket connection error');
        reject(new Error('WebSocket error'));
      };

      this.ws.onmessage = (ev) => {
        this.handleServerMessage(ev.data, resolve);
      };
    });
  }

  sendAudio(pcm16: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const base64 = this.arrayBufferToBase64(pcm16);

    const message = {
      type: 'input_audio_buffer.append',
      audio: base64,
    };

    this.ws.send(JSON.stringify(message));
  }

  sendTextMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Create a conversation item with text
    const message = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text,
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(message));

    // Trigger response generation
    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  sendInitialGreeting(language: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const lang = language as AgentLanguage;
    const text = AGENT_GREETING_TRIGGERS[lang] ?? AGENT_GREETING_TRIGGERS.en;

    console.log('[OpenAIProvider] Sending initial greeting trigger');

    // Send as a system message to trigger greeting
    const message = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `(System: The call has just connected. Please introduce yourself using this text: "${text}")`,
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(message));
    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  sendFarewell(language: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const lang = language as AgentLanguage;
    const text = AGENT_FAREWELL_MESSAGES[lang] ?? AGENT_FAREWELL_MESSAGES.en;

    console.log('[OpenAIProvider] Sending farewell message');

    const message = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text,
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(message));
    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  sendModeInstruction(mode: ProviderMode): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const text = mode === 'listen'
      ? '(System instruction: You are now in LISTEN-ONLY mode. Do NOT speak, generate any audio, or make any sound. Silently absorb and remember everything being discussed. When you are switched back to respond mode, you will have full context of the conversation.)'
      : '(System instruction: You are now available to respond when addressed. Do NOT speak immediately or summarize what you heard. Wait silently until a participant directly asks you a question or addresses you. When asked, use your full knowledge of the conversation, including what was discussed during listen-only mode, to provide a helpful response.)';

    console.log(`[OpenAIProvider] Sending mode instruction: ${mode}`);

    const message = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text,
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(message));
    // Don't trigger response for mode instruction
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.sessionConfig = null;
    this.sessionId = null;
    this.mode = 'respond';
    this.setState('disconnected');
  }

  /**
   * Cancel current AI response (for barge-in/interruption)
   */
  cancelCurrentResponse(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    console.log('[OpenAIProvider] Cancelling current response');

    // Send response.cancel to stop current AI response
    this.ws.send(JSON.stringify({ type: 'response.cancel' }));

    // Transition to listening state
    this.setState('listening');
  }

  // --- Private methods ---

  private sendSessionUpdate(): void {
    if (!this.ws || !this.sessionConfig) return;

    const cfg = this.sessionConfig.config;

    const sessionUpdate = {
      type: 'session.update',
      session: {
        modalities: cfg.modalities,
        instructions: cfg.systemPrompt,
        voice: cfg.voice,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
        turn_detection: {
          type: cfg.turnDetection.type,
          threshold: cfg.turnDetection.threshold,
          prefix_padding_ms: cfg.turnDetection.prefixPaddingMs,
          silence_duration_ms: cfg.turnDetection.silenceDurationMs,
        },
      },
    };

    console.log('[OpenAIProvider] Sending session update');
    this.ws.send(JSON.stringify(sessionUpdate));
  }

  private handleServerMessage(rawData: string | Blob, resolveConnect?: (value: void) => void): void {
    if (rawData instanceof Blob) {
      rawData.text().then((text) => this.parseServerMessage(text, resolveConnect));
    } else {
      this.parseServerMessage(rawData, resolveConnect);
    }
  }

  private parseServerMessage(text: string, resolveConnect?: (value: void) => void): void {
    try {
      const msg = JSON.parse(text);

      switch (msg.type) {
        case 'session.created':
          console.log('[OpenAIProvider] Session created:', msg.session?.id);
          this.sessionId = msg.session?.id;
          // Now send session update
          this.sendSessionUpdate();
          break;

        case 'session.updated':
          console.log('[OpenAIProvider] Session updated');
          this.setState('connected');
          resolveConnect?.();
          break;

        case 'input_audio_buffer.speech_started':
          // Only cancel if AI is currently speaking (barge-in/interruption)
          if (this.state === 'speaking') {
            console.log('[OpenAIProvider] Speech started during AI response - cancelling');
            this.cancelCurrentResponse();
          } else {
            console.log('[OpenAIProvider] Speech started (AI not speaking)');
          }
          break;

        case 'input_audio_buffer.speech_stopped':
          console.log('[OpenAIProvider] Speech stopped');
          break;

        case 'input_audio_buffer.committed':
          console.log('[OpenAIProvider] Audio buffer committed');
          break;

        case 'conversation.item.created':
          // Conversation item created
          break;

        case 'response.created':
          // Response started
          this.setState('speaking');
          break;

        case 'response.audio.delta':
          // Audio chunk from OpenAI
          if (msg.delta) {
            const pcmBytes = this.base64ToArrayBuffer(msg.delta);
            const float32 = this.pcm16ToFloat32(new Int16Array(pcmBytes));
            this.emitAudioOutput(float32);
          }
          break;

        case 'response.audio.done':
          console.log('[OpenAIProvider] Audio response done');
          break;

        case 'response.audio_transcript.delta':
          if (msg.delta) {
            this.emitTranscript(msg.delta, false);
          }
          break;

        case 'response.audio_transcript.done':
          if (msg.transcript) {
            console.log('[OpenAIProvider] Transcript:', msg.transcript);
            this.emitTranscript(msg.transcript, true);
          }
          break;

        case 'response.done':
          console.log('[OpenAIProvider] Response done');
          this.setState('listening');
          break;

        case 'error':
          console.error('[OpenAIProvider] Error:', msg.error);
          this.emitError(msg.error?.message || 'Unknown error');
          break;

        default:
          // Log unknown message types for debugging
          if (msg.type && !msg.type.startsWith('rate_limits')) {
            console.log('[OpenAIProvider] Message:', msg.type);
          }
      }
    } catch (err) {
      console.warn('[OpenAIProvider] Failed to parse server message:', err);
    }
  }
}
