import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { aiAgentService, AIAgentState } from '@/services/ai-agent-service';
import { AgentLanguage, AGENT_SYSTEM_PROMPTS } from '@/config/ai-agent-languages';
import * as PlanetKitEval from '@line/planet-kit/dist/planet-kit-eval';

/**
 * Headless AI Agent Page
 *
 * Runs in Puppeteer (headless Chrome) on Render.com
 * - No UI (headless mode)
 * - Single Conference (AI Agent participant)
 * - Gemini AI integration
 * - Audio routing for group calls
 */

// Declare window properties for Puppeteer signal and mode control
declare global {
  interface Window {
    agentConnected?: boolean;
    setAgentMode?: (mode: 'respond' | 'listen') => { success: boolean; mode: string };
    getAgentMode?: () => string;
  }
}

export const HeadlessAgentPage = () => {
  const [searchParams] = useSearchParams();

  // URL parameters
  const roomId = searchParams.get('roomId') || 'headless-room';
  const userId = searchParams.get('userId') || `AI_AGENT_${Date.now()}`;
  const language = (searchParams.get('lang') || 'ko') as AgentLanguage;
  const voice = searchParams.get('voice') || 'Kore';

  // State
  const [agentState, setAgentState] = useState<AIAgentState>('idle');
  const [isConnected, setIsConnected] = useState(false);

  // Refs
  const conferenceRef = useRef<any>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const peersRef = useRef<Set<string>>(new Set());
  const autoLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize headless agent
  useEffect(() => {
    console.log('[HeadlessAgent] Initializing...');
    console.log('[HeadlessAgent] Room:', roomId, 'User:', userId, 'Language:', language);

    const initializeAgent = async () => {
      try {
        // Step 1: Setup AI Agent Service
        setupAIAgent();

        // Step 2: Join PlanetKit Conference
        await joinPlanetKitConference();

        // Step 3: Setup Audio Routing
        await setupAudioRouting();

        setIsConnected(true);

        // Signal to Puppeteer that agent is ready
        window.agentConnected = true;

        // Expose mode control functions for Puppeteer (render service)
        window.setAgentMode = (mode: 'respond' | 'listen') => {
          try {
            aiAgentService.setMode(mode);
            console.log(`[HeadlessAgent] Mode set to: ${mode}`);
            return { success: true, mode };
          } catch (err: any) {
            console.error('[HeadlessAgent] Failed to set mode:', err);
            return { success: false, mode: aiAgentService.getMode() };
          }
        };
        window.getAgentMode = () => aiAgentService.getMode();

        console.log('[HeadlessAgent] ✅ Successfully connected and ready');

      } catch (error: any) {
        console.error('[HeadlessAgent] Failed to initialize');
        console.error('[HeadlessAgent] Error message:', error?.message || 'Unknown error');
        console.error('[HeadlessAgent] Error stack:', error?.stack || 'No stack trace');
        console.error('[HeadlessAgent] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        window.agentConnected = false;
      }
    };

    initializeAgent();

    // Cleanup on unmount
    return () => {
      console.log('[HeadlessAgent] Cleaning up...');
      if (autoLeaveTimerRef.current) clearTimeout(autoLeaveTimerRef.current);
      if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
      aiAgentService.off('stateChange', handleStateChange);
      aiAgentService.off('error', handleError);
      aiAgentService.off('audioOutput', handleAudioOutput);
      aiAgentService.disconnect();

      if (conferenceRef.current) {
        conferenceRef.current.leaveConference?.();
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // AI Agent Event Handlers
  const handleStateChange = (newState: AIAgentState) => {
    console.log('[HeadlessAgent] AI state changed:', newState);
    setAgentState(newState);
  };

  const handleError = (errorMessage: string) => {
    console.error('[HeadlessAgent] AI error:', errorMessage);
  };

  const handleAudioOutput = (audioData: Float32Array) => {
    if (!audioContextRef.current || !mediaStreamDestRef.current) {
      return;
    }

    try {
      const audioCtx = audioContextRef.current;

      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      // One-time: Inject AI audio stream into Conference
      if (conferenceRef.current && !conferenceRef.current._aiStreamInjected) {
        try {
          const mixedStream = mediaStreamDestRef.current.stream;
          if (typeof conferenceRef.current.setCustomMediaStream === 'function') {
            conferenceRef.current.setCustomMediaStream(mixedStream);
            conferenceRef.current._aiStreamInjected = true;
            console.log('[HeadlessAgent] ✅ AI audio stream injected into Conference');
          }
        } catch (err) {
          console.warn('[HeadlessAgent] Could not inject AI stream:', err);
        }
      }

      // Send audio chunk to AudioWorklet (ring buffer)
      const playbackNode = (audioCtx as any)._playbackNode;
      if (playbackNode) {
        // Transfer ownership for efficiency (avoid copying)
        playbackNode.port.postMessage(
          { audioChunk: audioData },
          [audioData.buffer]
        );
      }

    } catch (err) {
      console.error('[HeadlessAgent] Failed to route AI audio:', err);
    }
  };

  const setupAIAgent = () => {
    console.log('[HeadlessAgent] Setting up AI Agent service');
    aiAgentService.on('stateChange', handleStateChange);
    aiAgentService.on('error', handleError);
    aiAgentService.on('audioOutput', handleAudioOutput);
  };

  // Join PlanetKit Conference
  const joinPlanetKitConference = async () => {
    console.log('[HeadlessAgent] Joining PlanetKit Conference');

    // Get PlanetKit credentials
    const serviceId = import.meta.env.VITE_PLANETKIT_EVAL_SERVICE_ID;
    const apiKey = import.meta.env.VITE_PLANETKIT_EVAL_API_KEY;
    const apiSecret = import.meta.env.VITE_PLANETKIT_EVAL_API_SECRET;

    if (!serviceId || !apiKey || !apiSecret) {
      throw new Error('PlanetKit credentials not configured');
    }

    // Generate access token
    const { generatePlanetKitToken } = await import('@/utils/token-generator');
    const accessToken = await generatePlanetKitToken(
      serviceId,
      apiKey,
      userId,
      roomId,
      3600,
      apiSecret
    );

    // Initialize Conference
    const conference = new PlanetKitEval.Conference();
    conferenceRef.current = conference;

    const conferenceDelegate = {
      evtConnected: () => {
        console.log('[HeadlessAgent] Conference connected');
        // Capture room audio AFTER conference is fully connected
        // Try srcObject first (direct MediaStream), fall back to captureStream
        if (audioElementRef.current) {
          try {
            const audioEl = audioElementRef.current as any;
            const roomStream: MediaStream | null =
              (audioEl.srcObject instanceof MediaStream ? audioEl.srcObject : null)
              ?? audioEl.captureStream?.();
            if (roomStream) {
              aiAgentService.addAudioSource(roomStream);
              console.log('[HeadlessAgent] ✅ Room audio → Gemini routing complete');
            } else {
              console.warn('[HeadlessAgent] No room audio stream available');
            }
          } catch (err) {
            console.warn('[HeadlessAgent] Could not capture room audio:', err);
          }
        }

        // 5-minute session timer: wait for current speech to end, then send farewell and leave
        sessionTimerRef.current = setTimeout(() => {
          console.log('[HeadlessAgent] Session timeout (5min), preparing farewell...');

          const doFarewellAndLeave = () => {
            aiAgentService.sendFarewell(language);
            setTimeout(() => {
              console.log('[HeadlessAgent] Leaving after farewell');
              conferenceRef.current?.leaveConference?.();
              aiAgentService.disconnect();
              (window as any).notifyAgentLeaving?.();
            }, 20000); // 20s for farewell speech to finish
          };

          // If Gemini is currently speaking, wait for it to finish before farewell
          if (aiAgentService.getState() === 'speaking') {
            console.log('[HeadlessAgent] Agent speaking, waiting for turn complete before farewell...');
            const onStateChange = (state: AIAgentState) => {
              if (state === 'listening') {
                aiAgentService.off('stateChange', onStateChange);
                doFarewellAndLeave();
              }
            };
            aiAgentService.on('stateChange', onStateChange);
          } else {
            doFarewellAndLeave();
          }
        }, 5 * 60 * 1000);
      },

      evtDisconnected: (details: any) => {
        console.log('[HeadlessAgent] Conference disconnected:', details);
        // Cancel pending timers to avoid duplicate notifyAgentLeaving calls
        if (autoLeaveTimerRef.current) {
          clearTimeout(autoLeaveTimerRef.current);
          autoLeaveTimerRef.current = null;
        }
        if (sessionTimerRef.current) {
          clearTimeout(sessionTimerRef.current);
          sessionTimerRef.current = null;
        }
        // Always clean up session on disconnect (expected or unexpected)
        aiAgentService.disconnect();
        (window as any).notifyAgentLeaving?.();
      },

      evtPeerListUpdated: (peerUpdateInfo: any) => {
        const added = peerUpdateInfo.addedPeers || peerUpdateInfo.added || [];
        const removed = peerUpdateInfo.removedPeers || peerUpdateInfo.removed || [];

        added.forEach((peer: any) => {
          const id = peer.userId || peer.peerId || peer.id;
          if (id) peersRef.current.add(id);
        });
        removed.forEach((peer: any) => {
          const id = peer.userId || peer.peerId || peer.id;
          if (id) peersRef.current.delete(id);
        });

        // Someone joined → cancel pending auto-leave
        if (added.length > 0 && autoLeaveTimerRef.current) {
          clearTimeout(autoLeaveTimerRef.current);
          autoLeaveTimerRef.current = null;
          console.log('[HeadlessAgent] Participant joined, auto-leave cancelled');
        }

        // Room empty → start 30s auto-leave timer
        if (peersRef.current.size === 0 && !autoLeaveTimerRef.current) {
          console.log('[HeadlessAgent] Room empty, will auto-leave in 30s...');
          autoLeaveTimerRef.current = setTimeout(() => {
            console.log('[HeadlessAgent] Auto-leaving empty room');
            conferenceRef.current?.leaveConference?.();
            aiAgentService.disconnect();
            (window as any).notifyAgentLeaving?.();
          }, 30000);
        }
      },

      evtError: (error: any) => {
        console.error('[HeadlessAgent] Conference error:', error);
      },
    };

    const conferenceParams = {
      myId: userId,
      displayName: 'AI Assistant',
      myServiceId: serviceId,
      roomId: roomId,
      roomServiceId: serviceId,
      accessToken: accessToken,
      mediaType: 'video',
      cameraOn: false,
      micOn: true,
      mediaHtmlElement: { roomAudio: audioElementRef.current },
      delegate: conferenceDelegate,
    };

    await conference.joinConference(conferenceParams);
    console.log('[HeadlessAgent] ✅ Conference joined successfully');
  };

  // Setup Audio Routing with AudioWorklet + Ring Buffer
  const setupAudioRouting = async () => {
    console.log('[HeadlessAgent] Setting up audio routing with AudioWorklet');

    // Initialize AudioContext at 24kHz (matches Gemini output)
    audioContextRef.current = new AudioContext({ sampleRate: 24000 });
    console.log('[HeadlessAgent] AudioContext created at 24kHz');

    // AudioWorklet processor code (Ring Buffer)
    const workletCode = `
class AudioPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 240000; // 10 seconds buffer (24kHz * 10s) - prevents overflow on fast VM
    this.ringBuffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.filled = 0;
    this.hasStarted = false;  // Track if playback has started

    // Receive audio chunks from main thread
    this.port.onmessage = (e) => {
      const chunk = e.data.audioChunk;
      if (chunk) {
        this.writeToBuffer(chunk);
      }
    };
  }

  writeToBuffer(chunk) {
    // Write chunk to ring buffer - drop samples if full to prevent overflow
    for (let i = 0; i < chunk.length; i++) {
      if (this.filled >= this.bufferSize) break;  // Buffer full, drop remainder
      this.ringBuffer[this.writeIndex] = chunk[i];
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      this.filled++;
    }
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const channel = output[0];

    // Initial buffering only: wait for ~67ms (1600 samples) before first playback
    if (!this.hasStarted) {
      if (this.filled < 1600) {
        channel.fill(0);
        return true;
      }
      this.hasStarted = true;
    }

    // After playback started: output silence when buffer empty, no re-buffering
    // (removing hasStarted reset prevents 100ms delay mid-response causing "mushed" audio)
    if (this.filled === 0) {
      channel.fill(0);
      return true;
    }

    // Read from ring buffer continuously (no threshold check mid-stream)
    for (let i = 0; i < channel.length; i++) {
      if (this.filled > 0) {
        channel[i] = this.ringBuffer[this.readIndex];
        this.readIndex = (this.readIndex + 1) % this.bufferSize;
        this.filled--;
      } else {
        channel[i] = 0;  // Buffer underrun - output silence
      }
    }

    return true;
  }
}

registerProcessor('audio-playback-processor', AudioPlaybackProcessor);
    `;

    // Load AudioWorklet
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);

    try {
      await audioContextRef.current.audioWorklet.addModule(workletUrl);
      console.log('[HeadlessAgent] ✅ AudioWorklet loaded');
    } finally {
      URL.revokeObjectURL(workletUrl);
    }

    // Create AudioWorkletNode
    const playbackNode = new AudioWorkletNode(
      audioContextRef.current,
      'audio-playback-processor'
    );

    // Connect to MediaStreamDestination (for PlanetKit)
    mediaStreamDestRef.current = audioContextRef.current.createMediaStreamDestination();
    playbackNode.connect(mediaStreamDestRef.current);

    // Store worklet node for sending audio chunks
    (audioContextRef.current as any)._playbackNode = playbackNode;
    console.log('[HeadlessAgent] ✅ AudioWorklet connected to MediaStreamDestination');

    // Connect to Gemini AI
    await aiAgentService.connect({
      language,
      voice,
      systemPrompt: AGENT_SYSTEM_PROMPTS[language],
    });
    console.log('[HeadlessAgent] ✅ Gemini AI connected');

    console.log('[HeadlessAgent] ✅ Audio routing setup complete (AudioWorklet + Ring Buffer)');
  };

  // Headless mode - minimal UI for debugging
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: '#000',
      color: '#0f0',
      fontFamily: 'monospace',
      padding: '20px',
      overflow: 'auto'
    }}>
      <audio ref={audioElementRef} autoPlay playsInline />

      <h1>🤖 Headless AI Agent</h1>
      <div style={{ marginTop: '20px', fontSize: '14px' }}>
        <div>Status: {isConnected ? '✅ Connected' : '⏳ Connecting...'}</div>
        <div>AI State: {agentState}</div>
        <div>Room: {roomId}</div>
        <div>User ID: {userId}</div>
        <div>Language: {language}</div>
        <div>Voice: {voice}</div>
        <div style={{ marginTop: '10px', color: '#ff0' }}>
          {window.agentConnected ? '✅ Ready (Puppeteer can proceed)' : '⏳ Initializing...'}
        </div>
      </div>

      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        <div>⚠️ This page runs in headless Chrome via Puppeteer</div>
        <div>⚠️ Do not access directly in browser</div>
      </div>
    </div>
  );
};

export default HeadlessAgentPage;
