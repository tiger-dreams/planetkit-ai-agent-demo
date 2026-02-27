import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';

/**
 * Unified Agent Call API
 * Handles Agent Call database initialization and call initiation
 *
 * Actions:
 * - GET  ?action=init-db   : Initialize database tables
 * - POST ?action=initiate  : Initiate agent call
 */

interface AgentCallInitiateRequest {
  toUserId: string;
  toServiceId: string;
  callerUserId: string;
  callerServiceId: string;
  audioFileIds: string[];
  language?: 'ko' | 'en';
  isRetry?: boolean;
  parentSid?: string;
  retryAttempt?: number;
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  // CORS headers
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  const action = request.query.action as string;

  if (!action) {
    return response.status(400).json({
      success: false,
      error: 'Missing action parameter'
    });
  }

  try {
    switch (action) {
      case 'init-db':
        return await handleInitDatabase(request, response);
      case 'initiate':
        return await handleInitiate(request, response);
      default:
        return response.status(400).json({
          success: false,
          error: 'Invalid action'
        });
    }
  } catch (error: any) {
    console.error('[Agent Call] Error:', error);
    return response.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}

/**
 * Initialize Database Tables
 * GET /api/agent-call?action=init-db
 */
async function handleInitDatabase(
  request: VercelRequest,
  response: VercelResponse
): Promise<VercelResponse> {
  if (request.method !== 'GET') {
    return response.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  console.log('[Agent Call] Initializing database tables...');

  // Create agent_call_sessions table
  await sql`
    CREATE TABLE IF NOT EXISTS agent_call_sessions (
      id SERIAL PRIMARY KEY,
      sid VARCHAR(200) UNIQUE NOT NULL,
      caller_user_id VARCHAR(200) NOT NULL,
      callee_user_id VARCHAR(200) NOT NULL,
      caller_service_id VARCHAR(100),
      callee_service_id VARCHAR(100),
      room_id VARCHAR(200),
      status VARCHAR(50) NOT NULL DEFAULT 'initiated',
      audio_file_ids JSONB,
      language VARCHAR(10),
      created_at TIMESTAMP DEFAULT NOW(),
      answered_at TIMESTAMP NULL,
      ended_at TIMESTAMP NULL,
      data JSONB
    )
  `;

  // Create indexes for agent_call_sessions
  await sql`
    CREATE INDEX IF NOT EXISTS idx_agent_call_sessions_sid
    ON agent_call_sessions(sid)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_agent_call_sessions_callee
    ON agent_call_sessions(callee_user_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_agent_call_sessions_status
    ON agent_call_sessions(status)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_agent_call_sessions_created_at
    ON agent_call_sessions(created_at DESC)
  `;

  // Create agent_call_events table
  await sql`
    CREATE TABLE IF NOT EXISTS agent_call_events (
      id SERIAL PRIMARY KEY,
      sid VARCHAR(200) NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      status VARCHAR(50),
      timestamp BIGINT,
      created_at TIMESTAMP DEFAULT NOW(),
      data JSONB
    )
  `;

  // Create indexes for agent_call_events
  await sql`
    CREATE INDEX IF NOT EXISTS idx_agent_call_events_sid
    ON agent_call_events(sid)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_agent_call_events_type
    ON agent_call_events(event_type)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_agent_call_events_created_at
    ON agent_call_events(created_at DESC)
  `;

  // Add retry-related columns
  try {
    await sql`
      ALTER TABLE agent_call_sessions
      ADD COLUMN IF NOT EXISTS timeout_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS timeout_notification_sent BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS retry_scheduled_at TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS parent_sid VARCHAR(200) NULL,
      ADD COLUMN IF NOT EXISTS is_retry BOOLEAN DEFAULT FALSE
    `;
  } catch (alterError: any) {
    console.warn('[Agent Call] Error adding retry columns (may already exist):', alterError.message);
  }

  // Create indexes for retry columns
  await sql`
    CREATE INDEX IF NOT EXISTS idx_agent_call_sessions_timeout_at
    ON agent_call_sessions(timeout_at)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_agent_call_sessions_retry_scheduled
    ON agent_call_sessions(retry_scheduled_at)
    WHERE retry_scheduled_at IS NOT NULL AND status = 'missed'
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_agent_call_sessions_parent_sid
    ON agent_call_sessions(parent_sid)
  `;

  // Create agent_call_retry_queue table
  await sql`
    CREATE TABLE IF NOT EXISTS agent_call_retry_queue (
      id SERIAL PRIMARY KEY,
      original_sid VARCHAR(200) NOT NULL,
      retry_sid VARCHAR(200) NULL,
      callee_user_id VARCHAR(200) NOT NULL,
      audio_file_ids JSONB NOT NULL,
      language VARCHAR(10) DEFAULT 'ko',
      scheduled_at TIMESTAMP NOT NULL,
      executed_at TIMESTAMP NULL,
      status VARCHAR(50) DEFAULT 'pending',
      retry_attempt INTEGER DEFAULT 1,
      error_message TEXT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      data JSONB
    )
  `;

  // Create indexes for agent_call_retry_queue
  await sql`
    CREATE INDEX IF NOT EXISTS idx_retry_queue_scheduled
    ON agent_call_retry_queue(scheduled_at)
    WHERE status = 'pending'
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_retry_queue_original_sid
    ON agent_call_retry_queue(original_sid)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_retry_queue_callee
    ON agent_call_retry_queue(callee_user_id)
  `;

  console.log('[Agent Call] Database initialized successfully');

  return response.status(200).json({
    success: true,
    message: 'Agent Call database initialized successfully',
    tables: ['agent_call_sessions', 'agent_call_events', 'agent_call_retry_queue']
  });
}

/**
 * Initiate Agent Call
 * POST /api/agent-call?action=initiate
 */
async function handleInitiate(
  request: VercelRequest,
  response: VercelResponse
): Promise<VercelResponse> {
  if (request.method !== 'POST') {
    return response.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  const body: AgentCallInitiateRequest = request.body;
  const {
    toUserId,
    toServiceId,
    callerUserId,
    callerServiceId,
    audioFileIds,
    language = 'ko',
    isRetry = false,
    parentSid,
    retryAttempt
  } = body;

  console.log('[Agent Call] Initiate request:', {
    toUserId,
    toServiceId,
    callerUserId,
    audioFileIds,
    language,
    isRetry,
    parentSid,
    retryAttempt
  });

  // Validation
  if (!toUserId || !toServiceId) {
    return response.status(400).json({
      success: false,
      error: 'Missing required fields: toUserId, toServiceId'
    });
  }

  // Check if Mock Mode is enabled
  const MOCK_MODE = process.env.PLANETKIT_AGENT_CALL_MOCK_MODE === 'true';

  let sid: string;
  let planetKitResponse: any = null;

  if (MOCK_MODE) {
    // Mock Mode: Generate mock SID
    sid = `mock-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    console.log('[Agent Call] MOCK MODE: Generated mock SID:', sid);
  } else {
    // Real Mode: Call PlanetKit Agent Call API
    const baseUrl = process.env.PLANETKIT_AGENT_CALL_BASE_URL;
    const apiKey = process.env.VITE_PLANETKIT_EVAL_API_KEY;
    const apiSecret = process.env.VITE_PLANETKIT_EVAL_API_SECRET;

    if (!baseUrl || !apiKey || !apiSecret) {
      return response.status(500).json({
        success: false,
        error: 'PlanetKit Agent Call API credentials not configured (PLANETKIT_AGENT_CALL_BASE_URL, API_KEY, API_SECRET)'
      });
    }

    const apiUrl = `${baseUrl}/tas/v2/agt_call/audio_caller/${toServiceId}/${toUserId}`;
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

    const planetKitBody = {
      requestContext: {
        userId: callerUserId,
        serviceId: callerServiceId
      },
      mediaSourceType: 'STORED_SOURCE',
      storedSource: {
        storedAudioSources: audioFileIds.map(contentId => ({ contentId })),
        playWaitTime: 1000,
        playCount: 1
      },
      recordOnCloud: false,
      useResponderPreparation: false
    };

    console.log('[Agent Call] Calling PlanetKit API:', apiUrl);

    try {
      const planetKitRes = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(planetKitBody)
      });

      if (!planetKitRes.ok) {
        const errorText = await planetKitRes.text();
        console.error('[Agent Call] PlanetKit API error:', planetKitRes.status, errorText);
        return response.status(planetKitRes.status).json({
          success: false,
          error: `PlanetKit API error: ${planetKitRes.status} ${errorText}`
        });
      }

      planetKitResponse = await planetKitRes.json();
      sid = planetKitResponse.sid || planetKitResponse.data?.sid;

      if (!sid) {
        console.error('[Agent Call] No SID in PlanetKit response:', planetKitResponse);
        return response.status(500).json({
          success: false,
          error: 'No SID returned from PlanetKit API'
        });
      }

      console.log('[Agent Call] PlanetKit API success, SID:', sid);
    } catch (fetchError: any) {
      console.error('[Agent Call] Error calling PlanetKit API:', fetchError);
      return response.status(500).json({
        success: false,
        error: `Failed to call PlanetKit API: ${fetchError.message}`
      });
    }
  }

  // Store session in database
  try {
    await sql`
      INSERT INTO agent_call_sessions (
        sid,
        caller_user_id,
        callee_user_id,
        caller_service_id,
        callee_service_id,
        room_id,
        status,
        audio_file_ids,
        language,
        is_retry,
        parent_sid,
        retry_count,
        data
      ) VALUES (
        ${sid},
        ${callerUserId},
        ${toUserId},
        ${callerServiceId},
        ${toServiceId},
        ${sid},
        'initiated',
        ${JSON.stringify(audioFileIds)},
        ${language},
        ${isRetry},
        ${parentSid || null},
        ${retryAttempt || 0},
        ${JSON.stringify({ mock: MOCK_MODE, planetKitResponse, isRetry, parentSid, retryAttempt })}
      )
    `;

    console.log('[Agent Call] Session stored in database:', { sid, isRetry, parentSid, retryAttempt });
  } catch (dbError: any) {
    console.error('[Agent Call] Database error:', dbError);
    return response.status(500).json({
      success: false,
      error: `Failed to store session: ${dbError.message}`
    });
  }

  console.log('[Agent Call] Agent Call initiated successfully');

  return response.status(200).json({
    success: true,
    sid,
    mock: MOCK_MODE,
    message: 'Agent call initiated. Notify callback will send LINE message with cc_param.'
  });
}
