import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Activity,
  Clock,
  Users,
  Share2,
  Phone,
  Bot,
  Loader2,
  UserMinus,
  Ear,
  MessageCircle,
} from "lucide-react";
import { PlanetKitConfig, ConnectionStatus, Participant } from "@/types/video-sdk";
import { useToast } from "@/hooks/use-toast";
import { TileView, TileParticipant } from "@/components/TileView";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslations } from "@/utils/translations";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useLiff } from "@/contexts/LiffContext";
import { InviteUserDialog } from "@/components/InviteUserDialog";
// PlanetKit 환경별 빌드 import
import * as PlanetKitReal from "@line/planet-kit";
import * as PlanetKitEval from "@line/planet-kit/dist/planet-kit-eval";
import { LANGUAGE_VOICE_MAP } from "@/config/ai-agent-languages";
import type { AgentLanguage } from "@/config/ai-agent-languages";

interface PlanetKitMeetingAreaProps {
  config: PlanetKitConfig;
  onDisconnect?: () => void;
  mode?: 'group' | 'agent-call';
  sessionId?: string;
}

export const PlanetKitMeetingArea = ({ config, onDisconnect, mode, sessionId }: PlanetKitMeetingAreaProps) => {
  const { toast } = useToast();
  const { language } = useLanguage();
  const t = getTranslations(language);
  const { liffId, liff, profile } = useLiff();

  // Determine if this is an agent call
  const isAgentCall = mode === 'agent-call';

  // Extract cc_param and autoAccept from URL for Agent Call
  const urlParams = new URLSearchParams(window.location.search);
  const ccParam = urlParams.get('cc_param');
  const autoAccept = urlParams.get('autoAccept') === 'true';

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

  // 비디오 엘리먼트 refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const audioElementRef = useRef<HTMLAudioElement>(null);
  const [conference, setConference] = useState<any>(null);
  // 원격 참가자 비디오 엘리먼트 맵
  const remoteVideoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  // iOS WebKit 더블 탭 이벤트 방지 (React 상태보다 빠른 ref 기반 가드)
  const isConnectingRef = useRef(false);

  // 페이지 타이틀 업데이트
  useEffect(() => {
    if (connectionStatus.connected) {
      document.title = language === 'ko'
        ? `WebPlanet SDK 테스트 - 통화 중`
        : `WebPlanet SDK Test - In Call`;
    } else {
      document.title = language === 'ko' ? 'WebPlanet SDK 테스트' : 'WebPlanet SDK Test';
    }
  }, [language, connectionStatus.connected]);

  // 통화 시간 업데이트
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

  // Auto-accept call if autoAccept parameter is present
  useEffect(() => {
    if (isAgentCall && autoAccept && !connectionStatus.connected && !connectionStatus.connecting) {
      console.log('[Agent Call] Auto-accepting call due to autoAccept parameter');
      connectToConference();
    }
  }, [isAgentCall, autoAccept, connectionStatus.connected, connectionStatus.connecting]);

  // PlanetKit Conference 연결
  const connectToConference = async () => {
    // iOS WebKit 더블 탭 방지: React 상태 업데이트보다 빠른 ref 기반 가드
    if (isConnectingRef.current) return;
    isConnectingRef.current = true;

    try { // finally에서 isConnectingRef.current = false 보장

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

    // PlanetKit SDK가 joinConference 시 미디어 스트림을 직접 관리함
    // 별도의 getUserMedia 호출 불필요 (중복 권한 요청 방지)

    try {
      const attemptJoin = async (PlanetKitModule: any, envLabel: 'eval' | 'real') => {
        // Agent Call (1-to-1) vs Conference (Group Call)
        if (isAgentCall) {
          // 1-to-1 Call 방식 (Agent Call)
          const planetKitCall = new PlanetKitModule.Call();

          const callDelegate = {
            evtVerified: async () => {
              console.log('[Agent Call] Call verified');

              // Now accept the call after verification
              try {
                console.log('[Agent Call] Accepting call...');
                await planetKitCall.acceptCall();
                console.log('[Agent Call] Call accepted successfully');
              } catch (acceptError: any) {
                console.error('[Agent Call] Failed to accept call:', acceptError);
                toast({
                  title: language === 'ko' ? '통화 수락 실패' : 'Failed to Accept Call',
                  description: acceptError?.message || (language === 'ko' ? '통화 수락 중 오류가 발생했습니다.' : 'An error occurred while accepting the call.'),
                  variant: 'destructive'
                });
              }
            },

            evtConnected: () => {
              console.log('[Agent Call] Call connected');
              setConnectionStatus({ connected: true, connecting: false });
              setConnectionStartTime(new Date());

              setParticipants([{
                id: "agent",
                name: language === 'ko' ? '상담원' : 'Agent',
                isVideoOn: false, // Audio-only
                isAudioOn: true,
                videoElement: undefined
              }]);

              toast({
                title: language === 'ko' ? '통화 연결됨' : 'Call Connected',
                description: language === 'ko' ? 'Agent와 연결되었습니다.' : 'Connected to Agent.',
              });
            },

            evtDisconnected: (disconnectDetails: any) => {
              console.log('[Agent Call] Call disconnected by server:', disconnectDetails);

              // Note: Server has already disconnected the call, so we just clean up local resources
              // Do NOT call planetKitCall.disconnect() here - connection is already closed

              // Clean up local media stream
              if (localVideoRef.current && localVideoRef.current.srcObject) {
                const stream = localVideoRef.current.srcObject as MediaStream;
                console.log('[Agent Call] Stopping local media tracks:', stream.getTracks().length);
                stream.getTracks().forEach(track => {
                  console.log('[Agent Call] Stopping track:', track.kind, track.label, 'readyState:', track.readyState);
                  track.stop();
                  console.log('[Agent Call] Track stopped, new readyState:', track.readyState);
                });
                localVideoRef.current.srcObject = null;
                console.log('[Agent Call] Local video srcObject cleared');
              }

              // Force cleanup of any remaining media streams
              setTimeout(() => {
                navigator.mediaDevices.enumerateDevices().then(devices => {
                  console.log('[Agent Call] Media devices after cleanup:', devices.filter(d => d.kind === 'audioinput').length, 'audio inputs');
                }).catch(err => {
                  console.warn('[Agent Call] Could not enumerate devices:', err);
                });
              }, 100);

              setConnectionStatus({ connected: false, connecting: false });
              setParticipants([]);
              setConnectionStartTime(null);
              setCallDuration("00:00:00");

              toast({
                title: language === 'ko' ? '통화 종료' : 'Call Ended',
                description: language === 'ko' ? 'Agent Call이 종료되었습니다.' : 'Agent Call ended.',
              });

              // Navigate to setup page after disconnect
              if (onDisconnect) {
                onDisconnect();
              }
            },

            evtError: (error: any) => {
              console.error('[Agent Call] Error:', error);
              toast({
                title: language === 'ko' ? '통화 오류' : 'Call Error',
                description: error?.message || (language === 'ko' ? '통화 중 오류가 발생했습니다.' : 'An error occurred during the call.'),
                variant: 'destructive'
              });
            }
          };

          try {
            // cc_param 검증
            if (!ccParam) {
              throw new Error('cc_param is missing from URL. Please use the deeplink provided in the notify callback.');
            }

            console.log('[Agent Call] cc_param extracted from URL:', ccParam);
            console.log('[Agent Call] cc_param length:', ccParam.length);

            // Verify incoming call with proper params (based on 1-to-1 call sample)
            console.log('[Agent Call] Verifying call...');
            console.log('[Agent Call] verifyCall params:', {
              myId: config.userId,
              myServiceId: config.serviceId,
              mediaType: 'audio',
              ccParam: ccParam.substring(0, 50) + '...',
              delegate: 'present'
            });

            // Use proper verifyCall params from sample code
            await planetKitCall.verifyCall({
              myId: config.userId,
              myServiceId: config.serviceId,
              mediaType: 'audio',
              ccParam: ccParam,
              mediaHtmlElement: {
                peer: {
                  audio: audioElementRef.current
                }
              },
              delegate: callDelegate
            });

            // acceptCall() is now called in evtVerified callback
            console.log('[Agent Call] Waiting for call verification...');

            setConference(planetKitCall);
          } catch (callError: any) {
            console.error('[Agent Call] Failed to connect:', callError);
            throw new Error(`Agent Call connection failed: ${callError.message}`);
          }

        } else {
          // Conference 방식 (Group Call)
          const planetKitConference = new PlanetKitModule.Conference();

          const conferenceDelegate = {
            evtConnected: async () => {
              setConnectionStatus({ connected: true, connecting: false });
              setConnectionStartTime(new Date());

              // 로컬 비디오 스트림 획득 및 표시 (SDK는 권한만 요청, 스트림 연결은 직접 해야 함)
              try {
                const localStream = await navigator.mediaDevices.getUserMedia({
                  video: true,
                  audio: false  // 오디오는 SDK가 관리
                });

                if (localVideoRef.current) {
                  localVideoRef.current.srcObject = localStream;
                  await localVideoRef.current.play();
                  console.log('[PlanetKit] Local video stream connected');
                }
              } catch (mediaError) {
                console.warn('[PlanetKit] Could not get local video stream:', mediaError);
              }

              setParticipants([{
                id: config.userId, // Use actual userId instead of "local" for PlanetKit event matching
                name: config.displayName || config.userId,
                isVideoOn: true,
                isAudioOn: true,
                videoElement: localVideoRef.current || undefined,
                isLocal: true // Add flag to identify local participant in TileView
              }]);

              // 로컬 비디오 미러링 활성화 (비디오 엘리먼트가 완전히 렌더링된 후 호출)
              setTimeout(async () => {
                // 비디오 미러링 적용
                if (planetKitConference && typeof planetKitConference.setVideoMirror === 'function' && localVideoRef.current) {
                  try {
                    const mirrorResult = planetKitConference.setVideoMirror(true, localVideoRef.current);
                    // Promise인지 확인하고 await
                    if (mirrorResult && typeof mirrorResult.then === 'function') {
                      await mirrorResult;
                    }
                  } catch (err: any) {
                    // 미러링 실패는 무시
                  }
                }

              }, 500);

              toast({
                title: t.connectionSuccessTitle,
                description: t.connectionSuccessDescription,
              });
            },

            evtDisconnected: (disconnectDetails: any) => {
              // 로컬 미디어 스트림 정리 (카메라/마이크 끄기)
              if (localVideoRef.current && localVideoRef.current.srcObject) {
                const stream = localVideoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => {
                  track.stop();
                });
                localVideoRef.current.srcObject = null;
              }

              // 원격 비디오 엘리먼트 정리
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
            // PlanetKit은 addedPeers, removedPeers 배열을 제공
            const addedPeers = peerUpdateInfo.addedPeers || [];
            const removedPeers = peerUpdateInfo.removedPeers || [];

            // 제거된 peer 처리
            removedPeers.forEach((peer: any) => {
              const peerId = peer.userId || peer.peerId || peer.id || peer.myId;

              // PlanetKit에 비디오 제거 요청
              if (planetKitConference && typeof planetKitConference.removePeerVideo === 'function') {
                try {
                  planetKitConference.removePeerVideo({ peerId: peerId });
                } catch (err) {
                  // 비디오 제거 실패는 무시
                }
              }

              // 비디오 엘리먼트 정리
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

            // 새로 추가된 peer에 대해 비디오 요청
            addedPeers.forEach((peer: any) => {
              const peerId = peer.userId || peer.peerId || peer.id || peer.myId;

              // 비디오 엘리먼트 생성
              const videoElement = document.createElement('video');
              videoElement.autoplay = true;
              videoElement.playsInline = true;
              videoElement.muted = false;
              videoElement.style.width = '100%';
              videoElement.style.height = '100%';
              videoElement.style.objectFit = 'cover';
              videoElement.style.backgroundColor = '#000';

              // PlanetKit에 비디오 요청
              if (planetKitConference && typeof planetKitConference.requestPeerVideo === 'function') {
                try {
                  planetKitConference.requestPeerVideo({
                    userId: peerId,
                    resolution: 'vga',
                    videoViewElement: videoElement
                  });

                  remoteVideoElementsRef.current.set(peerId, videoElement);

                  videoElement.onerror = () => {
                    // 비디오 에러는 무시
                  };
                } catch (err) {
                  // 비디오 요청 실패는 무시
                }
              }
            });

            // AI Agent 퇴장 감지
            const removedAIAgent = removedPeers.find((peer: any) => {
              const peerId = peer.userId || peer.peerId || peer.id || peer.myId;
              return peerId && peerId.includes('AI_HEADLESS_');
            });
            if (removedAIAgent) {
              setAiAgentJoined(false);
              setAiAgentMode('respond');
              setIsAIAgentInviter(false);
              setAiAgentSessionUsed(true); // 세션 1회 소진 → 재초대 불가
            }

            setParticipants(prev => {
              // 기존 참가자 목록에서 제거된 참가자 삭제
              let updated = prev.filter(p => {
                const isRemoved = removedPeers.some((removedPeer: any) => {
                  const removedPeerId = removedPeer.userId || removedPeer.peerId || removedPeer.id || removedPeer.myId;
                  return removedPeerId === p.id;
                });
                return !isRemoved;
              });

              // 새로 추가된 참가자 추가
              const newParticipants = addedPeers.map((peer: any, index: number) => {
                const peerId = peer.userId || peer.peerId || peer.id || peer.myId || `peer-${index}`;
                // displayName 필드명을 다양하게 시도 (PlanetKit SDK 버전에 따라 다를 수 있음)
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

              // 로컬 참가자 + 업데이트된 원격 참가자
              const localParticipant = updated.find(p => p.id === config.userId) || {
                id: config.userId,
                name: config.displayName || config.userId,
                isVideoOn: isVideoOn,
                isAudioOn: isAudioOn,
                videoElement: localVideoRef.current || undefined,
                isLocal: true
              };

              const remoteParticipants = updated.filter(p => p.id !== config.userId);
              return [localParticipant, ...remoteParticipants, ...newParticipants];
            });

            // AI Agent 참가 감지
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

          // 비디오 일시정지 이벤트
          evtPeersVideoPaused: (peerInfoArray: any) => {
            console.log('[REMOTE VIDEO] evtPeersVideoPaused called:', peerInfoArray);
            const peers = Array.isArray(peerInfoArray) ? peerInfoArray : [peerInfoArray];

            peers.forEach((peerInfo: any) => {
              // evtPeersVideoPaused의 구조: {peer: {userId, ...}, pauseReason: ...}
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

          // 비디오 재개 이벤트
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

          // 마이크 음소거 이벤트
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

          // 마이크 음소거 해제 이벤트
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

          // 로컬 사용자(나 자신)의 말하는 상태 업데이트 (Issue #10: Speaking indicator)
          evtMyTalkingStatusUpdated: (isActive: boolean) => {

            setParticipants(prev => prev.map(p => {
              if (p.id === config.userId) {
                return { ...p, isTalking: isActive, isSpeaking: isActive };
              }
              return p;
            }));
          },

          // 원격 참가자들의 말하는 상태 업데이트 이벤트 (Issue #10: Speaking indicator)
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
          mediaHtmlElement: { roomAudio: audioElementRef.current, localVideo: localVideoRef.current },
          delegate: conferenceDelegate,
          enableTalkingStatusEvent: true // Enable speaking indicator events
        };

        console.log('[PlanetKit] Calling joinConference with params:', {
          myId: conferenceParams.myId,
          roomId: conferenceParams.roomId,
          myServiceId: conferenceParams.myServiceId,
          mediaType: conferenceParams.mediaType,
          hasLocalVideo: !!conferenceParams.mediaHtmlElement?.localVideo,
          hasRoomAudio: !!conferenceParams.mediaHtmlElement?.roomAudio,
        });
        await planetKitConference.joinConference(conferenceParams);
        console.log('[PlanetKit] joinConference succeeded');
        setConference(planetKitConference);
      } // else 블록 끝
    }; // attemptJoin 함수 끝

    // 환경은 항상 'eval' (기본값)
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

  // Conference 연결 해제
  const disconnect = async () => {
    try {
      // 로컬 미디어 스트림 정리 (카메라/마이크 끄기)
      if (localVideoRef.current && localVideoRef.current.srcObject) {
        const stream = localVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          track.stop();
        });
        localVideoRef.current.srcObject = null;
      }

      // Conference 연결 해제
      if (conference && typeof conference.leaveConference === 'function') {
        try {
          await conference.leaveConference();
        } catch (leaveError) {
          // Conference 해제 오류는 무시
        }
        setConference(null);
      }

      // 원격 비디오 엘리먼트 정리
      remoteVideoElementsRef.current.clear();

      // 상태 초기화
      setConnectionStatus({ connected: false, connecting: false });
      setParticipants([]);
      setConnectionStartTime(null);
      setCallDuration("00:00:00");

      toast({
        title: t.callEndedTitle,
        description: t.callEndedDescription,
      });

      // 페이지 리디렉션
      if (onDisconnect) {
        setTimeout(() => onDisconnect(), 500);
      }
    } catch (error) {
      // Conference 연결 해제 오류는 무시
    }
  };

  // 마이크 토글
  const toggleAudio = async () => {
    if (connectionStatus.connected) {
      try {
        const newAudioState = !isAudioOn;

        // PlanetKit API: muteMyAudio(isMuted) - true면 음소거, false면 음소거 해제
        if (conference && typeof conference.muteMyAudio === 'function') {
          await conference.muteMyAudio(!newAudioState);
        }

        setIsAudioOn(newAudioState);

        // 로컬 참가자 상태 업데이트
        setParticipants(prev => prev.map(p =>
          p.id === config.userId ? { ...p, isAudioOn: newAudioState } : p
        ));
      } catch (error) {
        // 마이크 토글 실패는 무시
      }
    }
  };

  // 비디오 토글
  const toggleVideo = async () => {
    if (connectionStatus.connected) {
      try {
        const newVideoState = !isVideoOn;

        // 직접 MediaStream track 제어 (실제 비디오 전송 중단/재개)
        if (localVideoRef.current && localVideoRef.current.srcObject) {
          const stream = localVideoRef.current.srcObject as MediaStream;
          const videoTracks = stream.getVideoTracks();
          videoTracks.forEach(track => {
            track.enabled = newVideoState; // true면 켜기, false면 끄기
          });
        }

        // PlanetKit API도 호출 (SDK 내부 상태 동기화)
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

        // 로컬 참가자 상태 업데이트
        setParticipants(prev => prev.map(p =>
          p.id === config.userId ? { ...p, isVideoOn: newVideoState } : p
        ));
      } catch (error) {
        // 비디오 토글 실패는 무시
      }
    }
  };

  // 초대 링크 공유 (통화 이력 사용자 선택)
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

    // 통화 이력 사용자 선택 다이얼로그 열기
    setInviteDialogOpen(true);
  };

  // AI Agent 초대 핸들러
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

  // AI Agent 모드 전환 핸들러 (듣기/응답)
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

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      // 로컬 미디어 스트림 정리
      if (localVideoRef.current && localVideoRef.current.srcObject) {
        const stream = localVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          track.stop();
        });
        localVideoRef.current.srcObject = null;
      }

      // Conference 정리
      const currentConference = conference;
      if (currentConference && typeof currentConference.leaveConference === 'function') {
        try {
          currentConference.leaveConference().catch(() => {
            // 언마운트 시 Conference 해제 오류는 무시
          });
        } catch (error) {
          // 언마운트 시 Conference 해제 오류는 무시
        }
      }

      // 원격 비디오 엘리먼트 정리
      remoteVideoElementsRef.current.clear();
    };
  }, []);

  // 브라우저 닫힘/백그라운드 전환 감지하여 세션 종료 시도
  useEffect(() => {
    // beforeunload: 브라우저 닫힘/새로고침/페이지 이동 감지
    const handleBeforeUnload = () => {
      // 동기적으로 Conference 종료 시도 (LINE 인앱 브라우저에서는 제한적)
      if (conference && typeof conference.leaveConference === 'function') {
        try {
          // 비동기 호출이지만 최선을 다함
          conference.leaveConference().catch(() => {});
        } catch (error) {
          // 오류 무시
        }
      }
    };

    // visibilitychange: 페이지가 숨겨짐 (백그라운드, 다른 앱 전환)
    let visibilityTimer: NodeJS.Timeout | null = null;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 페이지가 숨겨진 후 30초 후에도 여전히 숨겨져 있으면 세션 종료
        visibilityTimer = setTimeout(() => {
          if (document.hidden && conference && connectionStatus.connected) {
            console.log('[PlanetKit] Page hidden for 30s, attempting to leave conference');
            if (typeof conference.leaveConference === 'function') {
              conference.leaveConference().catch(() => {});
            }
          }
        }, 30000); // 30초
      } else {
        // 페이지가 다시 보이면 타이머 취소
        if (visibilityTimer) {
          clearTimeout(visibilityTimer);
          visibilityTimer = null;
        }
      }
    };

    // 이벤트 리스너 등록
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 정리
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (visibilityTimer) {
        clearTimeout(visibilityTimer);
      }
    };
  }, [conference, connectionStatus.connected]);

  // 참가자를 TileParticipant로 변환
  const tileParticipants: TileParticipant[] = participants.map(p => ({
    ...p,
    isLocal: p.id === config.userId
  }));

  return (
    <div className="h-screen w-screen flex flex-col bg-black">
      {/* 숨겨진 미디어 엘리먼트들 */}
      <audio ref={audioElementRef} autoPlay playsInline />
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />

      {/* 연결 전: 중앙 연결 카드 */}
      {!connectionStatus.connected && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg p-6 max-w-sm w-full space-y-4 border border-border">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-foreground">
                {config.roomId ? `${config.roomId.charAt(0).toUpperCase() + config.roomId.slice(1)} Room` : (language === 'ko' ? 'PlanetKit 회의' : 'PlanetKit Meeting')}
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

      {/* 연결 후: 전체 화면 레이아웃 */}
      {connectionStatus.connected && (
        <>
          {/* 상단 상태 바 */}
          <div className="fixed top-0 left-0 right-0 z-20 bg-black/70 backdrop-blur-sm border-b border-white/10">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 text-white">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-mono">{callDuration}</span>
                </div>
                {!isAgentCall && (
                  <>
                    <div className="w-px h-4 bg-white/20" />
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      <span className="text-sm">{participants.length}</span>
                    </div>
                  </>
                )}
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
                    {isAgentCall
                      ? (language === 'ko' ? '음성 통화' : 'Voice Call')
                      : config.roomId && config.environment
                      ? `${config.roomId} - ${config.environment === 'eval' ? 'Eval' : 'Real'}`
                      : config.roomId
                      ? config.roomId
                      : 'PlanetKit'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 비디오 그리드 또는 오디오 시각화 */}
          <div className="absolute top-[52px] bottom-[100px] left-0 right-0 w-full">
            {isAgentCall ? (
              /* Agent Call: 오디오 시각화 */
              <div className="flex flex-col items-center justify-center h-full space-y-8">
                {/* Agent Avatar */}
                <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center">
                  <Phone className="w-16 h-16 text-primary" />
                </div>

                {/* Call Duration */}
                <div className="text-center space-y-2">
                  <p className="text-white text-4xl font-semibold">{callDuration}</p>
                  <p className="text-white/70 text-sm">
                    {language === 'ko' ? '통화 중' : 'Call in progress'}
                  </p>
                </div>

                {/* Speaking Indicator - shows when audio is on */}
                {isAudioOn && (
                  <div className="flex justify-center gap-1.5">
                    <div className="w-2 h-8 bg-primary rounded-full animate-pulse" />
                    <div className="w-2 h-12 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-10 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                    <div className="w-2 h-12 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
                    <div className="w-2 h-8 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                  </div>
                )}
              </div>
            ) : (
              /* Group Call: 비디오 그리드 */
              <TileView participants={tileParticipants} />
            )}
          </div>

          {/* 하단 컨트롤 */}
          <div className="fixed bottom-0 left-0 right-0 z-20 bg-black/70 backdrop-blur-sm border-t border-white/10">
            <div className="flex items-center justify-center gap-3 px-4 py-6">
              {/* 비디오 토글 - Agent Call에서는 숨김 */}
              {!isAgentCall && (
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
              )}

              {/* 마이크 토글 */}
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

              {/* 초대 링크 공유 - Agent Call에서는 숨김 */}
              {!isAgentCall && (
                <Button
                  onClick={shareInviteUrl}
                  size="lg"
                  className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 text-white"
                  title={language === 'ko' ? '초대 링크 복사' : 'Copy Invite Link'}
                >
                  <Share2 className="w-5 h-5" />
                </Button>
              )}

              {/* AI Agent 초대/내보내기 - Agent Call에서는 숨김 */}
              {!isAgentCall && !aiAgentJoined && !aiAgentSessionUsed && (
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
              {!isAgentCall && aiAgentJoined && (
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
              {/* AI Agent 듣기/응답 모드 토글 - 초대자만 표시 */}
              {!isAgentCall && aiAgentJoined && isAIAgentInviter && (
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
              {!isAgentCall && !aiAgentJoined && aiAgentSessionUsed && (
                <Button
                  disabled
                  size="lg"
                  className="w-12 h-12 rounded-full"
                  title={language === 'ko' ? 'AI Agent 세션 종료됨' : 'AI Agent session ended'}
                >
                  <Bot className="w-5 h-5" />
                </Button>
              )}

              {/* 연결 해제 */}
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

      {/* 초대 사용자 선택 다이얼로그 */}
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
