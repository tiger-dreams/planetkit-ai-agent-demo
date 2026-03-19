/**
 * Gemini AI Provider
 *
 * Implements the BaseAIProvider interface for Google's Gemini 2.0 Live API.
 * Uses WebSocket for bidirectional audio streaming.
 */

import { BaseAIProvider, type ProviderMode } from './base-provider';
import type { GeminiSessionConfig } from '@/types/ai-provider';
import { AGENT_GREETING_TRIGGERS, AGENT_FAREWELL_MESSAGES, type AgentLanguage } from '@/config/ai-agent-languages';

export class GeminiProvider extends BaseAIProvider {
  private sessionConfig: GeminiSessionConfig | null = null;

  async connect(config: GeminiSessionConfig): Promise<void> {
    this.sessionConfig = config;
    this.setState('connecting');

    const wsUrl = `${config.wsEndpoint}?key=${config.apiKey}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
        this.ws?.close();
      }, 15000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        console.log('[GeminiProvider] WebSocket connected');
        this.sendSetupMessage();
        resolve();
      };

      this.ws.onclose = (ev) => {
        clearTimeout(timeout);
        console.log('[GeminiProvider] WebSocket closed:', ev.code, ev.reason);
        if (this.state === 'connected' || this.state === 'listening' || this.state === 'speaking') {
          this.setState('disconnected');
        }
      };

      this.ws.onerror = (ev) => {
        clearTimeout(timeout);
        console.error('[GeminiProvider] WebSocket error:', ev);
        this.emitError('WebSocket connection error');
        reject(new Error('WebSocket error'));
      };

      this.ws.onmessage = (ev) => {
        this.handleServerMessage(ev.data);
      };
    });
  }

  sendAudio(pcm16: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const base64 = this.arrayBufferToBase64(pcm16);
    const sampleRate = this.sessionConfig?.config.sampleRate || 16000;

    const message = {
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: `audio/pcm;rate=${sampleRate}`,
            data: base64,
          },
        ],
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  sendTextMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const message = {
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  sendInitialGreeting(language: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const lang = language as AgentLanguage;
    const text = AGENT_GREETING_TRIGGERS[lang] ?? AGENT_GREETING_TRIGGERS.en;

    console.log('[GeminiProvider] Sending initial greeting trigger');

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

  sendFarewell(language: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const lang = language as AgentLanguage;
    const text = AGENT_FAREWELL_MESSAGES[lang] ?? AGENT_FAREWELL_MESSAGES.en;

    console.log('[GeminiProvider] Sending farewell message');

    const message = {
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  sendModeInstruction(mode: ProviderMode): void {
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

    console.log(`[GeminiProvider] Sending mode instruction: ${mode}`);
    this.ws.send(JSON.stringify(message));
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
    this.mode = 'respond';
    this.setState('disconnected');
  }

  /**
   * Cancel current AI response (for barge-in/interruption)
   * For Gemini, we simply transition to listening state and stop emitting audio.
   * The server will naturally stop when it receives new audio input.
   * Note: Gemini doesn't have a direct "cancel response" API like OpenAI.
   */
  cancelCurrentResponse(): void {
    if (this.state !== 'speaking') return;

    console.log('[GeminiProvider] Interrupting response (user speaking)');

    // Just transition state - the server will handle the interruption
    // when it detects incoming audio during its response
    this.setState('listening');
  }

  // --- Private methods ---

  private sendSetupMessage(): void {
    if (!this.ws || !this.sessionConfig) return;

    const cfg = this.sessionConfig.config;
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

    console.log('[GeminiProvider] Sending setup message');
    this.ws.send(JSON.stringify(setup));
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
        console.log('[GeminiProvider] Setup complete');
        this.setState('connected');
        return;
      }

      // Server content (audio response from Gemini)
      if (msg.serverContent) {
        const content = msg.serverContent;

        if (content.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            // Audio data
            if (part.inlineData?.data) {
              this.setState('speaking');
              const pcmBytes = this.base64ToArrayBuffer(part.inlineData.data);
              const float32 = this.pcm16ToFloat32(new Int16Array(pcmBytes));
              this.emitAudioOutput(float32);
            }
            // Text transcript
            if (part.text) {
              console.log('[GeminiProvider] Transcript:', part.text);
              this.emitTranscript(part.text, false);
            }
          }
        }

        // Turn complete
        if (content.turnComplete) {
          console.log('[GeminiProvider] Turn complete');
          this.setState('listening');
        }
      }

      // Tool calls (future expansion)
      if (msg.toolCall) {
        console.log('[GeminiProvider] Tool call received:', msg.toolCall);
      }
    } catch (err) {
      console.warn('[GeminiProvider] Failed to parse server message:', err);
    }
  }
}
