import React, { useRef, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Video, VideoOff, Mic, MicOff, Monitor } from "lucide-react";
import { Participant } from "@/types/video-sdk";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslations } from "@/utils/translations";

export interface TileParticipant extends Participant {
  videoElement?: HTMLVideoElement;
  isLocal?: boolean;
  // Real-time audio level (0–1), speaking flag
  audioLevel?: number;
  isSpeaking?: boolean;
  videoStats?: {
    // Video stats
    bitrate: number;
    frameRate: number;
    resolution: string;
    packetLoss: number;

    // Additional stats
    codecType?: string;
    sendBytes?: number;
    receiveBytes?: number;
    sendPackets?: number;
    receivePackets?: number;
    jitter?: number;
    rtt?: number;
    bandwidth?: number;

    // Network stats
    sendBandwidth?: number;
    receiveBandwidth?: number;
    totalDuration?: number;
    freezeRate?: number;

    // Codec and performance stats
    encoderType?: string;
    cpuUsage?: number;
    memoryUsage?: number;

    // Raw stats object (all info)
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

  // Sort participant order: always place local (you) first, keep the rest in their existing order
  const sortedParticipants = [...participants].sort((a, b) => {
    if (a.isLocal && !b.isLocal) return -1;
    if (!a.isLocal && b.isLocal) return 1;
    return 0;
  });

  // Select participants to display (up to 4; if more than 4, local + 3 random)
  const visibleParticipants = sortedParticipants.slice(0, maxVisibleTiles);

  // Track viewport aspect ratio (resize event)
  useEffect(() => {
    const handleResize = () => {
      setAspectRatio(window.innerWidth / window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Decide grid layout based on participant count (considering aspect ratio)
  const getGridLayout = (count: number) => {
    switch (count) {
      case 1:
        return "grid-cols-1 grid-rows-1"; // 1x1 fullscreen
      case 2:
        // Dynamically choose split direction based on aspect ratio
        // aspectRatio > 1: landscape -> split left/right
        // aspectRatio <= 1: portrait -> split top/bottom
        if (aspectRatio > 1) {
          return "grid-cols-2 grid-rows-1"; // Horizontal split
        } else {
          return "grid-cols-1 grid-rows-[1fr_1fr]"; // Vertical split (equal heights)
        }
      case 3:
        return "grid-cols-2 grid-rows-2"; // 2x2 (3 tiles)
      case 4:
      default:
        return "grid-cols-2 grid-rows-2"; // 2x2
    }
  };

  // For 3 participants, expand the first tile across 2 columns
  const getTileSpan = (index: number, count: number) => {
    if (count === 3 && index === 0) {
      return "col-span-2"; // Expand first tile across 2 columns
    }
    return "";
  };

  useEffect(() => {
    // Attach the video element to each tile
    visibleParticipants.forEach((participant, index) => {
      const tileElement = containerRef.current?.querySelector(`[data-participant-id="${participant.id}"]`);
      const videoContainer = tileElement?.querySelector('.video-container') as HTMLDivElement;

      if (videoContainer && participant.videoElement) {
        // Clean up existing video element
        const existingVideo = videoContainer.querySelector('video');
        if (existingVideo && existingVideo !== participant.videoElement) {
          videoContainer.removeChild(existingVideo);
        }

        // Add new video element
        if (!videoContainer.contains(participant.videoElement)) {
          participant.videoElement.style.width = '100%';
          participant.videoElement.style.height = '100%';
          participant.videoElement.style.objectFit = 'cover';
          participant.videoElement.style.borderRadius = '8px';
          // Apply CSS mirroring immediately for local participant (prevents flicker)
          if (participant.isLocal) {
            participant.videoElement.style.transform = 'scaleX(-1)';
          }
          videoContainer.appendChild(participant.videoElement);
        }

        // Show/hide the video element based on isVideoOn
        participant.videoElement.style.display = participant.isVideoOn ? 'block' : 'none';
      } else if (!participant.videoElement) {
        // No videoElement — ignore
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
          {/* Video container */}
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

          {/* Participant info overlay */}
          <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between">
            <div className="flex flex-col items-start gap-1">
              <div className="flex items-center gap-1">
                <Badge
                  variant="secondary"
                  className="text-xs bg-black/60 text-white border-none"
                >
                  {participant.isLocal ? `${participant.name} (${t.you})` : participant.name}
                </Badge>
                
                {participant.isScreenSharing && (
                  <Monitor className="w-3 h-3 text-blue-400" />
                )}
              </div>
              
              {/* Show video quality info — display all stats */}
              {showVideoStats && participant.videoStats && (
                <div className="bg-black/90 text-white text-[9px] px-2 py-1 rounded font-mono leading-tight max-h-32 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                    {/* Basic video info */}
                    <div className="col-span-2 text-yellow-300 font-bold text-center mb-1">
                      📊 {participant.isLocal ? "송신" : "수신"} 통계
                    </div>
                    
                    {/* Resolution & FPS */}
                    <span>해상도:</span>
                    <span className="text-cyan-300">{participant.videoStats.resolution}</span>
                    <span>FPS:</span>
                    <span className="text-cyan-300">{participant.videoStats.frameRate}</span>
                    
                    {/* Bitrate */}
                    <span>비트레이트:</span>
                    <span className="text-green-300">{(participant.videoStats.bitrate / 1000).toFixed(0)}k</span>
                    
                    {/* Packet loss */}
                    <span>손실률:</span>
                    <span className={participant.videoStats.packetLoss > 5 ? "text-red-400" : "text-green-400"}>
                      {participant.videoStats.packetLoss.toFixed(1)}%
                    </span>
                    
                    {/* Additional stats */}
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
                    
                    {/* Find and display additional properties from the raw stats object */}
                    {participant.videoStats.rawStats && Object.entries(participant.videoStats.rawStats).map(([key, value]) => {
                      // Exclude properties that are already displayed
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

                      // For objects, expand and display nested keys
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

                      // Render primitive values on a single line
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

            {/* Audio status */}
            <div className="flex items-center gap-1">
              {participant.isAudioOn ? (
                <Mic className="w-4 h-4 text-green-400" />
              ) : (
                <MicOff className="w-4 h-4 text-red-400" />
              )}
            </div>
          </div>

          {/* Speaking-state indicator (future expansion) */}
          {participant.isAudioOn && (
            <div className={`absolute inset-0 border-4 rounded-lg pointer-events-none transition-opacity duration-200 ${participant.isSpeaking || participant.isTalking ? 'opacity-100 border-emerald-500 shadow-lg shadow-emerald-500/50' : 'opacity-0'}`} />
          )}
        </div>
      ))}

      {/* Show additional participant count when more than 4 */}
      {participants.length > maxVisibleTiles && (
        <div className="absolute bottom-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
          +{participants.length - maxVisibleTiles}명 더
        </div>
      )}
    </div>
  );
};

// Utility function for highlighting the speaking state (for future expansion)
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