import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '@vercel/postgres';

/**
 * Unified LINE API
 * Handles all LINE-related operations
 *
 * Actions:
 * - GET  ?action=get-followers  : Get all app users (from get-followers.ts)
 * - GET  ?action=get-token      : Get LINE Channel Access Token (from get-line-token.ts)
 * - POST ?action=send-invite    : Send LINE push message invite (from send-invite.ts)
 */

interface UserProfile {
  user_id: string;
  display_name: string;
  last_seen: string;
  total_calls: number;
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

  const action = request.query.action as string;

  if (!action) {
    return response.status(400).json({
      success: false,
      error: 'Missing action parameter',
    });
  }

  try {
    switch (action) {
      case 'get-followers':
        return await handleGetFollowers(request, response);
      case 'get-token':
        return await handleGetToken(request, response);
      case 'send-invite':
        return await handleSendInvite(request, response);
      default:
        return response.status(400).json({
          success: false,
          error: 'Invalid action',
        });
    }
  } catch (error: any) {
    console.error('[LINE API] Error:', error);
    return response.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}

/**
 * Handle Get Followers
 * GET /api/line?action=get-followers&requesterId=xxx&days=90
 */
async function handleGetFollowers(
  request: VercelRequest,
  response: VercelResponse
): Promise<VercelResponse> {
  if (request.method !== 'GET') {
    return response.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    const { requesterId, days = '90' } = request.query;

    console.log('[LINE API] get-followers request:', { requesterId, days });

    if (!requesterId || typeof requesterId !== 'string') {
      return response.status(400).json({
        success: false,
        error: 'requesterId parameter is required',
      });
    }

    const daysNumber = parseInt(days as string);
    const cutoffTime = new Date(Date.now() - daysNumber * 24 * 60 * 60 * 1000).toISOString();

    console.log('[LINE API] Query parameters:', {
      requesterId,
      daysNumber,
      cutoffTime,
    });

    const usersResult = await sql`
      SELECT
        user_id,
        display_name,
        MAX(created_at) as last_seen,
        COUNT(DISTINCT room_id) as total_calls
      FROM planetkit_events
      WHERE
        user_id IS NOT NULL
        AND user_id != ${requesterId}
        AND display_name IS NOT NULL
        AND created_at >= ${cutoffTime}
        AND event_type IN ('GCALL_EVT_USER_JOIN', 'GCALL_EVT_START')
      GROUP BY user_id, display_name
      ORDER BY last_seen DESC
      LIMIT 100
    `;

    const users: UserProfile[] = usersResult.rows.map(row => ({
      user_id: row.user_id,
      display_name: row.display_name,
      last_seen: row.last_seen,
      total_calls: parseInt(row.total_calls),
    }));

    console.log('[LINE API] Users found:', {
      count: users.length,
    });

    return response.status(200).json({
      success: true,
      data: users,
      total: users.length,
    });
  } catch (error: any) {
    console.error('[LINE API] Error in get-followers:', error);
    throw error;
  }
}

/**
 * Handle Get Token
 * GET /api/line?action=get-token
 */
async function handleGetToken(
  request: VercelRequest,
  response: VercelResponse
): Promise<VercelResponse> {
  if (request.method !== 'GET') {
    return response.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    const channelId = process.env.LINE_CHANNEL_ID;
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    console.log('[LINE API] get-token environment check:', {
      hasChannelId: !!channelId,
      hasChannelSecret: !!channelSecret,
      channelIdLength: channelId?.length,
      channelSecretLength: channelSecret?.length,
    });

    if (!channelId || !channelSecret) {
      console.error('Missing environment variables: LINE_CHANNEL_ID or LINE_CHANNEL_SECRET');
      return response.status(500).json({
        success: false,
        error: 'LINE Channel credentials not configured. Please set LINE_CHANNEL_ID and LINE_CHANNEL_SECRET in environment variables.',
      });
    }

    console.log('[LINE API] Requesting token from LINE API using client credentials...');

    const tokenResponse = await fetch('https://api.line.me/v2/oauth/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });

    console.log('[LINE API] LINE API response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[LINE API] LINE Token API Error:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        errorText,
      });
      return response.status(tokenResponse.status).json({
        success: false,
        error: `Failed to get LINE token: ${errorText}`,
      });
    }

    const tokenData = await tokenResponse.json();

    console.log('[LINE API] Token generated successfully:', {
      hasAccessToken: !!tokenData.access_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type,
    });

    return response.status(200).json({
      success: true,
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type,
    });
  } catch (error: any) {
    console.error('[LINE API] Error in get-token:', error);
    throw error;
  }
}

/**
 * Handle Send Invite
 * POST /api/line?action=send-invite
 */
async function handleSendInvite(
  request: VercelRequest,
  response: VercelResponse
): Promise<VercelResponse> {
  if (request.method !== 'POST') {
    return response.status(405).json({
      success: false,
      error: 'Method not allowed',
    });
  }

  try {
    const { toUserId, fromUserName, roomId, liffId, language = 'en' } = request.body;

    if (!toUserId || !fromUserName || !roomId || !liffId) {
      return response.status(400).json({
        success: false,
        error: 'Missing required fields: toUserId, fromUserName, roomId, liffId',
      });
    }

    const baseUrl = request.headers.origin || `https://${request.headers.host}`;
    const tokenUrl = `${baseUrl}/api/line?action=get-token`;
    console.log('[LINE API] send-invite requesting token from:', tokenUrl);

    const tokenResponse = await fetch(tokenUrl);

    console.log('[LINE API] Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[LINE API] Failed to get LINE token:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        errorText,
      });
      return response.status(500).json({
        success: false,
        error: `Failed to obtain LINE Channel Access Token: ${errorText}`,
      });
    }

    const tokenData = await tokenResponse.json();
    const channelAccessToken = tokenData.access_token;

    console.log('[LINE API] Token obtained successfully');

    if (!channelAccessToken) {
      return response.status(500).json({
        success: false,
        error: 'Invalid token response',
      });
    }

    const liffUrl = `https://liff.line.me/${liffId}?room=${encodeURIComponent(roomId)}`;

    const inviteMessage = language === 'ko'
      ? `🎥 ${fromUserName}님이 화상 통화에 초대했습니다!\n\n룸: ${roomId}\n\n링크를 눌러 참여하세요:\n${liffUrl}`
      : `🎥 ${fromUserName} invited you to a video call!\n\nRoom: ${roomId}\n\nTap the link to join:\n${liffUrl}`;

    const lineApiResponse = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to: toUserId,
        messages: [
          {
            type: 'text',
            text: inviteMessage,
          },
        ],
      }),
    });

    if (!lineApiResponse.ok) {
      const errorText = await lineApiResponse.text();
      console.error('LINE API Error:', errorText);
      return response.status(lineApiResponse.status).json({
        success: false,
        error: `LINE API Error: ${errorText}`,
      });
    }

    return response.status(200).json({
      success: true,
      message: 'Invite sent successfully',
    });
  } catch (error: any) {
    console.error('[LINE API] Error in send-invite:', error);
    throw error;
  }
}
