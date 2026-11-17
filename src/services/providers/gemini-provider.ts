/**
 * Gemini AI Provider
 *
 * Implements the BaseAIProvider interface for Google's Gemini 3.8 Live API.
 * Uses WebSocket for bidirectional audio streaming.
 */

import { BaseAIProvider, type ProviderMode } from './base-provider';
import type { GeminiSessionConfig } from '@/types/ai-provider';
import { AGENT_GREETING_TRIGGERS, AGENT_FAREWELL_MESSAGES, type AgentLanguage } from '@/config/ai-agent-languages';

export class GeminiProvider extends BaseAIProvider {
  private sessionConfig: GeminiSessionConfig | null = null;
  private cancelPendingConnect: (() => void) | null = null;

  async connect(config: GeminiSessionConfig): Promise<void> {
    if (this.ws || this.cancelPendingConnect) this.disconnect();
    this.sessionConfig = config;
    this.setState('connecting');

    const wsUrl = `${config.wsEndpoint}?key=${config.apiKey}`;

    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch (error) {
        this.sessionConfig = null;
        this.setState('error');
        this.emitError('WebSocket connection error');
        reject(error);
        return;
      }
      this.ws = ws;
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.cancelPendingConnect = null;
        if (error) reject(error);
        else resolve();
      };
      const fail = (message: string) => {
        if (this.ws !== ws) return;
        finish(new Error(message));
        this.detachSocket(ws);
        this.ws = null;
        this.sessionConfig = null;
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
        this.setState('error');
        this.emitError(message);
      };
      // Opening the transport does not mean the model accepted its setup.
      const timeout = setTimeout(() => fail('Gemini WebSocket setup timeout'), 15000);
      this.cancelPendingConnect = () => finish(new Error('Gemini disconnected before setup completed'));

      ws.onopen = () => {
        if (this.ws !== ws) return;
        console.log('[GeminiProvider] WebSocket connected; waiting for setup acknowledgment');
        try {
          this.sendSetupMessage();
        } catch {
          fail('Failed to send Gemini setup');
        }
      };

      ws.onclose = (ev) => {
        if (this.ws !== ws) return;
        const message = `Gemini WebSocket closed before setup completed (${ev.code}${ev.reason ? `: ${ev.reason}` : ''})`;
        const wasPending = !settled;
        finish(new Error(message));
        this.detachSocket(ws);
        this.ws = null;
        this.sessionConfig = null;
        this.setState('disconnected');
        if (wasPending) this.emitError(message);
      };

      ws.onerror = () => fail('Gemini WebSocket connection error');
      ws.onmessage = (ev) => {
        this.handleServerMessage(ev.data, ws, () => {
          if (settled) return;
          finish();
          this.setState('connected');
        }, fail);
      };
    });
  }

  sendAudio(pcm16: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.cancelPendingConnect) return;

    const base64 = this.arrayBufferToBase64(pcm16);
    const sampleRate = this.sessionConfig?.config.sampleRate || 16000;

    const message = {
      realtimeInput: {
        audio: {
          mimeType: `audio/pcm;rate=${sampleRate}`,
          data: base64,
        },
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  sendTextMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.cancelPendingConnect) return;

    const message = {
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    };

    this.ws.send(JSON.stringify(message));
  }

  sendInitialGreeting(language: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.cancelPendingConnect) return;

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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.cancelPendingConnect) return;

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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.cancelPendingConnect) return;

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
    this.cancelPendingConnect?.();
    this.cancelPendingConnect = null;
    if (this.ws) {
      const ws = this.ws;
      this.detachSocket(ws);
      this.ws = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
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

  private detachSocket(ws: WebSocket): void {
    ws.onopen = null;
    ws.onclose = null;
    ws.onerror = null;
    ws.onmessage = null;
  }

  private sendSetupMessage(): void {
    if (!this.ws || !this.sessionConfig) return;

    const cfg = this.sessionConfig.config;
    const setup = {
      setup: {
        model: this.sessionConfig.model,
        generationConfig: {
          responseModalities: ['AUDIO'],
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
        outputAudioTranscription: {},
      },
    };

    console.log('[GeminiProvider] Sending setup message');
    this.ws.send(JSON.stringify(setup));
  }

  private handleServerMessage(
    rawData: string | Blob,
    ws: WebSocket,
    onSetupComplete: () => void,
    onServerError: (message: string) => void,
  ): void {
    const parse = (text: string) => {
      // A Blob may finish decoding after disconnect or a replacement connection.
      if (this.ws === ws) this.parseServerMessage(text, onSetupComplete, onServerError);
    };
    if (rawData instanceof Blob) {
      rawData.text().then(parse).catch(() => {
        if (this.ws === ws) onServerError('Failed to read Gemini server message');
      });
    } else {
      parse(rawData);
    }
  }

  private parseServerMessage(
    text: string,
    onSetupComplete: () => void,
    onServerError: (message: string) => void,
  ): void {
    try {
      const msg = JSON.parse(text);

      if (msg.error) {
        onServerError(msg.error.message || 'Gemini server error');
        return;
      }

      if (msg.setupComplete) {
        console.log('[GeminiProvider] Setup complete');
        onSetupComplete();
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
          }
        }

        // Spoken text comes from output transcription; model parts may contain thoughts.
        if (content.outputTranscription?.text) {
          this.emitTranscript(content.outputTranscription.text, false);
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
