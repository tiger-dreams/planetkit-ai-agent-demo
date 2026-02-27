import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';

/**
 * Unified Callback API
 * Handles all PlanetKit callback operations
 *
 * Actions:
 * - GET/POST ?action=agent-call        : Agent call status callback (from agent-call-callback.ts)
 * - GET     ?action=notify            : Agent call notify callback (from notify-callback.ts)
 * - GET/POST ?action=one-to-one-call  : 1-to-1 call lifecycle callback (from one-to-one-call-callback.ts)
 * - GET/POST ?action=planetkit        : PlanetKit group call callback (from planetkit-callback.ts)
 */

interface PlanetKitCallback {
  eventType: string;
  serviceId?: string;
  roomId?: string;
  userId?: string;
  displayName?: string;
  timestamp?: number;
  [key: string]: any;
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
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
      case 'agent-call':
        return await handleAgentCallCallback(request, response);
      case 'notify':
        return await handleNotifyCallback(request, response);
      case 'one-to-one-call':
        return await handleOneToOneCallback(request, response);
      case 'planetkit':
        return await handlePlanetKitCallback(request, response);
      default:
        return response.status(400).json({
          success: false,
          error: 'Invalid action'
        });
    }
  } catch (error: any) {
    console.error('[Callback API] Error:', error);
    return response.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}

/**
 * Handle Agent Call Status Callback
 * GET/POST /api/callback?action=agent-call
 */
async function handleAgentCallCallback(
  request: VercelRequest,
  response: VercelResponse
): Promise<VercelResponse> {
  try {
    const data = request.method === 'GET' ? request.query : request.body;

    const {
      sid,
      result,
      fail_reason,
      timestamp,
      param,
      ...additionalData
    } = data;

    console.log('[Callback API] agent-call received:', {
      sid,
      result,
      fail_reason,
      timestamp,
      param,
      method: request.method,
    });

    if (!sid) {
      return response.status(400).json({
        success: false,
        error: 'Missing required field: sid'
      });
    }

    const newStatus = result === 'SUCCESS' ? 'ringing' : 'failed';

    try {
      const updateResult = await sql`
        UPDATE agent_call_sessions
        SET
          status = ${newStatus},
          data = COALESCE(data, '{}'::jsonb) || ${JSON.stringify({
            result,
            fail_reason,
            timestamp,
            callback_received_at: Date.now()
          })}::jsonb
        WHERE sid = ${sid}
        RETURNING id
      `;

      if (updateResult.rowCount === 0) {
        console.warn('[Callback API] agent-call: No session found with SID:', sid);
      } else {
        console.log('[Callback API] agent-call: Updated session status to:', newStatus);
      }
    } catch (dbError: any) {
      console.error('[Callback API] agent-call: Database update error:', dbError);
    }

    try {
      await sql`
        INSERT INTO agent_call_events (
          sid,
          event_type,
          status,
          timestamp,
          data
        ) VALUES (
          ${sid},
          'agent_call_status',
          ${result},
          ${timestamp ? parseInt(timestamp.toString()) : Date.now()},
          ${JSON.stringify({
            result,
            fail_reason,
            ...additionalData
          })}
        )
      `;

      console.log('[Callback API] agent-call: Event logged successfully');
    } catch (eventError: any) {
      console.error('[Callback API] agent-call: Error logging event:', eventError);
    }

    return response.status(200).json({
      success: true,
      message: 'Callback processed successfully'
    });
  } catch (error: any) {
    console.error('[Callback API] Error in agent-call:', error);
    throw error;
  }
}

/**
 * Handle Notify Callback
 * GET /api/callback?action=notify
 */
async function handleNotifyCallback(
  request: VercelRequest,
  response: VercelResponse
): Promise<VercelResponse> {
  if (request.method !== 'GET') {
    return response.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET.'
    });
  }

  try {
    const {
      sid,
      from_service_id,
      from_user_id,
      to_service_id,
      to_user_id,
      type,
      param,
      stid,
      app_svr_data
    } = request.query;

    console.log('[Callback API] notify received:', {
      sid,
      from_service_id,
      from_user_id,
      to_service_id,
      to_user_id,
      type,
      param: param ? `${String(param).substring(0, 20)}...` : null,
      stid,
      app_svr_data,
    });

    if (!sid || !param) {
      console.error('[Callback API] notify: Missing required fields:', { sid, hasParam: !!param });
      return response.status(400).json({
        success: false,
        error: 'Missing required fields: sid, param'
      });
    }

    let sessionLanguage = 'en';
    try {
      const sessionResult = await sql`
        SELECT language FROM agent_call_sessions WHERE sid = ${sid}
      `;

      if (sessionResult.rowCount > 0 && sessionResult.rows[0].language) {
        sessionLanguage = sessionResult.rows[0].language;
      }

      await sql`
        UPDATE agent_call_sessions
        SET
          data = COALESCE(data, '{}'::jsonb) || ${JSON.stringify({
            cc_param: param,
            from_service_id,
            from_user_id,
            to_service_id,
            to_user_id,
            call_type: type,
            notify_received_at: Date.now()
          })}::jsonb
        WHERE sid = ${sid}
      `;

      console.log('[Callback API] notify: Updated session with cc_param for SID:', sid, 'language:', sessionLanguage);
    } catch (dbError: any) {
      console.error('[Callback API] notify: Database update error:', dbError);
    }

    const baseUrl = request.headers.origin || `https://${request.headers.host}`;
    const liffId = process.env.VITE_LIFF_ID;

    if (!liffId) {
      console.warn('[Callback API] notify: LIFF ID not configured, cannot send LINE message');
      return response.status(200).json({
        success: true,
        message: 'Notify callback received but LINE message not sent (LIFF ID missing)'
      });
    }

    const deepLink = `https://liff.line.me/${liffId}/agent-call-meeting?sid=${encodeURIComponent(String(sid))}&cc_param=${encodeURIComponent(String(param))}&autoAccept=true`;

    const isKorean = sessionLanguage === 'ko';
    const messageText = isKorean
      ? `📞 전화가 왔습니다!\n\n60초 이내에 수락해주세요.`
      : `📞 Incoming call!\n\nPlease accept within 60 seconds.`;

    const buttonText = isKorean ? '전화 받기' : 'Accept Call';

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

      const lineApiResponse = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${channelAccessToken}`,
        },
        body: JSON.stringify({
          to: to_user_id,
          messages: [
            {
              type: 'template',
              altText: messageText,
              template: {
                type: 'buttons',
                text: messageText,
                actions: [
                  {
                    type: 'uri',
                    label: buttonText,
                    uri: deepLink
                  }
                ]
              }
            }
          ],
        }),
      });

      if (!lineApiResponse.ok) {
        const errorText = await lineApiResponse.text();
        console.error('[Callback API] notify: Failed to send LINE message:', errorText);
        return response.status(200).json({
          success: true,
          message: 'Notify callback received but LINE message failed'
        });
      }

      console.log('[Callback API] notify: LINE message sent successfully with cc_param');

      return response.status(200).json({
        success: true,
        message: 'Notify callback processed and LINE message sent'
      });
    } catch (lineError: any) {
      console.error('[Callback API] notify: Error sending LINE message:', lineError);
      return response.status(200).json({
        success: true,
        message: `Notify callback received but LINE message failed: ${lineError.message}`
      });
    }
  } catch (error: any) {
    console.error('[Callback API] Error in notify:', error);
    throw error;
  }
}

/**
 * Handle One-to-One Call Lifecycle Callback
 * GET/POST /api/callback?action=one-to-one-call
 */
async function handleOneToOneCallback(
  request: VercelRequest,
  response: VercelResponse
): Promise<VercelResponse> {
  try {
    const data = request.method === 'GET' ? request.query : request.body;

    const {
      cc_call_id,
      event_type,
      userId,
      timestamp,
      sid,
      terminate,
      rel_code_str,
      disconnect_reason,
      rel_code,
      ...additionalData
    } = data;

    console.log('[Callback API] one-to-one-call received:', {
      cc_call_id,
      event_type,
      userId,
      timestamp,
      sid,
      terminate,
      rel_code,
      rel_code_str,
      disconnect_reason,
      method: request.method,
    });

    const callId = cc_call_id || sid;

    if (!callId) {
      console.warn('[Callback API] one-to-one-call: No call ID found, but processing anyway');
      return response.status(200).json({
        success: true,
        message: 'Callback received (no call ID found, dry run?)'
      });
    }

    if (terminate === '18' || terminate === 18 || rel_code_str === 'NO_ANSWER' || disconnect_reason === '1203' || disconnect_reason === 1203) {
      console.log('[Callback API] one-to-one-call: Timeout detected:', { terminate, rel_code_str, disconnect_reason });

      try {
        const sessionResult = await sql`
          SELECT sid, callee_user_id, audio_file_ids, language, status
          FROM agent_call_sessions
          WHERE (room_id = ${callId} OR sid = ${callId})
            AND status IN ('ringing', 'initiated', 'failed')
          LIMIT 1
        `;

        if (sessionResult.rowCount === 0) {
          console.warn('[Callback API] one-to-one-call: Session not found for timeout:', callId);
        } else {
          const session = sessionResult.rows[0];

          const updateResult = await sql`
            UPDATE agent_call_sessions
            SET
              status = 'missed',
              timeout_at = NOW(),
              ended_at = NOW(),
              data = COALESCE(data, '{}'::jsonb) || ${JSON.stringify({
                timeout_detected_at: Date.now(),
                terminate,
                rel_code,
                rel_code_str,
                disconnect_reason,
                timeout_source: 'planetkit_callback'
              })}::jsonb
            WHERE sid = ${session.sid}
              AND timeout_notification_sent = FALSE
            RETURNING id
          `;

          if (updateResult.rowCount > 0) {
            const baseUrl = request.headers.origin || `https://${request.headers.host}`;
            await sendTimeoutNotification({
              sid: session.sid,
              calleeUserId: session.callee_user_id,
              audioFileIds: session.audio_file_ids,
              language: session.language || 'ko',
              baseUrl
            });

            await sql`
              UPDATE agent_call_sessions
              SET timeout_notification_sent = TRUE
              WHERE sid = ${session.sid}
            `;

            console.log('[Callback API] one-to-one-call: Timeout notification sent for SID:', session.sid);
          } else {
            console.log('[Callback API] one-to-one-call: Notification already sent for SID:', session.sid);
          }
        }
      } catch (timeoutError: any) {
        console.error('[Callback API] one-to-one-call: Error handling timeout:', timeoutError);
      }

      try {
        await sql`
          INSERT INTO agent_call_events (
            sid,
            event_type,
            status,
            timestamp,
            data
          ) VALUES (
            ${callId},
            'TIMEOUT',
            'NO_ANSWER',
            ${timestamp ? parseInt(timestamp.toString()) : Date.now()},
            ${JSON.stringify({
              userId,
              cc_call_id,
              terminate,
              rel_code,
              rel_code_str,
              disconnect_reason,
              ...additionalData
            })}
          )
        `;
        console.log('[Callback API] one-to-one-call: Timeout event logged');
      } catch (eventError: any) {
        console.error('[Callback API] one-to-one-call: Error logging timeout event:', eventError);
      }

      return response.status(200).json({
        success: true,
        message: 'Timeout processed successfully'
      });
    }

    if (event_type === 'CONNECTED') {
      try {
        const updateResult = await sql`
          UPDATE agent_call_sessions
          SET
            status = 'answered',
            answered_at = NOW(),
            data = COALESCE(data, '{}'::jsonb) || ${JSON.stringify({
              connected_at: Date.now(),
              cc_call_id,
              callId
            })}::jsonb
          WHERE room_id = ${callId} OR sid = ${callId}
          RETURNING id, sid
        `;

        if (updateResult.rowCount === 0) {
          console.warn('[Callback API] one-to-one-call: No session found for callId:', callId);
        } else {
          console.log('[Callback API] one-to-one-call: Updated session status to answered, SID:', updateResult.rows[0]?.sid);
        }
      } catch (dbError: any) {
        console.error('[Callback API] one-to-one-call: Database update error:', dbError);
      }
    } else if (event_type === 'DISCONNECTED') {
      try {
        const updateResult = await sql`
          UPDATE agent_call_sessions
          SET
            status = 'ended',
            ended_at = NOW(),
            data = COALESCE(data, '{}'::jsonb) || ${JSON.stringify({
              disconnected_at: Date.now(),
              cc_call_id,
              callId
            })}::jsonb
          WHERE room_id = ${callId} OR sid = ${callId}
          RETURNING id, sid
        `;

        if (updateResult.rowCount === 0) {
          console.warn('[Callback API] one-to-one-call: No session found for callId:', callId);
        } else {
          console.log('[Callback API] one-to-one-call: Updated session status to ended, SID:', updateResult.rows[0]?.sid);
        }
      } catch (dbError: any) {
        console.error('[Callback API] one-to-one-call: Database update error:', dbError);
      }
    } else {
      console.log('[Callback API] one-to-one-call: Unknown or missing event type:', event_type);
    }

    try {
      await sql`
        INSERT INTO agent_call_events (
          sid,
          event_type,
          status,
          timestamp,
          data
        ) VALUES (
          ${callId},
          ${event_type || 'UNKNOWN'},
          ${event_type || 'UNKNOWN'},
          ${timestamp ? parseInt(timestamp.toString()) : Date.now()},
          ${JSON.stringify({
            userId,
            cc_call_id,
            ...additionalData
          })}
        )
      `;

      console.log('[Callback API] one-to-one-call: Event logged successfully');
    } catch (eventError: any) {
      console.error('[Callback API] one-to-one-call: Error logging event:', eventError);
    }

    return response.status(200).json({
      success: true,
      message: 'Callback processed successfully'
    });
  } catch (error: any) {
    console.error('[Callback API] Error in one-to-one-call:', error);
    throw error;
  }
}

/**
 * Handle PlanetKit Group Call Callback
 * GET/POST /api/callback?action=planetkit
 */
async function handlePlanetKitCallback(
  request: VercelRequest,
  response: VercelResponse
): Promise<VercelResponse> {
  try {
    let body: PlanetKitCallback;
    let rawParams: any;

    if (request.method === 'GET') {
      rawParams = request.query;
      console.log('[Callback API] planetkit: Received GET callback:', rawParams);

      body = {
        eventType: '', // will be determined below
        serviceId: rawParams.svc_id || rawParams.service_id || rawParams.svcId,
        roomId: rawParams.id || rawParams.room_id || rawParams.roomId,
        userId: rawParams.user_id || rawParams.userId,
        displayName: rawParams.display_name || rawParams.displayName,
        timestamp: parseInt((rawParams.ts || rawParams.timestamp || Date.now()).toString()) || Date.now(),
        ...rawParams,
      };
    } else {
      rawParams = request.body;
      console.log('[Callback API] planetkit: Received POST callback:', rawParams);

      body = {
        eventType: rawParams.eventType || rawParams.event_type || '',
        serviceId: rawParams.svc_id || rawParams.service_id || rawParams.svcId,
        roomId: rawParams.id || rawParams.room_id || rawParams.roomId,
        userId: rawParams.user_id || rawParams.userId,
        displayName: rawParams.display_name || rawParams.displayName,
        timestamp: parseInt((rawParams.ts || rawParams.timestamp || Date.now()).toString()) || Date.now(),
        ...rawParams,
      };
    }

    const {
      serviceId,
      roomId,
      userId,
      displayName,
      timestamp,
      ...additionalData
    } = body;

    const eventType = determineEventType(body);
    
    console.log('[Callback API] planetkit: Parsed data:', {
      eventType,
      serviceId,
      roomId,
      userId,
      displayName,
      timestamp,
    });

    let eventId = null;
    try {
      const result = await sql`
        INSERT INTO planetkit_events (
          event_type,
          service_id,
          room_id,
          user_id,
          display_name,
          timestamp,
          data
        ) VALUES (
          ${eventType},
          ${serviceId || null},
          ${roomId || null},
          ${userId || null},
          ${displayName || null},
          ${timestamp || Date.now()},
          ${JSON.stringify(additionalData)}
        )
        RETURNING id
      `;
      eventId = result.rows[0]?.id;
      console.log('[Callback API] planetkit: Event stored with ID:', eventId);
    } catch (dbError) {
      console.error('[Callback API] planetkit: Database storage failed (continuing):', dbError);
    }

    return response.status(200).json({
      success: true,
      message: 'Event processed successfully',
      eventId: eventId,
    });
  } catch (error: any) {
    console.error('[Callback API] Error in planetkit:', error);
    throw error;
  }
}

function determineEventType(params: any): string {
  if (params.eventType || params.event_type) {
    return params.eventType || params.event_type;
  }

  const sc = params.sc;
  const msc = params.msc;
  const ueType = params.ue_type || params.ueType;
  const startTime = params.start_time || params.startTime;
  const endTime = params.end_time || params.endTime;

  if (sc === 'E') {
    return 'GCALL_EVT_END';
  }
  if (sc === 'S') {
    return 'GCALL_EVT_START';
  }

  if (msc === 'C') {
    return 'GCALL_EVT_USER_JOIN';
  }
  if (msc === 'D' || msc === 'T') {
    return 'GCALL_EVT_USER_LEAVE';
  }
  if (msc === 'M') {
    return 'GCALL_EVT_MEDIA_CHANGE';
  }

  if (endTime && endTime !== '0' && endTime !== 0) {
    return 'GCALL_EVT_END';
  }
  if (startTime && startTime !== '0' && startTime !== 0) {
    return 'GCALL_EVT_START';
  }

  if (ueType === 'JOIN') {
    return 'GCALL_EVT_USER_JOIN';
  }
  if (ueType === 'LEAVE') {
    return 'GCALL_EVT_USER_LEAVE';
  }

  if (sc === 'C') {
    return 'GCALL_EVT_STATUS_CHANGE';
  }

  return 'GCALL_EVT_CALLBACK';
}

async function sendTimeoutNotification(params: {
  sid: string;
  calleeUserId: string;
  audioFileIds: any;
  language: string;
  baseUrl: string;
}) {
  const { sid, calleeUserId, language, baseUrl } = params;

  const liffId = process.env.VITE_LIFF_ID;
  if (!liffId) {
    console.warn('[Callback API] sendTimeoutNotification: LIFF ID not configured');
    return;
  }

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

    const scheduleRetryUrl = `https://liff.line.me/${liffId}/schedule-retry?sid=${encodeURIComponent(sid)}`;

    const messageText = language === 'ko'
      ? '통화 수락 대기가 종료되었습니다. 5분 후 다시 전화를 받으실 수 있습니다.'
      : 'Call acceptance timeout. You can receive a call again in 5 minutes.';

    const buttonRetryLabel = language === 'ko' ? '5분 후 다시 받기' : 'Retry in 5 min';

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
            type: 'template',
            altText: messageText,
            template: {
              type: 'buttons',
              text: messageText,
              actions: [
                {
                  type: 'uri',
                  label: buttonRetryLabel,
                  uri: scheduleRetryUrl
                }
              ]
            }
          }
        ],
      }),
    });

    if (!lineApiResponse.ok) {
      const errorText = await lineApiResponse.text();
      console.error('[Callback API] sendTimeoutNotification: Failed to send LINE message:', errorText);
      throw new Error(`LINE API error: ${errorText}`);
    }

    console.log('[Callback API] sendTimeoutNotification: LINE message sent successfully');
  } catch (error: any) {
    console.error('[Callback API] sendTimeoutNotification: Error:', error);
    throw error;
  }
}

