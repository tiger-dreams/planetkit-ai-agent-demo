import React, { useRef, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Video, VideoOff, Mic, MicOff, Monitor } from "lucide-react";
import { Participant } from "@/types/video-sdk";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslations } from "@/utils/translations";

export interface TileParticipant extends Participant {
  videoElement?: HTMLVideoElement;
  isLocal?: boolean;
  // 실시간 오디오 수준(0~1), 말하기 여부
  audioLevel?: number;
  isSpeaking?: boolean;
  videoStats?: {
    // 비디오 통계
    bitrate: number;
    frameRate: number;
    resolution: string;
    packetLoss: number;

    // 추가 통계 정보
    codecType?: string;
    sendBytes?: number;
    receiveBytes?: number;
    sendPackets?: number;
    receivePackets?: number;
    jitter?: number;
    rtt?: number;
    bandwidth?: number;

    // 네트워크 통계
    sendBandwidth?: number;
    receiveBandwidth?: number;
    totalDuration?: number;
    freezeRate?: number;

    // 코덱 및 성능 통계
    encoderType?: string;
    cpuUsage?: number;
    memoryUsage?: number;

    // 원시 통계 객체 (모든 정보)
    rawStats?: any;
  };
}

interface TileViewProps {
  participants: TileParticipant[];
  maxVisibleTiles?: number;
  showVideoStats?: boolean;
}

export const TileView = ({ participants, maxVisibleTiles = 4, showVideoStats = false }: TileViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [aspectRatio, setAspectRatio] = useState(window.innerWidth / window.innerHeight);
  const { language } = useLanguage();
  const t = getTranslations(language);

  // 참가자 순서 정렬: 로컬(나)을 항상 첫 번째로, 나머지는 기존 순서 유지
  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.isLocal && !b.isLocal) return -1;
    if (!a.isLocal && b.isLocal) return 1;
    return 0;
  });

  // 표시할 참가자 선택 (최대 4명까지, 4명 이상시 로컬 + 랜덤 3명)
  const visibleParticipants = sortedParticipants.slice(0, maxVisibleTiles);

  // 화면 비율 추적 (리사이즈 이벤트)
  useEffect(() => {
    const handleResize = () => {
      setAspectRatio(window.innerWidth / window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 참가자 수에 따른 그리드 레이아웃 결정 (화면 비율 고려)
  const getGridLayout = (count: number) => {
    switch (count) {
      case 1:
        return "grid-cols-1 grid-rows-1"; // 1x1 전체 화면
      case 2:
        // 화면 비율에 따라 동적으로 분할 방향 결정
        // aspectRatio > 1: 가로가 긴 화면 (landscape) -> 좌우 분할
        // aspectRatio <= 1: 세로가 긴 화면 (portrait) -> 상하 분할
        if (aspectRatio > 1) {
          return "grid-cols-2 grid-rows-1"; // 가로 2분할
        } else {
          return "grid-cols-1 grid-rows-[1fr_1fr]"; // 세로 2분할 (동일 높이)
        }
      case 3:
        return "grid-cols-2 grid-rows-2"; // 2x2 (3개 타일)
      case 4:
      default:
        return "grid-cols-2 grid-rows-2"; // 2x2
    }
  };

  // 3명일 때 첫 번째 타일을 2칸으로 확장
  const getTileSpan = (index: number, count: number) => {
    if (count === 3 && index === 0) {
      return "col-span-2"; // 첫 번째 타일을 2칸으로 확장
    }
    return "";
  };

  useEffect(() => {
    // 비디오 엘리먼트를 각 타일에 연결
    visibleParticipants.forEach((participant, index) => {
      const tileElement = containerRef.current?.querySelector(`[data-participant-id="${participant.id}"]`);
      const videoContainer = tileElement?.querySelector('.video-container') as HTMLDivElement;

      if (videoContainer && participant.videoElement) {
        // 기존 비디오 엘리먼트 정리
        const existingVideo = videoContainer.querySelector('video');
        if (existingVideo && existingVideo !== participant.videoElement) {
          videoContainer.removeChild(existingVideo);
        }

        // 새 비디오 엘리먼트 추가
        if (!videoContainer.contains(participant.videoElement)) {
          participant.videoElement.style.width = '100%';
          participant.videoElement.style.height = '100%';
          participant.videoElement.style.objectFit = 'cover';
          participant.videoElement.style.borderRadius = '8px';
          // 로컬 참가자는 CSS 미러링 즉시 적용 (깜빡임 방지)
          if (participant.isLocal) {
            participant.videoElement.style.transform = 'scaleX(-1)';
          }
          videoContainer.appendChild(participant.videoElement);
        }

        // isVideoOn 상태에 따라 비디오 표시/숨김
        participant.videoElement.style.display = participant.isVideoOn ? 'block' : 'none';
      } else if (!participant.videoElement) {
        // videoElement 없음 - 무시
      }
    });
  }, [visibleParticipants]);

  if (participants.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-muted rounded-lg">
        <p className="text-muted-foreground">참가자가 없습니다</p>
      </div>
    );
  }

  const gridLayout = getGridLayout(visibleParticipants.length);

  return (
    <div
      ref={containerRef}
      className={`grid gap-2 w-full h-full ${gridLayout}`}
    >
      {visibleParticipants.map((participant, index) => (
        <div
          key={participant.id}
          data-participant-id={participant.id}
          className={`relative bg-black rounded-lg overflow-hidden ${getTileSpan(index, visibleParticipants.length)} ${participant.isSpeaking || participant.isTalking ? 'ring-4 ring-emerald-500 shadow-lg shadow-emerald-500/50' : ''}`}
        >
          {/* 비디오 컨테이너 */}
          <div className="video-container w-full h-full relative">
            {!participant.isVideoOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white z-10">
                <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mb-2">
                  <span className="text-xl font-semibold">
                    {participant.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <VideoOff className="w-6 h-6 text-gray-400" />
              </div>
            )}
          </div>

          {/* 참가자 정보 오버레이 */}
          <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between">
            <div className="flex flex-col items-start gap-1">
              <div className="flex items-center gap-1">
                <Badge
                  variant="secondary"
                  className="text-xs bg-black/60 text-white border-none"
                >
                  {participant.isLocal ? t.you : participant.name}
                </Badge>
                
                {participant.isScreenSharing && (
                  <Monitor className="w-3 h-3 text-blue-400" />
                )}
              </div>
              
              {/* 비디오 품질 정보 표시 - 모든 통계 표시 */}
              {showVideoStats && participant.videoStats && (
                <div className="bg-black/90 text-white text-[9px] px-2 py-1 rounded font-mono leading-tight max-h-32 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                    {/* 기본 비디오 정보 */}
                    <div className="col-span-2 text-yellow-300 font-bold text-center mb-1">
                      📊 {participant.isLocal ? "송신" : "수신"} 통계
                    </div>
                    
                    {/* 해상도 & FPS */}
                    <span>해상도:</span>
                    <span className="text-cyan-300">{participant.videoStats.resolution}</span>
                    <span>FPS:</span>
                    <span className="text-cyan-300">{participant.videoStats.frameRate}</span>
                    
                    {/* 비트레이트 */}
                    <span>비트레이트:</span>
                    <span className="text-green-300">{(participant.videoStats.bitrate / 1000).toFixed(0)}k</span>
                    
                    {/* 패킷 손실 */}
                    <span>손실률:</span>
                    <span className={participant.videoStats.packetLoss > 5 ? "text-red-400" : "text-green-400"}>
                      {participant.videoStats.packetLoss.toFixed(1)}%
                    </span>
                    
                    {/* 추가 통계 정보 */}
                    {participant.videoStats.codecType && (
                      <>
                        <span>코덱:</span>
                        <span className="text-purple-300">{participant.videoStats.codecType}</span>
                      </>
                    )}
                    
                    {participant.videoStats.jitter !== undefined && (
                      <>
                        <span>Jitter:</span>
                        <span className="text-orange-300">{participant.videoStats.jitter.toFixed(1)}ms</span>
                      </>
                    )}
                    
                    {participant.videoStats.rtt !== undefined && (
                      <>
                        <span>RTT:</span>
                        <span className="text-orange-300">{participant.videoStats.rtt.toFixed(0)}ms</span>
                      </>
                    )}
                    
                    {participant.videoStats.sendBytes !== undefined && (
                      <>
                        <span>송신:</span>
                        <span className="text-blue-300">{(participant.videoStats.sendBytes / 1024).toFixed(0)}KB</span>
                      </>
                    )}
                    
                    {participant.videoStats.receiveBytes !== undefined && (
                      <>
                        <span>수신:</span>
                        <span className="text-blue-300">{(participant.videoStats.receiveBytes / 1024).toFixed(0)}KB</span>
                      </>
                    )}
                    
                    {participant.videoStats.sendPackets !== undefined && (
                      <>
                        <span>송신Pkt:</span>
                        <span className="text-indigo-300">{participant.videoStats.sendPackets}</span>
                      </>
                    )}
                    
                    {participant.videoStats.receivePackets !== undefined && (
                      <>
                        <span>수신Pkt:</span>
                        <span className="text-indigo-300">{participant.videoStats.receivePackets}</span>
                      </>
                    )}
                    
                    {participant.videoStats.bandwidth !== undefined && (
                      <>
                        <span>대역폭:</span>
                        <span className="text-pink-300">{(participant.videoStats.bandwidth / 1000).toFixed(0)}k</span>
                      </>
                    )}
                    
                    {participant.videoStats.freezeRate !== undefined && (
                      <>
                        <span>프리징:</span>
                        <span className={participant.videoStats.freezeRate > 0.1 ? "text-red-400" : "text-green-400"}>
                          {(participant.videoStats.freezeRate * 100).toFixed(1)}%
                        </span>
                      </>
                    )}
                    
                    {participant.videoStats.encoderType && (
                      <>
                        <span>인코더:</span>
                        <span className="text-lime-300">{participant.videoStats.encoderType}</span>
                      </>
                    )}
                    
                    {participant.videoStats.totalDuration !== undefined && (
                      <>
                        <span>지속시간:</span>
                        <span className="text-gray-300">{Math.floor(participant.videoStats.totalDuration / 1000)}s</span>
                      </>
                    )}
                    
                    {/* 원시 통계 객체에서 추가 속성들 찾아서 표시 */}
                    {participant.videoStats.rawStats && Object.entries(participant.videoStats.rawStats).map(([key, value]) => {
                      // 이미 표시된 속성들은 제외
                      const displayedKeys = [
                        'sendBitrate', 'bitrate', 'sendFrameRate', 'frameRate', 
                        'sendResolutionWidth', 'width', 'sendResolutionHeight', 'height',
                        'receiveResolutionWidth', 'receiveResolutionHeight', 'receiveBitrate', 'receiveFrameRate',
                        'sendPacketsLost', 'packetsLost', 'receivePacketsLost', 'codecType', 'codec',
                        'sendBytes', 'bytesSent', 'sendPackets', 'packetsSent', 'receiveBytes', 'bytesReceived',
                        'receivePackets', 'packetsReceived', 'jitter', 'rtt', 'roundTripTime',
                        'sendBandwidth', 'availableOutgoingBitrate', 'receiveBandwidth', 'availableIncomingBitrate',
                        'encoderType', 'encoder', 'decoderType', 'decoder', 'totalDuration', 'freezeRate'
                      ];
                      if (displayedKeys.includes(key) || value === null || value === undefined) {
                        return null;
                      }

                      const formatNumber = (num: number) => {
                        if (num > 1000000) return `${(num / 1000000).toFixed(1)}M`;
                        if (num > 1000) return `${(num / 1000).toFixed(1)}K`;
                        if (num < 1 && num > 0) return num.toFixed(3);
                        return num.toString();
                      };

                      const formatAny = (val: any): string => {
                        if (val === null || val === undefined) return '';
                        if (typeof val === 'number') return formatNumber(val);
                        if (typeof val === 'string') return val.length > 120 ? `${val.slice(0, 117)}...` : val;
                        if (typeof val === 'boolean') return val ? 'true' : 'false';
                        if (Array.isArray(val)) {
                          try {
                            const s = JSON.stringify(val);
                            return s.length > 120 ? `${s.slice(0, 117)}...` : s;
                          } catch {
                            return '[Array]';
                          }
                        }
                        // object
                        try {
                          const s = JSON.stringify(val);
                          return s.length > 120 ? `${s.slice(0, 117)}...` : s;
                        } catch {
                          return '[Object]';
                        }
                      };

                      // 객체인 경우 하위 키들을 펼쳐서 표시
                      if (typeof value === 'object' && !Array.isArray(value)) {
                        return (
                          <React.Fragment key={key}>
                            <span className="col-span-2 text-[9px] text-gray-300 mt-1">{key}</span>
                            {Object.entries(value as Record<string, any>).map(([subKey, subVal]) => (
                              <React.Fragment key={`${key}.${subKey}`}>
                                <span className="pl-2">- {subKey}:</span>
                                <span className="text-yellow-200 break-all">{formatAny(subVal)}</span>
                              </React.Fragment>
                            ))}
                          </React.Fragment>
                        );
                      }

                      // 원시값은 단일 라인으로 표시
                      return (
                        <React.Fragment key={key}>
                          <span>{key}:</span>
                          <span className="text-yellow-200 break-all">{formatAny(value)}</span>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 오디오 상태 */}
            <div className="flex items-center gap-1">
              {participant.isAudioOn ? (
                <Mic className="w-4 h-4 text-green-400" />
              ) : (
                <MicOff className="w-4 h-4 text-red-400" />
              )}
            </div>
          </div>

          {/* 말하고 있는 상태 표시 (향후 확장) */}
          {participant.isAudioOn && (
            <div className={`absolute inset-0 border-4 rounded-lg pointer-events-none transition-opacity duration-200 ${participant.isSpeaking || participant.isTalking ? 'opacity-100 border-emerald-500 shadow-lg shadow-emerald-500/50' : 'opacity-0'}`} />
          )}
        </div>
      ))}

      {/* 4명 이상일 때 추가 참가자 수 표시 */}
      {participants.length > maxVisibleTiles && (
        <div className="absolute bottom-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
          +{participants.length - maxVisibleTiles}명 더
        </div>
      )}
    </div>
  );
};

// 말하고 있는 상태를 표시하기 위한 유틸리티 함수 (향후 확장용)
export const highlightSpeakingParticipant = (participantId: string) => {
  const tileElement = document.querySelector(`[data-participant-id="${participantId}"]`);
  const speakingIndicator = tileElement?.querySelector('.speaking-indicator') as HTMLElement;
  
  if (speakingIndicator) {
    speakingIndicator.style.opacity = '1';
    setTimeout(() => {
      speakingIndicator.style.opacity = '0';
    }, 1000);
  }
};