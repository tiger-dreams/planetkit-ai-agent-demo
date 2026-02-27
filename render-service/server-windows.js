import express from 'express';
import puppeteer from 'puppeteer';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// Store active browser sessions
const activeSessions = new Map();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    platform: 'windows',
    activeSessions: activeSessions.size,
    uptime: process.uptime(),
  });
});

/**
 * Join AI Agent to PlanetKit Conference
 * POST /join-as-agent
 *
 * Body:
 * - roomId: PlanetKit room ID
 * - userId: AI Agent user ID
 * - language: 'ko' | 'en'
 * - voice: Gemini voice ID
 */
app.post('/join-as-agent', async (req, res) => {
  const { roomId, userId, language = 'ko', voice = 'Kore' } = req.body;

  if (!roomId || !userId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: roomId, userId',
    });
  }

  console.log('[Windows Agent] Join request:', { roomId, userId, language, voice });

  try {
    // Check if session already exists
    if (activeSessions.has(roomId)) {
      console.log('[Windows Agent] Session already exists for room:', roomId);
      return res.json({
        success: true,
        message: 'Session already active',
        roomId,
      });
    }

    // Launch Chrome on Windows
    // Key difference from Render.com: NO --use-fake-device-for-media-stream
    console.log('[Windows Agent] Launching Chrome...');
    const browser = await puppeteer.launch({
      headless: false,  // Need headless:false for audio support on Windows
      executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: [
        '--no-sandbox',
        '--use-fake-ui-for-media-stream',          // Auto-grant mic/camera permissions
        '--use-fake-device-for-media-stream',      // Provide fake mic so Gemini pipeline can initialize
        // Real room audio is routed separately via captureStream() + addAudioSource()
        '--autoplay-policy=no-user-gesture-required',
        '--disable-web-security',
        '--disable-blink-features=AutomationControlled',
        '--window-size=800,600',
        '--window-position=-2000,0',               // Off-screen (hidden but audio works)
      ],
      defaultViewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
    });

    const page = await browser.newPage();

    // Hide webdriver property
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });

    await page.setViewport({ width: 800, height: 600 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
    );

    // Expose cleanup function so the headless page can trigger its own session removal
    // (window.close() doesn't work in Puppeteer context)
    await page.exposeFunction('notifyAgentLeaving', async () => {
      if (activeSessions.has(roomId)) {
        activeSessions.delete(roomId);
        console.log(`[Windows Agent] Session cleaned up via notifyAgentLeaving: ${roomId}`);
      }
      setTimeout(async () => {
        try { await browser.close(); } catch (e) { /* already closed */ }
      }, 1000);
    });

    // Forward console logs from the headless page
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      console.log(`[Chrome Page] [${type}] ${text}`);
    });

    page.on('pageerror', (error) => {
      console.error('[Chrome Page] Error:', error.message);
    });

    // Load headless agent page
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';
    const agentUrl = `${frontendUrl}/headless-agent?roomId=${encodeURIComponent(roomId)}&userId=${encodeURIComponent(userId)}&lang=${language}&voice=${encodeURIComponent(voice)}`;

    console.log('[Windows Agent] Loading:', agentUrl);
    await page.goto(agentUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for agent to connect
    console.log('[Windows Agent] Waiting for agent connection...');
    await page.waitForFunction(
      () => window.agentConnected === true,
      { timeout: 90000 }
    );

    console.log('[Windows Agent] ✅ Agent connected successfully');

    // Store session
    activeSessions.set(roomId, {
      browser,
      page,
      roomId,
      userId,
      createdAt: new Date().toISOString(),
    });

    // Clean up session when page closes (e.g., agent auto-leaves via window.close())
    page.on('close', () => {
      if (activeSessions.has(roomId)) {
        activeSessions.delete(roomId);
        console.log(`[Windows Agent] Session auto-cleaned after page close: ${roomId}`);
      }
    });

    res.json({
      success: true,
      message: 'AI Agent joined successfully',
      roomId,
      userId,
    });

    console.log('[Windows Agent] Active sessions:', activeSessions.size);

  } catch (error) {
    console.error('[Windows Agent] Failed to join agent:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to join AI agent',
      details: error.stack,
    });
  }
});

/**
 * Disconnect AI Agent from Conference
 * POST /disconnect-agent
 */
app.post('/disconnect-agent', async (req, res) => {
  const { roomId } = req.body;

  if (!roomId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: roomId',
    });
  }

  console.log('[Windows Agent] Disconnect request:', { roomId });

  try {
    const session = activeSessions.get(roomId);

    if (!session) {
      return res.json({
        success: true,
        message: 'No active session to disconnect',
      });
    }

    await session.browser.close();
    activeSessions.delete(roomId);

    console.log('[Windows Agent] ✅ Session disconnected');

    res.json({
      success: true,
      message: 'AI Agent disconnected successfully',
      roomId,
    });

  } catch (error) {
    console.error('[Windows Agent] Failed to disconnect agent:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to disconnect AI agent',
    });
  }
});

/**
 * Set AI Agent Mode (Listen/Respond)
 * POST /agent-mode
 *
 * Body:
 * - roomId: PlanetKit room ID
 * - mode: 'listen' | 'respond'
 */
app.post('/agent-mode', async (req, res) => {
  const { roomId, mode } = req.body;

  if (!roomId || !mode) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: roomId, mode',
    });
  }

  if (mode !== 'listen' && mode !== 'respond') {
    return res.status(400).json({
      success: false,
      error: 'Invalid mode. Must be "listen" or "respond".',
    });
  }

  console.log('[Windows Agent] Mode change request:', { roomId, mode });

  try {
    const session = activeSessions.get(roomId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'No active session found for this room',
      });
    }

    const result = await session.page.evaluate((m) => {
      if (typeof window.setAgentMode === 'function') {
        return window.setAgentMode(m);
      }
      return { success: false, mode: 'unknown' };
    }, mode);

    if (result.success) {
      console.log(`[Windows Agent] Mode set to "${mode}" for room ${roomId}`);
      res.json({
        success: true,
        message: `Agent mode set to ${mode}`,
        roomId,
        mode,
      });
    } else {
      throw new Error('Failed to set mode in headless page');
    }
  } catch (error) {
    console.error('[Windows Agent] Failed to set agent mode:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to set agent mode',
    });
  }
});

/**
 * List active sessions
 * GET /sessions
 */
app.get('/sessions', (req, res) => {
  const sessions = Array.from(activeSessions.entries()).map(([roomId, session]) => ({
    roomId,
    userId: session.userId,
    createdAt: session.createdAt,
  }));

  res.json({
    success: true,
    count: sessions.length,
    sessions,
  });
});

// Start server (listen on all interfaces for Azure VM access)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Windows Agent] 🚀 Server running on port ${PORT}`);
  console.log(`[Windows Agent] Health check: http://localhost:${PORT}/health`);
  console.log(`[Windows Agent] Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:8080'}`);
});

// Cleanup on exit
process.on('SIGTERM', async () => {
  console.log('[Windows Agent] Shutting down...');

  for (const [roomId, session] of activeSessions.entries()) {
    try {
      await session.browser.close();
      console.log(`[Windows Agent] Closed session: ${roomId}`);
    } catch (err) {
      console.error(`[Windows Agent] Failed to close session ${roomId}:`, err);
    }
  }

  process.exit(0);
});
