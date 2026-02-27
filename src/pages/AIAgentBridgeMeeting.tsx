import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiff } from '@/contexts/LiffContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PhoneOff, Loader2, Users, Bot } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as PlanetKitEval from '@line/planet-kit/dist/planet-kit-eval';
import { generatePlanetKitToken } from '@/utils/token-generator';

/**
 * AI Agent Bridge Meeting Page (Simplified)
 *
 * Architecture:
 * 1. User A joins PlanetKit Conference as normal participant (1 Conference)
 * 2. On join success, automatically call Render Service
 * 3. Render Service spawns AI Agent in Headless Chrome (separate participant)
 * 4. User A + AI Agent meet in the same room
 * 5. PlanetKit handles all audio routing natively
 *
 * Clean separation: User A (browser) + AI Agent (Render/Headless)
 */
export const AIAgentBridgeMeeting = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, isLoggedIn, isInitialized } = useLiff();
  const { toast } = useToast();

  // URL parameters
  const language = (searchParams.get('lang') || 'ko') as 'ko' | 'en';
  const voice = searchParams.get('voice') || 'Kore';
  const roomId = searchParams.get('roomId') || 'ai-agent-bridge';

  // Component state
  const [callDuration, setCallDuration] = useState(0);
  const [isConnecting, setIsConnecting] = useState(true);
  const [conferenceConnected, setConferenceConnected] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [aiAgentJoined, setAiAgentJoined] = useState(false);

  // Refs
  const callStartTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const conferenceRef = useRef<any>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);

  // Format call duration
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start duration timer
  const startDurationTimer = () => {
    if (durationIntervalRef.current) return;
    durationIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
      setCallDuration(elapsed);
    }, 1000);
  };

  // Stop duration timer
  const stopDurationTimer = () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  };

  // Conference Delegate
  const conferenceDelegate = {
    evtConnected: () => {
      console.log('[AIAgentBridge] User A connected to Conference');
      setConferenceConnected(true);
      setParticipantCount(1);

      toast({
        title: 'Conference Joined',
        description: `Joined room: ${roomId}`,
      });

      // Call Render Service after successful join
      callRenderServiceForAIAgent();
    },

    evtDisconnected: (disconnectDetails: any) => {
      console.log('[AIAgentBridge] User A disconnected:', disconnectDetails);
      setConferenceConnected(false);
      handleDisconnect();
    },

    evtPeerListUpdated: (peerUpdateInfo: any) => {
      console.log('[AIAgentBridge] Peer list updated:', peerUpdateInfo);

      if (conferenceRef.current) {
        const peerList = conferenceRef.current.getPeerList();
        const totalCount = 1 + (peerList?.length || 0); // 1 (local) + peers
        setParticipantCount(totalCount);

        // Check if AI Agent joined
        const aiAgent = peerList?.find((peer: any) => peer.userId.includes('AI_HEADLESS_'));
        if (aiAgent && !aiAgentJoined) {
          console.log('[AIAgentBridge] ✅ AI Agent detected in room:', aiAgent.userId);
          setAiAgentJoined(true);
          toast({
            title: 'AI Agent Joined',
            description: 'AI is now in the room!',
          });
        }
      }
    },

    evtError: (error: any) => {
      console.error('[AIAgentBridge] Conference error:', error);
      toast({
        title: 'Conference Error',
        description: error.message || 'Unknown error',
        variant: 'destructive',
      });
    },
  };

  // Join PlanetKit Conference as User A
  const joinPlanetKitAsUser = async () => {
    console.log('[AIAgentBridge] Joining PlanetKit Conference as User A');

    if (!profile?.userId) {
      throw new Error('LINE profile not available');
    }

    // Generate token for User A
    const serviceId = import.meta.env.VITE_PLANETKIT_EVAL_SERVICE_ID;
    const apiKey = import.meta.env.VITE_PLANETKIT_EVAL_API_KEY;
    const apiSecret = import.meta.env.VITE_PLANETKIT_EVAL_API_SECRET;

    if (!serviceId || !apiKey || !apiSecret) {
      throw new Error('PlanetKit credentials not configured');
    }

    const userId = profile.userId;
    const token = await generatePlanetKitToken(serviceId, apiKey, userId, roomId, 3600, apiSecret);

    console.log('[AIAgentBridge] User ID:', userId);
    console.log('[AIAgentBridge] Room ID:', roomId);

    // Create Conference instance
    conferenceRef.current = new PlanetKitEval.Conference();

    const conferenceParams = {
      myId: userId,
      myServiceId: serviceId,
      roomId: roomId,
      roomServiceId: serviceId,
      accessToken: token,
      mediaType: 'video' as const,
      cameraOn: false,
      micOn: true,
      mediaHtmlElement: { roomAudio: audioElementRef.current },
      delegate: conferenceDelegate,
    };

    await conferenceRef.current.joinConference(conferenceParams);
    console.log('[AIAgentBridge] ✅ User A joined Conference successfully');
  };

  // Call Render Service to spawn AI Agent
  const callRenderServiceForAIAgent = async () => {
    console.log('[AIAgentBridge] Calling Render Service for AI Agent...');

    const renderServiceUrl = import.meta.env.VITE_RENDER_SERVICE_URL;

    if (!renderServiceUrl) {
      console.warn('[AIAgentBridge] VITE_RENDER_SERVICE_URL not configured, skipping AI Agent');
      return;
    }

    try {
      const response = await fetch(`${renderServiceUrl}/join-as-agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId: roomId,
          userId: `AI_HEADLESS_${roomId.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().substring(0, 20)}`,
          language: language,
          voice: voice,
        }),
      });

      const data = await response.json();

      if (data.success) {
        console.log('[AIAgentBridge] ✅ Render Service called successfully:', data);
        toast({
          title: 'AI Agent Spawning',
          description: 'AI is joining the room...',
        });
      } else {
        throw new Error(data.error || 'Failed to call Render Service');
      }
    } catch (error: any) {
      console.error('[AIAgentBridge] Failed to call Render Service:', error);
      toast({
        title: 'AI Agent Error',
        description: 'Could not spawn AI Agent, but you can still use the room',
        variant: 'destructive',
      });
    }
  };

  // Handle disconnect
  const handleDisconnect = () => {
    console.log('[AIAgentBridge] Disconnecting...');
    stopDurationTimer();
    cleanupPlanetKit();
    setTimeout(() => navigate('/setup'), 2000);
  };

  // Cleanup PlanetKit
  const cleanupPlanetKit = () => {
    console.log('[AIAgentBridge] Cleaning up PlanetKit Conference');
    if (conferenceRef.current) {
      try {
        conferenceRef.current.leaveConference();
      } catch (err) {
        console.warn('[AIAgentBridge] Error leaving conference:', err);
      }
      conferenceRef.current = null;
    }

    if (audioElementRef.current?.srcObject) {
      const tracks = (audioElementRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((track) => track.stop());
      audioElementRef.current.srcObject = null;
    }
  };

  // Initialize on mount
  useEffect(() => {
    if (!isInitialized) return;

    if (!isLoggedIn || !profile) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in with LINE',
        variant: 'destructive',
      });
      navigate('/setup');
      return;
    }

    const initializeBridge = async () => {
      console.log('[AIAgentBridge] Initializing AI Agent Bridge (Simplified)');
      console.log('[AIAgentBridge] Language:', language, 'Voice:', voice, 'Room:', roomId);

      try {
        // Join PlanetKit Conference as User A
        await joinPlanetKitAsUser();

        setIsConnecting(false);
        callStartTimeRef.current = Date.now();
        startDurationTimer();

        console.log('[AIAgentBridge] ✅ Initialization complete');
      } catch (error: any) {
        console.error('[AIAgentBridge] Initialization failed:', error);
        toast({
          title: 'Connection Failed',
          description: error.message || 'Failed to join conference',
          variant: 'destructive',
        });
        setTimeout(() => navigate('/setup'), 2000);
      }
    };

    initializeBridge();

    // Cleanup on unmount
    return () => {
      console.log('[AIAgentBridge] Component unmounting, cleaning up...');
      stopDurationTimer();
      cleanupPlanetKit();
    };
  }, [isInitialized, isLoggedIn, profile, language, voice, roomId]);

  // Handle end call
  const handleEndCall = () => {
    console.log('[AIAgentBridge] User ending call');
    toast({
      title: 'Call Ended',
      description: 'Returning to setup page',
    });
    handleDisconnect();
  };

  if (isConnecting) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center">
        <Loader2 className="h-16 w-16 text-white animate-spin mb-4" />
        <p className="text-white text-lg">Connecting to AI Agent Bridge...</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col">
      {/* Room audio element */}
      <audio ref={audioElementRef} autoPlay playsInline />

      {/* Top Bar - Fixed */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-black/30 backdrop-blur-sm border-b border-white/10 flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-white font-semibold text-sm">AI Agent Bridge</span>
            <span className="text-xs text-white/70">{roomId}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-white/70" />
            <span className="text-white text-sm">{participantCount}</span>
          </div>
          <span className="text-white text-sm font-mono">{formatDuration(callDuration)}</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 mt-14 mb-24">
        {/* AI Agent Status Card */}
        <Card className="bg-purple-500/10 backdrop-blur-md border-purple-500/30 p-6 w-full max-w-md">
          <div className="flex flex-col items-center gap-4">
            {/* AI Avatar */}
            <div
              className={`w-32 h-32 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center ${
                aiAgentJoined ? 'animate-pulse' : ''
              }`}
            >
              <Bot className="h-16 w-16 text-white" />
            </div>

            {/* Status */}
            <div className="text-center">
              <h2 className="text-white font-semibold text-xl mb-2">
                {aiAgentJoined ? '🤖 AI Agent Active' : '⏳ Waiting for AI...'}
              </h2>
              <p className="text-gray-300 text-sm">
                {aiAgentJoined
                  ? 'AI is listening and can respond to you'
                  : 'AI is joining the room from Render Service'}
              </p>
            </div>

            {/* Participant Count */}
            <div className="flex items-center gap-2 text-white/70 text-sm">
              <Users className="h-4 w-4" />
              <span>
                {participantCount} participant{participantCount !== 1 ? 's' : ''} in room
              </span>
            </div>
          </div>
        </Card>

        {/* Instructions */}
        <Card className="bg-blue-500/10 backdrop-blur-md border-blue-500/30 p-4 w-full max-w-md mt-4">
          <h3 className="text-white font-semibold text-sm mb-2">💡 How it works</h3>
          <ul className="text-gray-300 text-xs space-y-1">
            <li>• You joined as a normal participant</li>
            <li>• AI Agent joins from Render (Headless Chrome)</li>
            <li>• Speak naturally - AI will hear you and respond</li>
            <li>• AI responses will play through your speakers</li>
          </ul>
        </Card>
      </div>

      {/* Bottom Controls - Fixed */}
      <div className="fixed bottom-0 left-0 right-0 h-24 bg-black/30 backdrop-blur-sm border-t border-white/10 flex items-center justify-center gap-6 px-4">
        <Button
          size="lg"
          variant="destructive"
          onClick={handleEndCall}
          className="rounded-full w-16 h-16 bg-red-500 hover:bg-red-600"
        >
          <PhoneOff className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
};

export default AIAgentBridgeMeeting;
