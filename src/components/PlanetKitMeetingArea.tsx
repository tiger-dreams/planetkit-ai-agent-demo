import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Activity,
  BarChart3,
  Sparkles,
  Clock,
  Users,
  Share2,
  Bot,
  Loader2,
  UserMinus,
  Ear,
  MessageCircle,
} from "lucide-react";
import { PlanetKitConfig, ConnectionStatus, Participant, AIProvider } from "@/types/video-sdk";
import { useVideoSDK } from "@/contexts/VideoSDKContext";
import { useToast } from "@/hooks/use-toast";
import { TileView, TileParticipant } from "@/components/TileView";
import { MediaStatsPanel } from "@/components/MediaStatsPanel";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslations } from "@/utils/translations";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useLiff } from "@/contexts/LiffContext";
import { InviteUserDialog } from "@/components/InviteUserDialog";
// Import per-environment PlanetKit builds
import * as PlanetKitReal from "@line/planet-kit";
import * as PlanetKitEval from "@line/planet-kit/dist/planet-kit-eval";
import PlanetKitVirtualBackground from "@line/planet-kit-virtual-background";
import { LANGUAGE_VOICE_MAP } from "@/config/ai-agent-languages";
import type { AgentLanguage } from "@/config/ai-agent-languages";

interface PlanetKitMeetingAreaProps {
  config: PlanetKitConfig;
  onDisconnect?: () => void;
}

export const PlanetKitMeetingArea = ({ config, onDisconnect }: PlanetKitMeetingAreaProps) => {
  const { toast } = useToast();
  const { language } = useLanguage();
  const t = getTranslations(language);
  const { liffId, liff, profile } = useLiff();
  const { aiProvider } = useVideoSDK();

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false,
    connecting: false
  });
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connectionStartTime, setConnectionStartTime] = useState<Date | null>(null);
  const [callDuration, setCallDuration] = useState<string>("00:00:00");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [isInvitingAIAgent, setIsInvitingAIAgent] = useState(false);
  const [isKickingAIAgent, setIsKickingAIAgent] = useState(false);
  const [aiAgentJoined, setAiAgentJoined] = useState(false);
  const [aiAgentSessionUsed, setAiAgentSessionUsed] = useState(false);
  const [aiAgentMode, setAiAgentMode] = useState<'respond' | 'listen'>('respond');
  const [isTogglingMode, setIsTogglingMode] = useState(false);
  const [isAIAgentInviter, setIsAIAgentInviter] = useState(false);
  const [isStatsPanelOpen, setIsStatsPanelOpen] = useState(false);
  const [isBlurOn, setIsBlurOn] = useState(false);
  const [isBlurToggling, setIsBlurToggling] = useState(false);
  const virtualBackgroundRef = useRef<any>(null);
  const blurCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Video element refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const [conference, setConference] = useState<any>(null);
  // Map of remote participant video elements
  const remoteVideoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  // Prevent iOS WebKit double-tap events (ref-based guard, faster than React state)
  const isConnectingRef = useRef(false);

  // Manage the blur canvas imperatively, outside the React tree.
  // If kept in JSX, reparenting it later breaks the original parent's
  // reconciliation (insertBefore: not a child) — leading to a black screen
  // when MediaStatsPanel toggles.
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '-9999px';
    canvas.style.left = '-9999px';
    canvas.style.width = '1px';
    canvas.style.height = '1px';
    document.body.appendChild(canvas);
    blurCanvasRef.current = canvas;
    return () => {
      canvas.parentElement?.removeChild(canvas);
      blurCanvasRef.current = null;
    };
  }, []);

  // Blur ON: overlay the canvas onto the local self-tile.
  // Blur OFF: park the canvas off-screen under document.body.
  useEffect(() => {
    const canvas = blurCanvasRef.current;
    if (!canvas) return;
    const localTile = document.querySelector(
      `[data-participant-id="${config.userId}"] .video-container`
    ) as HTMLElement | null;

    if (isBlurOn && localTile) {
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.objectFit = 'cover';
      canvas.style.zIndex = '5';
      canvas.style.transform = 'scaleX(-1)';
      canvas.style.borderRadius = '8px';
      if (canvas.parentElement !== localTile) {
        localTile.appendChild(canvas);
      }
    } else {
      canvas.style.position = 'fixed';
      canvas.style.top = '-9999px';
      canvas.style.left = '-9999px';
      canvas.style.width = '1px';
      canvas.style.height = '1px';
      canvas.style.zIndex = '';
      canvas.style.transform = '';
      canvas.style.borderRadius = '';
      canvas.style.objectFit = '';
      if (canvas.parentElement !== document.body) {
        document.body.appendChild(canvas);
      }
    }
  }, [isBlurOn, config.userId, participants]);

  // Update page title
  useEffect(() => {
    if (connectionStatus.connected) {
      document.title = language === 'ko'
        ? `WebPlanet SDK 테스트 - 통화 중`
        : `WebPlanet SDK Test - In Call`;
    } else {
      document.title = language === 'ko' ? 'WebPlanet SDK 테스트' : 'WebPlanet SDK Test';
    }
  }, [language, connectionStatus.connected]);

  // Update call duration
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (connectionStatus.connected && connectionStartTime) {
      interval = setInterval(() => {
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - connectionStartTime.getTime()) / 1000);

        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;

        setCallDuration(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [connectionStatus.connected, connectionStartTime]);

  // Note: Local user talking status is now handled by PlanetKit's evtMyTalkingStatusUpdated event
  // No need for manual AudioContext monitoring

  // Connect to PlanetKit Conference
  const connectToConference = async () => {
    // Prevent iOS WebKit double-tap: ref-based guard, faster than React state updates
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;

    try { // ensure isConnectingRef.current = false in finally

    if (!config.serviceId || !config.userId || !config.accessToken) {
      toast({
        title: "Configuration Error",
        description: "PlanetKit configuration is invalid.",
        variant: "destructive",
      });
      return;
    }

    // Environment is now always 'eval' (set automatically)
    // No need to check for environment selection

    setConnectionStatus({ connected: false, connecting: true });

    // The PlanetKit SDK manages media streams directly during joinConference
    // No separate getUserMedia call needed (avoids duplicate permission prompts)

    try {
      const attemptJoin = async (PlanetKitModule: any, envLabel: 'eval' | 'real') => {
        // Conference flow (Group Call)
        const planetKitConference = new PlanetKitModule.Conference();

          const conferenceDelegate = {
            evtConnected: async () => {
              setConnectionStatus({ connected: true, connecting: false });
              setConnectionStartTime(new Date());

              // Acquire and display the local video stream (SDK only requests permission; we attach the stream ourselves)
              try {
                const localStream = await navigator.mediaDevices.getUserMedia({
                  video: true,
                  audio: false  // Audio is managed by the SDK
                });

                if (localVideoRef.current) {
                  localVideoRef.current.srcObject = localStream;
                  await localVideoRef.current.play();
                  console.log('[PlanetKit] Local video stream connected');
                }
              } catch (mediaError) {
                console.warn('[PlanetKit] Could not get local video stream:', mediaError);
              }

              // Initialize only the local participant (existing peers are handled in evtPeerListUpdated)
              setParticipants([{
                id: config.userId,
                name: config.displayName || config.userId,
                isVideoOn: true,
                isAudioOn: true,
                videoElement: localVideoRef.current || undefined,
                isLocal: true
              }]);

              console.log('[PlanetKit] evtConnected - local participant set, waiting for evtPeerListUpdated for existing peers');

              // Local video mirroring is applied immediately via CSS transform in TileView

              toast({
                title: t.connectionSuccessTitle,
                description: t.connectionSuccessDescription,
              });
            },

            evtDisconnected: (disconnectDetails: any) => {
              // Clean up local media streams (turn off camera/mic)
              if (localVideoRef.current && localVideoRef.current.srcObject) {
                const stream = localVideoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => {
                  track.stop();
                });
                localVideoRef.current.srcObject = null;
              }

              // Clean up remote video elements
              remoteVideoElementsRef.current.clear();

              setConnectionStatus({ connected: false, connecting: false });
              setParticipants([]);
              setConnectionStartTime(null);
              setCallDuration("00:00:00");

              toast({
                title: "연결 해제",
                description: "PlanetKit Conference 연결이 해제되었습니다.",
              });
            },

          evtPeerListUpdated: (peerUpdateInfo: any) => {
            // PlanetKit provides addedPeers and removedPeers arrays
            const addedPeers = peerUpdateInfo.addedPeers || [];
            const removedPeers = peerUpdateInfo.removedPeers || [];
            const totalPeersCount = peerUpdateInfo.totalPeersCount || 0;

            console.log('[PlanetKit] evtPeerListUpdated:', {
              addedPeers: addedPeers.map((p: any) => p.userId || p.peerId || p.id),
              removedPeers: removedPeers.map((p: any) => p.userId || p.peerId || p.id),
              totalPeersCount,
              currentRemoteVideoRefs: Array.from(remoteVideoElementsRef.current.keys())
            });

            // Handle removed peers
            removedPeers.forEach((peer: any) => {
              const peerId = peer.userId || peer.peerId || peer.id || peer.myId;

              // Request PlanetKit to remove the peer's video
              if (planetKitConference && typeof planetKitConference.removePeerVideo === 'function') {
                try {
                  planetKitConference.removePeerVideo({ peerId: peerId });
                } catch (err) {
                  // Ignore video removal failures
                }
              }

              // Clean up the video element
              const videoElement = remoteVideoElementsRef.current.get(peerId);
              if (videoElement) {
                if (videoElement.srcObject) {
                  const stream = videoElement.srcObject as MediaStream;
                  stream.getTracks().forEach(track => track.stop());
                  videoElement.srcObject = null;
                }
                if (videoElement.parentNode) {
                  videoElement.parentNode.removeChild(videoElement);
                }
                remoteVideoElementsRef.current.delete(peerId);
              }
            });

            // Request video for newly added peers
            addedPeers.forEach((peer: any) => {
              const peerId = peer.userId || peer.peerId || peer.id || peer.myId;

              // Skip peers we've already requested video for (avoids duplicate requests)
              if (remoteVideoElementsRef.current.has(peerId)) {
                console.log('[PlanetKit] Peer already has video element, skipping:', peerId);
                return;
              }

              // Create the video element
              const videoElement = document.createElement('video');
              videoElement.autoplay = true;
              videoElement.playsInline = true;
              videoElement.muted = false;
              videoElement.style.width = '100%';
              videoElement.style.height = '100%';
              videoElement.style.objectFit = 'cover';
              videoElement.style.backgroundColor = '#000';

              // Request video from PlanetKit
              if (planetKitConference && typeof planetKitConference.requestPeerVideo === 'function') {
                try {
                  planetKitConference.requestPeerVideo({
                    userId: peerId,
                    resolution: 'vga',
                    videoViewElement: videoElement
                  });

                  remoteVideoElementsRef.current.set(peerId, videoElement);

                  videoElement.onerror = () => {
                    // Ignore video errors
                  };
                } catch (err) {
                  // Ignore video request failures
                }
              }
            });

            // Detect AI Agent leaving
            const removedAIAgent = removedPeers.find((peer: any) => {
              const peerId = peer.userId || peer.peerId || peer.id || peer.myId;
              return peerId && peerId.includes('AI_HEADLESS_');
            });
            if (removedAIAgent) {
              setAiAgentJoined(false);
              setAiAgentMode('respond');
              setIsAIAgentInviter(false);
              setAiAgentSessionUsed(true); // Session consumed once — cannot re-invite
            }

            setParticipants(prev => {
              // Remove participants that have been removed from the existing list
              let updated = prev.filter(p => {
                const isRemoved = removedPeers.some((removedPeer: any) => {
                  const removedPeerId = removedPeer.userId || removedPeer.peerId || removedPeer.id || removedPeer.myId;
                  return removedPeerId === p.id;
                });
                return !isRemoved;
              });

              // Local participant + updated remote participants
              const localParticipant = updated.find(p => p.id === config.userId) || {
                id: config.userId,
                name: config.displayName || config.userId,
                isVideoOn: isVideoOn,
                isAudioOn: isAudioOn,
                videoElement: localVideoRef.current || undefined,
                isLocal: true
              };

              const remoteParticipants = updated.filter(p => p.id !== config.userId);

              // Collect IDs of remote peers that already exist
              const existingRemotePeerIds = new Set(remoteParticipants.map(p => p.id));

              // Add newly added participants (excluding existing peers)
              const newParticipants = addedPeers
                .filter((peer: any) => {
                  const peerId = peer.userId || peer.peerId || peer.id || peer.myId;
                  return !existingRemotePeerIds.has(peerId);
                })
                .map((peer: any, index: number) => {
                  const peerId = peer.userId || peer.peerId || peer.id || peer.myId || `peer-${index}`;
                  // Try various displayName field names (may differ across PlanetKit SDK versions)
                  const peerName = peer.displayName || peer.peerDisplayName || peer.name || peer.peerName || peer.userId || `User ${index}`;
                  const videoElement = remoteVideoElementsRef.current.get(peerId);

                  return {
                    id: peerId,
                    name: peerName,
                    isVideoOn: peer.videoState !== undefined ? peer.videoState === 'enabled' : true,
                    isAudioOn: peer.audioState !== undefined ? peer.audioState === 'enabled' : true,
                    videoElement: videoElement
                  };
                });

              return [localParticipant, ...remoteParticipants, ...newParticipants];
            });

            // Detect AI Agent joining
            const aiAgent = addedPeers.find((peer: any) => {
              const peerId = peer.userId || peer.peerId || peer.id || peer.myId;
              return peerId && peerId.includes('AI_HEADLESS_');
            });

            if (aiAgent && !aiAgentJoined) {
              const aiPeerId = aiAgent.userId || aiAgent.peerId || aiAgent.id || aiAgent.myId;
              console.log('[AI Agent] ✅ AI Agent detected in room:', aiPeerId);
              setAiAgentJoined(true);
              toast({
                title: language === 'ko' ? 'AI Agent 참가 완료' : 'AI Agent Joined',
                description: language === 'ko' ? 'AI가 회의에 참가했습니다!' : 'AI has joined the meeting!',
              });
            }
          },

          evtPeersVideoUpdated: (videoUpdateInfo: any) => {
            const updates = Array.isArray(videoUpdateInfo) ? videoUpdateInfo : [];

            updates.forEach((update: any) => {
              const peer = update.peer || {};
              const peerId = peer.userId || peer.peerId || peer.id;
              const videoStatus = update.videoStatus || {};

              setParticipants(prev => prev.map(p => {
                if (p.id === peerId) {
                  return {
                    ...p,
                    isVideoOn: videoStatus.state === 'enabled'
                  };
                }
                return p;
              }));
            });
          },

          // Video pause event
          evtPeersVideoPaused: (peerInfoArray: any) => {
            console.log('[REMOTE VIDEO] evtPeersVideoPaused called:', peerInfoArray);
            const peers = Array.isArray(peerInfoArray) ? peerInfoArray : [peerInfoArray];

            peers.forEach((peerInfo: any) => {
              // evtPeersVideoPaused structure: {peer: {userId, ...}, pauseReason: ...}
              const peer = peerInfo.peer || peerInfo;
              const peerId = peer.userId || peer.peerId || peer.id;
              console.log('[REMOTE VIDEO] Peer video paused, peerId:', peerId);

              setParticipants(prev => {
                const updated = prev.map(p => {
                  if (p.id === peerId) {
                    console.log('[REMOTE VIDEO] Setting isVideoOn=false for:', peerId);
                    return { ...p, isVideoOn: false };
                  }
                  return p;
                });
                console.log('[REMOTE VIDEO] Updated participants:', updated);
                return updated;
              });
            });
          },

          // Video resume event
          evtPeersVideoResumed: (peerInfoArray: any) => {
            console.log('[REMOTE VIDEO] evtPeersVideoResumed called:', peerInfoArray);
            const peers = Array.isArray(peerInfoArray) ? peerInfoArray : [peerInfoArray];

            peers.forEach((peerInfo: any) => {
              const peerId = peerInfo.userId || peerInfo.peerId || peerInfo.id;
              console.log('[REMOTE VIDEO] Peer video resumed, peerId:', peerId);

              setParticipants(prev => {
                const updated = prev.map(p => {
                  if (p.id === peerId) {
                    console.log('[REMOTE VIDEO] Setting isVideoOn=true for:', peerId);
                    return { ...p, isVideoOn: true };
                  }
                  return p;
                });
                console.log('[REMOTE VIDEO] Updated participants:', updated);
                return updated;
              });
            });
          },

          // Microphone mute event
          evtPeersMicMuted: (peerInfoArray: any) => {
            const peers = Array.isArray(peerInfoArray) ? peerInfoArray : [peerInfoArray];

            peers.forEach((peerInfo: any) => {
              const peerId = peerInfo.userId || peerInfo.peerId || peerInfo.id;

              setParticipants(prev => prev.map(p => {
                if (p.id === peerId) {
                  return { ...p, isAudioOn: false };
                }
                return p;
              }));
            });
          },

          // Microphone unmute event
          evtPeersMicUnmuted: (peerInfoArray: any) => {
            const peers = Array.isArray(peerInfoArray) ? peerInfoArray : [peerInfoArray];

            peers.forEach((peerInfo: any) => {
              const peerId = peerInfo.userId || peerInfo.peerId || peerInfo.id;

              setParticipants(prev => prev.map(p => {
                if (p.id === peerId) {
                  return { ...p, isAudioOn: true };
                }
                return p;
              }));
            });
          },

          // Update talking status for the local user (Issue #10: Speaking indicator)
          evtMyTalkingStatusUpdated: (isActive: boolean) => {

            setParticipants(prev => prev.map(p => {
              if (p.id === config.userId) {
                return { ...p, isTalking: isActive, isSpeaking: isActive };
              }
              return p;
            }));
          },

          // Talking status update event for remote participants (Issue #10: Speaking indicator)
          evtPeersTalkingStatusUpdated: (talkingInfoArray: any) => {
            const talkingPeers = Array.isArray(talkingInfoArray) ? talkingInfoArray : [talkingInfoArray];


            talkingPeers.forEach((talkingInfo: any) => {
              // PlanetKit sends {active: [...], inactive: [...]} structure
              const activeUsers = talkingInfo.active || [];
              const inactiveUsers = talkingInfo.inactive || [];

              setParticipants(prev => prev.map(p => {
                // Check if user is in active or inactive list
                const isTalking = activeUsers.includes(p.id);
                const isInactive = inactiveUsers.includes(p.id);

                if (isTalking || isInactive) {
                  // Update both isTalking and isSpeaking for TileView compatibility
                  return { ...p, isTalking, isSpeaking: isTalking };
                }
                return p;
              }));
            });
          }
        };

        const conferenceParams = {
          myId: config.userId,
          displayName: config.displayName || config.userId,
          myServiceId: config.serviceId,
          roomId: config.roomId,
          roomServiceId: config.serviceId,
          accessToken: config.accessToken,
          mediaType: "video",
          mediaHtmlElement: { roomAudio: audioElementRef.current, myVideo: localVideoRef.current },
          delegate: conferenceDelegate,
          enableTalkingStatusEvent: true // Enable speaking indicator events
        };

        console.log('[PlanetKit] Calling joinConference with params:', {
          myId: conferenceParams.myId,
          roomId: conferenceParams.roomId,
          myServiceId: conferenceParams.myServiceId,
          mediaType: conferenceParams.mediaType,
          hasLocalVideo: !!conferenceParams.mediaHtmlElement?.myVideo,
          hasRoomAudio: !!conferenceParams.mediaHtmlElement?.roomAudio,
        });
        await planetKitConference.joinConference(conferenceParams);
        console.log('[PlanetKit] joinConference succeeded');
        setConference(planetKitConference);

        // Register Virtual Background (5.6+ supports WebView). Toggled later.
        // VB 1.2.0 build doesn't expose waitForVirtualBackgroundInitialization;
        // per the README NOTE, startVirtualBackgroundBlur handles init internally,
        // so calling it on demand is safe.
        try {
          const vb = new PlanetKitVirtualBackground();
          if (typeof planetKitConference.registerVirtualBackground === 'function') {
            planetKitConference.registerVirtualBackground(vb);
            virtualBackgroundRef.current = vb;
            console.log('[PlanetKit] VirtualBackground registered');
          }
        } catch (e) {
          console.warn('[PlanetKit] VirtualBackground register failed', e);
        }
      }; // end of attemptJoin function

    // Environment is always 'eval' (default)
    const environment = config.environment || 'eval';
    const PlanetKitModule = environment === 'eval' ? PlanetKitEval : PlanetKitReal;
    await attemptJoin(PlanetKitModule, environment);

    } catch (error) {
      console.error('[PlanetKit] joinConference failed:', error);
      console.error('[PlanetKit] Error details:', {
        name: error instanceof Error ? error.name : 'unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        config: {
          hasServiceId: !!config.serviceId,
          hasUserId: !!config.userId,
          hasToken: !!config.accessToken,
          roomId: config.roomId,
          environment: config.environment,
        },
        refs: {
          hasLocalVideo: !!localVideoRef.current,
          hasAudioElement: !!audioElementRef.current,
        }
      });
      setConnectionStatus({
        connected: false,
        connecting: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      });
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Failed to connect to PlanetKit Conference.",
        variant: "destructive",
      });
    }

    } finally {
      isConnectingRef.current = false;
    }
  };

  // Disconnect from Conference
  const disconnect = async () => {
    try {
      // Clean up local media streams (turn off camera/mic)
      if (localVideoRef.current && localVideoRef.current.srcObject) {
        const stream = localVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          track.stop();
        });
        localVideoRef.current.srcObject = null;
      }

      // Disconnect from the Conference
      if (conference && typeof conference.leaveConference === 'function') {
        try {
          await conference.leaveConference();
        } catch (leaveError) {
          // Ignore Conference leave errors
        }
        setConference(null);
      }

      // Clean up remote video elements
      remoteVideoElementsRef.current.clear();

      // Reset state
      setConnectionStatus({ connected: false, connecting: false });
      setParticipants([]);
      setConnectionStartTime(null);
      setCallDuration("00:00:00");

      toast({
        title: t.callEndedTitle,
        description: t.callEndedDescription,
      });

      // Redirect the page
      if (onDisconnect) {
        setTimeout(() => onDisconnect(), 500);
      }
    } catch (error) {
      // Ignore Conference disconnect errors
    }
  };

  // Toggle microphone
  const toggleAudio = async () => {
    if (connectionStatus.connected) {
      try {
        const newAudioState = !isAudioOn;

        // PlanetKit API: muteMyAudio(isMuted) - true to mute, false to unmute
        if (conference && typeof conference.muteMyAudio === 'function') {
          await conference.muteMyAudio(!newAudioState);
        }

        setIsAudioOn(newAudioState);

        // Update local participant state
        setParticipants(prev => prev.map(p =>
          p.id === config.userId ? { ...p, isAudioOn: newAudioState } : p
        ));
      } catch (error) {
        // Ignore microphone toggle failures
      }
    }
  };

  // Toggle video
  const toggleVideo = async () => {
    if (connectionStatus.connected) {
      try {
        const newVideoState = !isVideoOn;

        // Directly control MediaStream tracks (actually stop/resume video transmission)
        if (localVideoRef.current && localVideoRef.current.srcObject) {
          const stream = localVideoRef.current.srcObject as MediaStream;
          const videoTracks = stream.getVideoTracks();
          videoTracks.forEach(track => {
            track.enabled = newVideoState; // true to enable, false to disable
          });
        }

        // Also call the PlanetKit API (sync internal SDK state)
        if (conference) {
          if (newVideoState) {
            if (typeof conference.resumeMyVideo === 'function') {
              await conference.resumeMyVideo();
            }
          } else {
            if (typeof conference.pauseMyVideo === 'function') {
              await conference.pauseMyVideo();
            }
          }
        }

        setIsVideoOn(newVideoState);

        // Update local participant state
        setParticipants(prev => prev.map(p =>
          p.id === config.userId ? { ...p, isVideoOn: newVideoState } : p
        ));
      } catch (error) {
        // Ignore video toggle failures
      }
    }
  };

  const toggleBlur = async () => {
    if (!connectionStatus.connected || !conference || isBlurToggling) return;
    if (!virtualBackgroundRef.current) {
      toast({ title: 'Virtual Background not ready', variant: 'destructive' });
      return;
    }
    setIsBlurToggling(true);
    try {
      if (isBlurOn) {
        if (typeof conference.stopVirtualBackground === 'function') {
          await conference.stopVirtualBackground();
        }
        setIsBlurOn(false);
      } else {
        const canvas = blurCanvasRef.current;
        if (!canvas) {
          toast({ title: 'Blur canvas not ready', variant: 'destructive' });
          return;
        }
        // Even with mediaHtmlElement.myVideo set, some environments may leave the
        // SDK's internal videoElement unset — bind it explicitly at toggle time.
        if (typeof conference.changeVirtualBackgroundVideoElement === 'function' && localVideoRef.current) {
          conference.changeVirtualBackgroundVideoElement(localVideoRef.current);
        }
        await conference.startVirtualBackgroundBlur(canvas, 15);
        setIsBlurOn(true);
      }
    } catch (e: any) {
      console.error('[PlanetKit] toggleBlur failed', e);
      toast({ title: `Blur toggle failed: ${e?.message ?? e}`, variant: 'destructive' });
    } finally {
      setIsBlurToggling(false);
    }
  };

  // Share invite link (select user from call history)
  const shareInviteUrl = () => {
    if (!config.roomId || !liffId) {
      toast({
        title: language === 'ko' ? '초대 링크 생성 실패' : 'Failed to Create Invite Link',
        description: language === 'ko' ? 'Room ID 또는 LIFF ID가 없습니다.' : 'Room ID or LIFF ID is missing.',
        variant: 'destructive',
      });
      return;
    }

    if (!profile?.userId) {
      toast({
        title: language === 'ko' ? '사용자 정보 없음' : 'No User Info',
        description: language === 'ko' ? '로그인 정보를 확인할 수 없습니다.' : 'Cannot verify login information.',
        variant: 'destructive',
      });
      return;
    }

    // Open the call-history user selection dialog
    setInviteDialogOpen(true);
  };

  // AI Agent invite handler
  const inviteAIAgent = async () => {
    if (!config.roomId) {
      toast({
        title: language === 'ko' ? 'AI Agent 초대 실패' : 'Failed to Invite AI Agent',
        description: language === 'ko' ? 'Room ID가 없습니다.' : 'Room ID is missing.',
        variant: 'destructive',
      });
      return;
    }

    setIsInvitingAIAgent(true);

    try {
      const renderServiceUrl = import.meta.env.VITE_RENDER_SERVICE_URL;

      if (!renderServiceUrl) {
        throw new Error('VITE_RENDER_SERVICE_URL not configured');
      }

      const sanitized = config.roomId.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().substring(0, 20);
      const aiUserId = `AI_HEADLESS_${sanitized}`;

      const agentVoice = LANGUAGE_VOICE_MAP[language as AgentLanguage] ?? 'Aoede';

      console.log('[AI Agent] Calling Render Service:', {
        roomId: config.roomId,
        userId: aiUserId,
        language,
      });

      const response = await fetch(`${renderServiceUrl}/join-as-agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId: config.roomId,
          userId: aiUserId,
          language,
          voice: agentVoice,
          provider: aiProvider,
        }),
      });

      const data = await response.json();

      if (data.success) {
        console.log('[AI Agent] ✅ Render Service called successfully:', data);
        setIsAIAgentInviter(true);
        toast({
          title: language === 'ko' ? 'AI Agent 참가 중' : 'AI Agent Joining',
          description: language === 'ko' ? 'AI가 회의에 참가하고 있습니다...' : 'AI is joining the meeting...',
        });
      } else {
        throw new Error(data.error || 'Failed to call Render Service');
      }
    } catch (error: any) {
      console.error('[AI Agent] Failed to invite AI Agent:', error);
      toast({
        title: language === 'ko' ? 'AI Agent 초대 실패' : 'Failed to Invite AI Agent',
        description: error.message || (language === 'ko' ? 'AI Agent를 초대하지 못했습니다.' : 'Could not invite AI Agent'),
        variant: 'destructive',
      });
    } finally {
      setIsInvitingAIAgent(false);
    }
  };

  const kickAIAgent = async () => {
    if (!config.roomId) return;

    setIsKickingAIAgent(true);
    try {
      const renderServiceUrl = import.meta.env.VITE_RENDER_SERVICE_URL;
      if (!renderServiceUrl) throw new Error('VITE_RENDER_SERVICE_URL not configured');

      const response = await fetch(`${renderServiceUrl}/disconnect-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: config.roomId }),
      });

      const data = await response.json();
      if (data.success) {
        setAiAgentJoined(false);
        toast({
          title: language === 'ko' ? 'AI Agent 내보내기 완료' : 'AI Agent Removed',
          description: language === 'ko' ? 'AI가 회의에서 나갔습니다.' : 'AI has left the meeting.',
        });
      } else {
        throw new Error(data.error || 'Failed to disconnect agent');
      }
    } catch (error: any) {
      toast({
        title: language === 'ko' ? 'AI Agent 내보내기 실패' : 'Failed to Remove AI Agent',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsKickingAIAgent(false);
    }
  };

  // AI Agent mode toggle handler (listen/respond)
  const toggleAgentMode = async () => {
    if (!config.roomId || isTogglingMode) return;

    const newMode = aiAgentMode === 'respond' ? 'listen' : 'respond';
    setIsTogglingMode(true);

    try {
      const renderServiceUrl = import.meta.env.VITE_RENDER_SERVICE_URL;
      if (!renderServiceUrl) throw new Error('VITE_RENDER_SERVICE_URL not configured');

      const response = await fetch(`${renderServiceUrl}/agent-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: config.roomId, mode: newMode }),
      });

      const data = await response.json();
      if (data.success) {
        setAiAgentMode(newMode);
        toast({
          title: newMode === 'listen'
            ? (language === 'ko' ? '듣기 모드' : language === 'ja' ? 'リスニングモード' : language === 'zh-TW' ? '聆聽模式' : language === 'th' ? 'โหมดฟัง' : 'Listen Mode')
            : (language === 'ko' ? '응답 모드' : language === 'ja' ? '応答モード' : language === 'zh-TW' ? '回應模式' : language === 'th' ? 'โหมดตอบ' : 'Respond Mode'),
          description: newMode === 'listen'
            ? (language === 'ko' ? 'AI가 대화를 듣고 있습니다.' : language === 'ja' ? 'AIは会話を聞いています。' : language === 'zh-TW' ? 'AI正在聆聽對話。' : language === 'th' ? 'AI กำลังฟังการสนทนา' : 'AI is listening to the conversation.')
            : (language === 'ko' ? 'AI가 대화에 참여합니다.' : language === 'ja' ? 'AIが会話に参加します。' : language === 'zh-TW' ? 'AI重新加入對話。' : language === 'th' ? 'AI กลับมาร่วมสนทนา' : 'AI is back in the conversation.'),
        });
      } else {
        throw new Error(data.error || 'Failed to change agent mode');
      }
    } catch (error: any) {
      console.error('[AI Agent] Failed to toggle mode:', error);
      toast({
        title: language === 'ko' ? '모드 전환 실패' : 'Mode Change Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsTogglingMode(false);
    }
  };

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      // Clean up local media streams
      if (localVideoRef.current && localVideoRef.current.srcObject) {
        const stream = localVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          track.stop();
        });
        localVideoRef.current.srcObject = null;
      }

      // Clean up the Conference
      const currentConference = conference;
      if (currentConference && typeof currentConference.leaveConference === 'function') {
        try {
          currentConference.leaveConference().catch(() => {
            // Ignore Conference leave errors during unmount
          });
        } catch (error) {
          // Ignore Conference leave errors during unmount
        }
      }

      // Clean up remote video elements
      remoteVideoElementsRef.current.clear();
    };
  }, []);

  // Detect browser close / background transition and try to end the session
  useEffect(() => {
    // beforeunload: detect browser close, refresh, or navigation
    const handleBeforeUnload = () => {
      // Synchronously attempt to end the Conference (limited inside LINE in-app browser)
      if (conference && typeof conference.leaveConference === 'function') {
        try {
          // Async call but best-effort
          conference.leaveConference().catch(() => {});
        } catch (error) {
          // Ignore errors
        }
      }
    };

    // visibilitychange: page is hidden (background, switched apps)
    let visibilityTimer: NodeJS.Timeout | null = null;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // If still hidden 30 seconds after the page was hidden, end the session
        visibilityTimer = setTimeout(() => {
          if (document.hidden && conference && connectionStatus.connected) {
            console.log('[PlanetKit] Page hidden for 30s, attempting to leave conference');
            if (typeof conference.leaveConference === 'function') {
              conference.leaveConference().catch(() => {});
            }
          }
        }, 30000); // 30 seconds
      } else {
        // Cancel the timer when the page becomes visible again
        if (visibilityTimer) {
          clearTimeout(visibilityTimer);
          visibilityTimer = null;
        }
      }
    };

    // Register event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (visibilityTimer) {
        clearTimeout(visibilityTimer);
      }
    };
  }, [conference, connectionStatus.connected]);

  // Convert participants to TileParticipant
  const tileParticipants: TileParticipant[] = participants.map(p => ({
    ...p,
    isLocal: p.id === config.userId
  }));

  return (
    <div className="h-screen w-screen flex flex-col bg-black">
      {/* Hidden media elements */}
      <audio ref={audioElementRef} autoPlay playsInline />
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />

      {/* Pre-connection: centered connect card */}
      {!connectionStatus.connected && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg p-6 max-w-sm w-full space-y-4 border border-border">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-foreground">
                {config.roomId ? `${config.roomId} Room` : (language === 'ko' ? 'PlanetKit 회의' : 'PlanetKit Meeting')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {connectionStatus.connecting ? t.connecting : (language === 'ko' ? '회의에 참여하시겠습니까?' : 'Would you like to join the meeting?')}
              </p>
            </div>

            {connectionStatus.error && (
              <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-md">
                {t.error}: {connectionStatus.error}
              </div>
            )}

            <Button
              onClick={connectToConference}
              disabled={connectionStatus.connecting}
              className="w-full h-12 text-base bg-blue-600 hover:bg-blue-700"
            >
              {connectionStatus.connecting ? (
                <>
                  <Activity className="w-5 h-5 mr-2 animate-spin" />
                  {t.connecting}
                </>
              ) : (
                <>{t.joinMeeting}</>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Post-connection: full-screen layout */}
      {connectionStatus.connected && (
        <>
          {/* Top status bar */}
          <div className="fixed top-0 left-0 right-0 z-20 bg-black/70 backdrop-blur-sm border-b border-white/10">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 text-white">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-mono">{callDuration}</span>
                </div>
                <div className="w-px h-4 bg-white/20" />
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  <span className="text-sm">{participants.length}</span>
                </div>
                {aiAgentJoined && isAIAgentInviter && (
                  <>
                    <div className="w-px h-4 bg-white/20" />
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      aiAgentMode === 'listen'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-green-500/20 text-green-300'
                    }`}>
                      {aiAgentMode === 'listen' ? (
                        <><Ear className="w-3 h-3" /><span>{language === 'ko' ? '듣기' : language === 'ja' ? 'リスニング' : language === 'zh-TW' ? '聆聽' : language === 'th' ? 'ฟัง' : 'Listen'}</span></>
                      ) : (
                        <><MessageCircle className="w-3 h-3" /><span>{language === 'ko' ? '응답' : language === 'ja' ? '応答' : language === 'zh-TW' ? '回應' : language === 'th' ? 'ตอบ' : 'Respond'}</span></>
                      )}
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <LanguageSelector />
                <div className="flex items-center gap-2">
                  <div className="text-xs text-white/70 font-medium">
                    {config.roomId && config.environment
                      ? `${config.roomId} - ${config.environment === 'eval' ? 'Eval' : 'Real'}`
                      : config.roomId
                      ? config.roomId
                      : 'PlanetKit'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Video grid */}
          <div className="absolute top-[52px] bottom-[100px] left-0 right-0 w-full">
            <TileView participants={tileParticipants} />

            {/* Media Statistics Panel — exposes SDK raw fields as-is */}
            <MediaStatsPanel conference={conference} enabled={isStatsPanelOpen && connectionStatus.connected} />
          </div>

          {/* Bottom controls */}
          <div className="fixed bottom-0 left-0 right-0 z-20 bg-black/70 backdrop-blur-sm border-t border-white/10">
            <div className="flex items-center justify-evenly w-full px-2 py-4">
              {/* Video toggle */}
              <Button
                onClick={toggleVideo}
                size="lg"
                className={`w-12 h-12 rounded-full ${
                  isVideoOn
                    ? 'bg-white/20 hover:bg-white/30 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {isVideoOn ? (
                  <Video className="w-5 h-5" />
                ) : (
                  <VideoOff className="w-5 h-5" />
                )}
              </Button>

              {/* Microphone toggle */}
              <Button
                onClick={toggleAudio}
                size="lg"
                className={`w-12 h-12 rounded-full ${
                  isAudioOn
                    ? 'bg-white/20 hover:bg-white/30 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                {isAudioOn ? (
                  <Mic className="w-5 h-5" />
                ) : (
                  <MicOff className="w-5 h-5" />
                )}
              </Button>

              {/* Share invite link */}
              <Button
                onClick={shareInviteUrl}
                size="lg"
                className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 text-white"
                title={language === 'ko' ? '초대 링크 복사' : 'Copy Invite Link'}
              >
                <Share2 className="w-5 h-5" />
              </Button>

              {/* AI Agent invite/remove */}
              {!aiAgentJoined && !aiAgentSessionUsed && (
                <Button
                  onClick={inviteAIAgent}
                  disabled={isInvitingAIAgent}
                  size="lg"
                  className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-700 text-white"
                  title={language === 'ko' ? 'AI Agent 초대' : 'Invite AI Agent'}
                >
                  {isInvitingAIAgent ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Bot className="w-5 h-5" />
                  )}
                </Button>
              )}
              {aiAgentJoined && (
                <Button
                  onClick={kickAIAgent}
                  disabled={isKickingAIAgent}
                  size="lg"
                  className="w-12 h-12 rounded-full bg-orange-500 hover:bg-orange-600 text-white"
                  title={language === 'ko' ? 'AI Agent 내보내기' : 'Remove AI Agent'}
                >
                  {isKickingAIAgent ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <UserMinus className="w-5 h-5" />
                  )}
                </Button>
              )}
              {/* AI Agent listen/respond mode toggle — visible only to inviter */}
              {aiAgentJoined && isAIAgentInviter && (
                <Button
                  onClick={toggleAgentMode}
                  disabled={isTogglingMode}
                  size="lg"
                  className={`w-12 h-12 rounded-full ${
                    aiAgentMode === 'listen'
                      ? 'bg-amber-500 hover:bg-amber-600 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                  title={
                    aiAgentMode === 'listen'
                      ? (language === 'ko' ? '응답 모드로 전환' : 'Switch to Respond Mode')
                      : (language === 'ko' ? '듣기 모드로 전환' : 'Switch to Listen Mode')
                  }
                >
                  {isTogglingMode ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : aiAgentMode === 'listen' ? (
                    <Ear className="w-5 h-5" />
                  ) : (
                    <MessageCircle className="w-5 h-5" />
                  )}
                </Button>
              )}
              {!aiAgentJoined && aiAgentSessionUsed && (
                <Button
                  disabled
                  size="lg"
                  className="w-12 h-12 rounded-full"
                  title={language === 'ko' ? 'AI Agent 세션 종료됨' : 'AI Agent session ended'}
                >
                  <Bot className="w-5 h-5" />
                </Button>
              )}

              {/* Background Blur toggle (supported on WebView since 5.6) */}
              <Button
                onClick={toggleBlur}
                size="lg"
                disabled={!connectionStatus.connected || isBlurToggling}
                className={`w-12 h-12 rounded-full ${
                  isBlurOn
                    ? 'bg-purple-500 hover:bg-purple-600 text-white'
                    : 'bg-white/20 hover:bg-white/30 text-white'
                }`}
                title="Background Blur"
              >
                {isBlurToggling ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Sparkles className="w-5 h-5" />
                )}
              </Button>

              {/* Media statistics toggle */}
              <Button
                onClick={() => setIsStatsPanelOpen((v) => !v)}
                size="lg"
                disabled={!connectionStatus.connected}
                className={`w-12 h-12 rounded-full ${
                  isStatsPanelOpen
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-white/20 hover:bg-white/30 text-white'
                }`}
                title="Media Statistics"
              >
                <BarChart3 className="w-5 h-5" />
              </Button>

              {/* Disconnect */}
              <Button
                onClick={disconnect}
                size="lg"
                className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 text-white"
              >
                <PhoneOff className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Invite user selection dialog */}
      <InviteUserDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        currentUserId={profile?.userId || ''}
        currentUserName={config.displayName || profile?.displayName || ''}
        roomId={config.roomId}
        liffId={liffId || ''}
      />
    </div>
  );
};
