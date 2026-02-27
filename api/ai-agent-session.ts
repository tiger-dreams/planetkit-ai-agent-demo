import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * AI Agent Session API
 * Returns Gemini 2.0 Multimodal Live API configuration for WebSocket connections.
 * Falls back to mock mode when GEMINI_API_KEY is not configured.
 *
 * POST /api/ai-agent-session
 *   - Returns WebSocket endpoint and config for Gemini 2.0 Live API
 *   - Returns: { provider, model, wsEndpoint, apiKey, config } or { mockMode: true, message }
 */

const GEMINI_VOICES = ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Leda', 'Puck'] as const;
type GeminiVoice = typeof GEMINI_VOICES[number];

interface SessionRequest {
  language?: 'ko' | 'en';
  voice?: string;
  systemPrompt?: string;
}

function validateVoice(voice: string | undefined): GeminiVoice {
  if (voice && GEMINI_VOICES.includes(voice as GeminiVoice)) {
    return voice as GeminiVoice;
  }
  return 'Aoede';
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

  const apiKey = process.env.GEMINI_API_KEY;
  const body: SessionRequest = request.body || {};
  const language = body.language || 'ko';
  const voice = validateVoice(body.voice);

  const defaultSystemPrompt = language === 'ko'
    ? '당신은 전문 심리치료사 "해밀"입니다. 사용자의 마음을 공감하며 들어주고, 따뜻하고 차분한 여성의 어조로 상담을 진행하세요. 전문적인 심리학 지식을 바탕으로 치유에 도움이 되는 조언을 제공하세요. 응답은 대화의 흐름을 방해하지 않도록 짧고 간결하게 유지하세요.'
    : 'You are "Haemil," a professional psychotherapist. Listen with deep empathy and conduct the session in a warm, calm female tone. Provide helpful advice based on psychological expertise. Keep responses concise to maintain natural conversation flow.';

  const systemPrompt = body.systemPrompt || defaultSystemPrompt;

  // If no API key, return mock mode indicator
  if (!apiKey) {
    console.log('[AI Agent Session] No GEMINI_API_KEY configured, returning mock mode');
    return response.status(200).json({
      mockMode: true,
      message: 'Gemini API key not configured. Using mock mode.',
      config: { language, voice, systemPrompt }
    });
  }

  try {
    console.log('[AI Agent Session] Returning Gemini 2.0 Live API configuration');

    return response.status(200).json({
      mockMode: false,
      provider: 'gemini',
      model: 'models/gemini-2.5-flash-native-audio-latest',
      wsEndpoint: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
      apiKey,
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
