/**
 * AI Provider Types
 *
 * Defines types for AI provider abstraction (Google Gemini / OpenAI Realtime)
 */

// Supported AI providers
export type AIProvider = 'gemini' | 'openai';

// Base session configuration shared by all providers
export interface BaseSessionConfig {
  provider: AIProvider;
  model: string;
  wsEndpoint: string;
  apiKey: string;
  mockMode: boolean;
  config: {
    voice: string;
    language: string;
    systemPrompt: string;
  };
}

// Gemini-specific session configuration
export interface GeminiSessionConfig extends BaseSessionConfig {
  provider: 'gemini';
  config: {
    voice: string;
    language: string;
    systemPrompt: string;
    sampleRate: number;
    responseModalities: string[];
  };
}

// OpenAI-specific session configuration
export interface OpenAISessionConfig extends BaseSessionConfig {
  provider: 'openai';
  config: {
    voice: string;
    language: string;
    systemPrompt: string;
    inputSampleRate: number;
    outputSampleRate: number;
    modalities: string[];
    turnDetection: {
      type: string;
      threshold: number;
      prefixPaddingMs: number;
      silenceDurationMs: number;
    };
  };
}

// Union type for all session configs
export type AISessionConfig = GeminiSessionConfig | OpenAISessionConfig;

// Audio configuration per provider
export interface AudioConfig {
  inputSampleRate: number;  // Gemini: 16000, OpenAI: 24000
  outputSampleRate: number; // Both: 24000
}

// Provider-specific audio configs
export const PROVIDER_AUDIO_CONFIG: Record<AIProvider, AudioConfig> = {
  gemini: {
    inputSampleRate: 16000,
    outputSampleRate: 24000,
  },
  openai: {
    inputSampleRate: 24000,
    outputSampleRate: 24000,
  },
};

// OpenAI available voices
export type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

// Gemini available voices
export type GeminiVoice = 'Aoede' | 'Charon' | 'Fenrir' | 'Kore' | 'Leda' | 'Puck';

// Voice mapping from Gemini to OpenAI
export const GEMINI_TO_OPENAI_VOICE: Record<GeminiVoice, OpenAIVoice> = {
  'Aoede': 'shimmer',
  'Charon': 'echo',
  'Fenrir': 'onyx',
  'Kore': 'alloy',
  'Leda': 'nova',
  'Puck': 'fable',
};
