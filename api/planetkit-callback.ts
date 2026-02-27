import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from './callback.js';

/**
 * Legacy Proxy for PlanetKit Callback
 * Routes /api/planetkit-callback to /api/callback?action=planetkit
 */
export default async function proxyHandler(
  request: VercelRequest,
  response: VercelResponse
) {
  // Inject action parameter if missing
  if (!request.query.action) {
    request.query.action = 'planetkit';
  }
  
  // Forward to the unified callback handler
  return await handler(request, response);
}
