import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiff } from '@/contexts/LiffContext';
import { aiAgentService, AIAgentState } from '@/services/ai-agent-service';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mic, MicOff, PhoneOff, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * AI Agent Call Meeting Page
 * 
 * Provides a voice-only interface for real-time conversation with Gemini 2.0 AI.
 * Mobile-first portrait layout with large touch-friendly controls.
 */
export const AIAgentCallMeeting = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, isLoggedIn } = useLiff();
  const { toast } = useToast();

  // URL parameters
  const language = (searchParams.get('lang') || 'ko') as 'ko' | 'en';
  const voice = searchParams.get('voice') || 'Kore';

  // Component state
  const [agentState, setAgentState] = useState<AIAgentState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<string>('');
  const [callDuration, setCallDuration] = useState(0);
  const [isConnecting, setIsConnecting] = useState(true);

  // Refs
  const callStartTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize call on mount
  useEffect(() => {
    if (!isLoggedIn || !profile) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in with LINE to use AI Agent Call',
        variant: 'destructive',
      });
      navigate('/setup');
      return;
    }

    const initializeCall = async () => {
      console.log('[AIAgentCall] Initializing AI Agent Call');
      console.log('[AIAgentCall] Language:', language, 'Voice:', voice);

      try {
        // Setup event listeners
        aiAgentService.on('stateChange', handleStateChange);
        aiAgentService.on('error', handleError);
        aiAgentService.on('transcript', handleTranscript);

        // Connect to AI agent
        await aiAgentService.connect({
          language,
          voice,
          systemPrompt: language === 'ko'
            ? `당신은 ${profile.displayName}님의 AI 비서입니다. 한국어로 자연스럽고 친근하게 대화하세요. 간결하고 명확하게 답변하세요.`
            : `You are an AI assistant for ${profile.displayName}. Respond naturally and helpfully in English. Keep responses concise and clear.`,
        });

        setIsConnecting(false);
        callStartTimeRef.current = Date.now();
        startDurationTimer();

        console.log('[AIAgentCall] Successfully connected to AI agent');
      } catch (error: any) {
        console.error('[AIAgentCall] Failed to initialize:', error);
        toast({
          title: 'Connection Failed',
          description: error.message || 'Failed to connect to AI agent',
          variant: 'destructive',
        });
        setTimeout(() => navigate('/setup'), 2000);
      }
    };

    initializeCall();

    // Cleanup on unmount
    return () => {
      console.log('[AIAgentCall] Cleaning up...');
      stopDurationTimer();
      aiAgentService.off('stateChange', handleStateChange);
      aiAgentService.off('error', handleError);
      aiAgentService.off('transcript', handleTranscript);
      aiAgentService.disconnect();
    };
  }, [isLoggedIn, profile, language, voice]);

  // Event handlers
  const handleStateChange = (newState: AIAgentState) => {
    console.log('[AIAgentCall] State changed:', newState);
    setAgentState(newState);

    if (newState === 'disconnected' || newState === 'error') {
      stopDurationTimer();
    }
  };

  const handleError = (errorMessage: string) => {
    console.error('[AIAgentCall] Error:', errorMessage);
    toast({
      title: 'Error',
      description: errorMessage,
      variant: 'destructive',
    });
  };

  const handleTranscript = ({ text, isFinal }: { text: string; isFinal: boolean }) => {
    console.log('[AIAgentCall] Transcript:', text, 'isFinal:', isFinal);
    if (isFinal) {
      setTranscript((prev) => prev + '\n' + text);
    } else {
      setTranscript((prev) => prev + text);
    }
  };

  // Call duration timer
  const startDurationTimer = () => {
    durationIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
      setCallDuration(elapsed);
    }, 1000);
  };

  const stopDurationTimer = () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  };

  // User actions
  const handleToggleMute = () => {
    const newMuted = aiAgentService.toggleMute();
    setIsMuted(newMuted);
    toast({
      title: newMuted ? 'Microphone Muted' : 'Microphone Unmuted',
      description: newMuted ? 'AI cannot hear you' : 'AI can hear you now',
    });
  };

  const handleEndCall = () => {
    console.log('[AIAgentCall] Ending call...');
    aiAgentService.disconnect();
    toast({
      title: 'Call Ended',
      description: 'Returning to setup page',
    });
    setTimeout(() => navigate('/setup'), 1000);
  };

  // UI helpers
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStateDisplay = (): { text: string; color: string } => {
    switch (agentState) {
      case 'connecting':
        return { text: 'Connecting...', color: 'text-yellow-400' };
      case 'connected':
        return { text: 'Connected', color: 'text-green-400' };
      case 'listening':
        return { text: 'Listening...', color: 'text-blue-400' };
      case 'speaking':
        return { text: 'AI Speaking...', color: 'text-purple-400' };
      case 'error':
        return { text: 'Error', color: 'text-red-400' };
      case 'disconnected':
        return { text: 'Disconnected', color: 'text-gray-400' };
      default:
        return { text: 'Idle', color: 'text-gray-400' };
    }
  };

  const stateDisplay = getStateDisplay();

  // Show loading screen while connecting
  if (isConnecting) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-16 h-16 animate-spin text-white" />
          <p className="text-white text-xl font-semibold">Connecting to AI Agent...</p>
          <p className="text-gray-300 text-sm">Language: {language === 'ko' ? '한국어' : 'English'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col">
      {/* Top Bar - Fixed */}
      <div className="fixed top-0 left-0 right-0 h-16 bg-black/30 backdrop-blur-sm border-b border-white/10 flex items-center justify-between px-4 z-10">
        <div className="flex flex-col">
          <span className="text-white font-semibold text-lg">AI Agent Call</span>
          <span className={`text-xs ${stateDisplay.color}`}>{stateDisplay.text}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white font-mono text-sm">{formatDuration(callDuration)}</span>
        </div>
      </div>

      {/* Main Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto mt-16 mb-24 px-4 py-6">
        {/* AI Avatar */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div
              className={`w-32 h-32 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-2xl ${
                agentState === 'speaking' ? 'animate-pulse' : ''
              }`}
            >
              <svg
                className="w-16 h-16 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            {/* Speaking indicator ring */}
            {agentState === 'speaking' && (
              <div className="absolute inset-0 rounded-full border-4 border-purple-400 animate-ping"></div>
            )}
          </div>
        </div>

        {/* User Info */}
        <div className="text-center mb-6">
          <p className="text-white text-lg font-medium">{profile?.displayName || 'User'}</p>
          <p className="text-gray-300 text-sm">Talking with Gemini AI</p>
        </div>

        {/* Transcript Card */}
        {transcript && (
          <Card className="bg-white/10 backdrop-blur-md border-white/20 p-4 mb-4">
            <div className="text-white/90 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
              {transcript}
            </div>
          </Card>
        )}

        {/* Status Message */}
        {agentState === 'listening' && (
          <div className="text-center">
            <p className="text-blue-300 text-sm animate-pulse">
              {language === 'ko' ? '말씀해주세요...' : 'Speak now...'}
            </p>
          </div>
        )}
      </div>

      {/* Bottom Controls - Fixed */}
      <div className="fixed bottom-0 left-0 right-0 h-24 bg-black/30 backdrop-blur-sm border-t border-white/10 flex items-center justify-center gap-6 px-4">
        {/* Mute Button */}
        <Button
          size="lg"
          variant="ghost"
          onClick={handleToggleMute}
          className={`w-16 h-16 rounded-full ${
            isMuted
              ? 'bg-red-500/80 hover:bg-red-600/80'
              : 'bg-white/20 hover:bg-white/30'
          } backdrop-blur-sm`}
        >
          {isMuted ? (
            <MicOff className="w-8 h-8 text-white" />
          ) : (
            <Mic className="w-8 h-8 text-white" />
          )}
        </Button>

        {/* End Call Button */}
        <Button
          size="lg"
          onClick={handleEndCall}
          className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 shadow-2xl"
        >
          <PhoneOff className="w-10 h-10 text-white" />
        </Button>
      </div>
    </div>
  );
};

export default AIAgentCallMeeting;
