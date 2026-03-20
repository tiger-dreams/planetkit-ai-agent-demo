import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * AI Agent Session API
 * Returns AI provider configuration for WebSocket connections.
 * Supports Google Gemini 2.0 Live API and OpenAI Realtime API.
 * Falls back to mock mode when API keys are not configured.
 *
 * POST /api/ai-agent-session
 *   - Body: { language, voice, systemPrompt, provider }
 *   - Returns: { provider, model, wsEndpoint, apiKey, config } or { mockMode: true, message }
 */

// Provider type
type AIProvider = 'gemini' | 'openai';

// Gemini voices
// - Aoede: Female, warm tone | Charon: Male, deep tone | Fenrir: Male, authoritative
// - Kore: Female, bright tone | Leda: Female, gentle tone | Puck: Male, energetic
// Recommended for zh-TW (Traditional Chinese): Leda (female), Charon (male)
// Recommended for th (Thai): Puck (male), Aoede (female)
const GEMINI_VOICES = ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Leda', 'Puck'] as const;
type GeminiVoice = typeof GEMINI_VOICES[number];

// OpenAI voices
// - alloy: Female, neutral | ash: Male, natural | echo: Male, warm
// - fable: Male, British | onyx: Male, deep (deprecated) | nova: Female, friendly | shimmer: Female, soft
// Recommended for zh-TW (Traditional Chinese): nova (female), ash (male)
// Recommended for th (Thai): nova (female), ash (male)
const OPENAI_VOICES = ['alloy', 'ash', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
type OpenAIVoice = typeof OPENAI_VOICES[number];

// Voice mapping from Gemini to OpenAI
const GEMINI_TO_OPENAI_VOICE: Record<GeminiVoice, OpenAIVoice> = {
  'Aoede': 'shimmer',
  'Charon': 'echo',
  'Fenrir': 'onyx',
  'Kore': 'ash',
  'Leda': 'nova',
  'Puck': 'fable',
};

interface SessionRequest {
  language?: 'ko' | 'en';
  voice?: string;
  systemPrompt?: string;
  provider?: AIProvider;
}

function validateGeminiVoice(voice: string | undefined): GeminiVoice {
  if (voice && GEMINI_VOICES.includes(voice as GeminiVoice)) {
    return voice as GeminiVoice;
  }
  return 'Aoede';
}

function validateOpenAIVoice(voice: string | undefined): OpenAIVoice {
  if (voice && OPENAI_VOICES.includes(voice as OpenAIVoice)) {
    return voice as OpenAIVoice;
  }
  return 'ash';
}

function mapGeminiVoiceToOpenAI(geminiVoice: GeminiVoice): OpenAIVoice {
  return GEMINI_TO_OPENAI_VOICE[geminiVoice] || 'ash';
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  // CORS headers
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const body: SessionRequest = request.body || {};
  const language = body.language || 'ko';
  const provider: AIProvider = body.provider || 'gemini';

  const defaultSystemPrompt = language === 'ko'
    ? '당신은 전문 심리치료사 "해밀"입니다. 사용자의 마음을 공감하며 들어주고, 따뜻하고 차분한 여성의 어조로 상담을 진행하세요. 전문적인 심리학 지식을 바탕으로 치유에 도움이 되는 조언을 제공하세요. 응답은 대화의 흐름을 방해하지 않도록 짧고 간결하게 유지하세요.'
    : 'You are "Haemil," a professional psychotherapist. Listen with deep empathy and conduct the session in a warm, calm female tone. Provide helpful advice based on psychological expertise. Keep responses concise to maintain natural conversation flow.';

  const systemPrompt = body.systemPrompt || defaultSystemPrompt;

  console.log(`[AI Agent Session] Provider requested: ${provider}`);

  // Handle OpenAI provider
  if (provider === 'openai') {
    const openaiApiKey = process.env.OPENAI_API_KEY;

    if (!openaiApiKey) {
      console.log('[AI Agent Session] No OPENAI_API_KEY configured, returning mock mode');
      return response.status(200).json({
        mockMode: true,
        message: 'OpenAI API key not configured. Using mock mode.',
        config: { language, provider, systemPrompt }
      });
    }

    // Validate or map voice for OpenAI
    const geminiVoice = validateGeminiVoice(body.voice);
    const openaiVoice = OPENAI_VOICES.includes(body.voice as OpenAIVoice)
      ? (body.voice as OpenAIVoice)
      : mapGeminiVoiceToOpenAI(geminiVoice);

    console.log('[AI Agent Session] Returning OpenAI Realtime API configuration');

    return response.status(200).json({
      mockMode: false,
      provider: 'openai',
      model: 'gpt-4o-realtime-preview',
      wsEndpoint: 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview',
      apiKey: openaiApiKey,
      config: {
        voice: openaiVoice,
        language,
        systemPrompt,
        inputSampleRate: 24000,
        outputSampleRate: 24000,
        modalities: ['text', 'audio'],
        turnDetection: {
          type: 'server_vad',
          threshold: 0.5,
          prefixPaddingMs: 200,
          silenceDurationMs: 300,
        },
      }
    });
  }

  // Handle Gemini provider (default)
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const voice = validateGeminiVoice(body.voice);

  if (!geminiApiKey) {
    console.log('[AI Agent Session] No GEMINI_API_KEY configured, returning mock mode');
    return response.status(200).json({
      mockMode: true,
      message: 'Gemini API key not configured. Using mock mode.',
      config: { language, voice, provider, systemPrompt }
    });
  }

  try {
    console.log('[AI Agent Session] Returning Gemini 2.0 Live API configuration');

    return response.status(200).json({
      mockMode: false,
      provider: 'gemini',
      model: 'models/gemini-2.5-flash-native-audio-latest',
      wsEndpoint: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
      apiKey: geminiApiKey,
      config: {
        voice,
        language,
        systemPrompt,
        sampleRate: 16000,
        responseModalities: ['AUDIO'],
      }
    });
  } catch (error: any) {
    console.error('[AI Agent Session] Error:', error);
    return response.status(500).json({
      error: 'Failed to create AI agent session',
      details: error.message
    });
  }
}
