import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';
import { Client } from '@upstash/qstash';

/**
 * Unified Retry API
 * Handles agent call retry operations
 *
 * Actions:
 * - POST ?action=schedule  : Schedule a retry (from schedule-retry.ts)
 * - POST ?action=execute   : Execute a scheduled retry (from execute-retry.ts)
 */

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
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
      case 'schedule':
        return await handleSchedule(request, response);
      case 'execute':
        return await handleExecute(request, response);
      default:
        return response.status(400).json({
          success: false,
          error: 'Invalid action'
        });
    }
  } catch (error: any) {
    console.error('[Retry API] Error:', error);
    return response.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}

/**
 * Handle Schedule Retry
 * POST /api/retry?action=schedule
 */
async function handleSchedule(
  request: VercelRequest,
  response: VercelResponse
): Promise<VercelResponse> {
  try {
    const { sid, userId } = request.body;

    if (!sid) {
      return response.status(400).json({
        success: false,
        error: 'Missing required field: sid'
      });
    }

    console.log('[Retry API] schedule request:', { sid, userId });

    const sessionResult = await sql`
      SELECT
        sid,
        caller_user_id,
        callee_user_id,
        audio_file_ids,
        language,
        retry_count,
        status
      FROM agent_call_sessions
      WHERE sid = ${sid}
    `;

    if (sessionResult.rowCount === 0) {
      return response.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    const session = sessionResult.rows[0];

    if (userId && userId !== session.callee_user_id) {
      return response.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }

    if (session.retry_count >= 3) {
      return response.status(400).json({
        success: false,
        error: 'Maximum retry attempts reached',
        message: '최대 재시도 횟수에 도달했습니다.'
      });
    }

    const existingRetryResult = await sql`
      SELECT id, scheduled_at, status
      FROM agent_call_retry_queue
      WHERE original_sid = ${sid}
        AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (existingRetryResult.rowCount > 0) {
      const existingRetry = existingRetryResult.rows[0];
      const scheduledAt = new Date(existingRetry.scheduled_at);

      return response.status(200).json({
        success: true,
        alreadyScheduled: true,
        message: '이미 재시도가 예약되어 있습니다.',
        scheduledAt: scheduledAt.toISOString()
      });
    }

    const scheduledAt = new Date(Date.now() + 5 * 60 * 1000);

    const retryResult = await sql`
      INSERT INTO agent_call_retry_queue (
        original_sid,
        callee_user_id,
        audio_file_ids,
        language,
        scheduled_at,
        status,
        retry_attempt,
        data
      ) VALUES (
        ${sid},
        ${session.callee_user_id},
        ${JSON.stringify(session.audio_file_ids)},
        ${session.language || 'ko'},
        ${scheduledAt.toISOString()},
        'pending',
        ${session.retry_count + 1},
        ${JSON.stringify({
          caller_user_id: session.caller_user_id,
          scheduled_by: 'user'
        })}
      )
      RETURNING id, scheduled_at
    `;

    const retry = retryResult.rows[0];

    await sql`
      UPDATE agent_call_sessions
      SET
        status = 'retry_scheduled',
        retry_scheduled_at = ${scheduledAt.toISOString()},
        data = COALESCE(data, '{}'::jsonb) || ${JSON.stringify({
          retry_queue_id: retry.id,
          retry_scheduled_at: scheduledAt.toISOString()
        })}::jsonb
      WHERE sid = ${sid}
    `;

    console.log('[Retry API] Retry scheduled:', {
      queueId: retry.id,
      scheduledAt: scheduledAt.toISOString()
    });

    const baseUrl = request.headers.origin || `https://${request.headers.host}`;

    try {
      const qstashToken = process.env.QSTASH_TOKEN;
      if (qstashToken) {
        const qstash = new Client({ token: qstashToken });

        await qstash.publishJSON({
          url: `${baseUrl}/api/retry?action=execute`,
          body: {
            queueId: retry.id,
            originalSid: sid,
            calleeUserId: session.callee_user_id,
            audioFileIds: session.audio_file_ids,
            language: session.language || 'ko',
            retryAttempt: session.retry_count + 1
          },
          delay: 300
        });

        console.log('[Retry API] QStash scheduled successfully');
      } else {
        console.warn('[Retry API] QSTASH_TOKEN not configured, skipping automatic execution');
      }
    } catch (qstashError: any) {
      console.error('[Retry API] Failed to schedule QStash:', qstashError);
    }

    try {
      await sendScheduleConfirmationMessage({
        calleeUserId: session.callee_user_id,
        scheduledAt: scheduledAt,
        language: session.language || 'ko',
        baseUrl
      });
    } catch (msgError: any) {
      console.error('[Retry API] Failed to send confirmation message:', msgError);
    }

    return response.status(200).json({
      success: true,
      queueId: retry.id,
      scheduledAt: scheduledAt.toISOString(),
      message: '5분 후 다시 전화를 드리겠습니다.'
    });
  } catch (error: any) {
    console.error('[Retry API] Error in schedule:', error);
    throw error;
  }
}

/**
 * Handle Execute Retry
 * POST /api/retry?action=execute
 */
async function handleExecute(
  request: VercelRequest,
  response: VercelResponse
): Promise<VercelResponse> {
  try {
    const {
      queueId,
      originalSid,
      calleeUserId,
      audioFileIds,
      language,
      retryAttempt
    } = request.body;

    console.log('[Retry API] execute request:', {
      queueId,
      originalSid,
      calleeUserId,
      retryAttempt
    });

    const retryCheck = await sql`
      SELECT status
      FROM agent_call_retry_queue
      WHERE id = ${queueId}
    `;

    if (retryCheck.rowCount === 0) {
      console.warn('[Retry API] Retry not found:', queueId);
      return response.status(404).json({
        success: false,
        error: 'Retry not found'
      });
    }

    if (retryCheck.rows[0].status !== 'pending') {
      console.log('[Retry API] Retry already processed:', retryCheck.rows[0].status);
      return response.status(200).json({
        success: true,
        message: 'Retry already processed'
      });
    }

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const activeCallResult = await sql`
      SELECT sid, status, created_at
      FROM agent_call_sessions
      WHERE callee_user_id = ${calleeUserId}
        AND status IN ('ringing', 'answered', 'initiated')
        AND created_at > ${twoMinutesAgo.toISOString()}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (activeCallResult.rowCount > 0) {
      console.log(`[Retry API] User ${calleeUserId} is in active call (${activeCallResult.rows[0].status}), skipping`);

      await sql`
        UPDATE agent_call_retry_queue
        SET
          status = 'failed',
          executed_at = NOW(),
          error_message = 'User in active call'
        WHERE id = ${queueId}
      `;

      return response.status(200).json({
        success: false,
        message: 'User is currently in an active call'
      });
    }

    const origSessionResult = await sql`
      SELECT caller_service_id, callee_service_id
      FROM agent_call_sessions
      WHERE sid = ${originalSid}
      LIMIT 1
    `;

    const serviceId = origSessionResult.rows[0]?.callee_service_id || process.env.VITE_PLANETKIT_EVAL_SERVICE_ID;

    const baseUrl = request.headers.origin || `https://${request.headers.host}`;
    const initiateUrl = `${baseUrl}/api/agent-call?action=initiate`;

    const initiateResponse = await fetch(initiateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        toUserId: calleeUserId,
        toServiceId: serviceId,
        callerUserId: 'AGENT',
        callerServiceId: serviceId,
        audioFileIds: audioFileIds,
        language: language || 'ko',
        isRetry: true,
        parentSid: originalSid,
        retryAttempt: retryAttempt
      }),
    });

    if (!initiateResponse.ok) {
      const errorText = await initiateResponse.text();
      throw new Error(`Failed to initiate call: ${initiateResponse.status} ${errorText}`);
    }

    const initiateData = await initiateResponse.json();
    const newSid = initiateData.sid;

    console.log(`[Retry API] Successfully initiated retry call, new SID: ${newSid}`);

    await sql`
      UPDATE agent_call_retry_queue
      SET
        status = 'completed',
        retry_sid = ${newSid},
        executed_at = NOW()
      WHERE id = ${queueId}
    `;

    await sql`
      UPDATE agent_call_sessions
      SET
        retry_count = retry_count + 1
      WHERE sid = ${originalSid}
    `;

    return response.status(200).json({
      success: true,
      message: 'Retry executed successfully',
      newSid
    });

  } catch (error: any) {
    console.error('[Retry API] Error in execute:', error);

    try {
      const { queueId } = request.body;
      if (queueId) {
        await sql`
          UPDATE agent_call_retry_queue
          SET
            status = 'failed',
            executed_at = NOW(),
            error_message = ${error.message || 'Unknown error'}
          WHERE id = ${queueId}
        `;
      }
    } catch (dbError) {
      console.error('[Retry API] Failed to update retry status:', dbError);
    }

    throw error;
  }
}

async function sendScheduleConfirmationMessage(params: {
  calleeUserId: string;
  scheduledAt: Date;
  language: string;
  baseUrl: string;
}) {
  const { calleeUserId, scheduledAt, language, baseUrl } = params;

  try {
    const tokenUrl = `${baseUrl}/api/line?action=get-token`;
    const tokenResponse = await fetch(tokenUrl);

    if (!tokenResponse.ok) {
      throw new Error(`Failed to get LINE token: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    const channelAccessToken = tokenData.access_token;

    if (!channelAccessToken) {
      throw new Error('Invalid token response');
    }

    const messageText = language === 'ko'
      ? `✅ 재시도가 예약되었습니다.\n\n약 5분 후에 통화 요청이 도착합니다.\n잠시만 기다려주세요.`
      : `✅ Retry scheduled.\n\nYou will receive a call in about 5 minutes.\nPlease wait.`;

    const lineApiResponse = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: calleeUserId,
        messages: [
          {
            type: 'text',
            text: messageText
          }
        ],
      }),
    });

    if (!lineApiResponse.ok) {
      const errorText = await lineApiResponse.text();
      console.error('[Retry API] Failed to send LINE message:', errorText);
      throw new Error(`LINE API error: ${errorText}`);
    }

    console.log('[Retry API] Confirmation message sent successfully');
  } catch (error: any) {
    console.error('[Retry API] Error sending confirmation:', error);
    throw error;
  }
}
