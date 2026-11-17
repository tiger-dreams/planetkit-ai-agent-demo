export type ConferenceMediaMode = 'video' | 'audio';

interface BuildConferenceJoinParamsInput {
  userId: string;
  displayName?: string;
  serviceId: string;
  roomId: string;
  accessToken: string;
  mediaMode?: ConferenceMediaMode;
  roomAudio: unknown;
  myVideo?: unknown;
  delegate: unknown;
  customMediaStream?: MediaStream;
}

export const buildConferenceJoinParams = (input: BuildConferenceJoinParamsInput) => {
  const mediaMode = input.mediaMode || 'video';
  const mediaHtmlElement: Record<string, unknown> = {
    roomAudio: input.roomAudio,
  };

  if (mediaMode === 'video' && input.myVideo) {
    mediaHtmlElement.myVideo = input.myVideo;
  }

  return {
    myId: input.userId,
    displayName: input.displayName || input.userId,
    myServiceId: input.serviceId,
    roomId: input.roomId,
    roomServiceId: input.serviceId,
    accessToken: input.accessToken,
    mediaType: mediaMode,
    cameraOn: mediaMode === 'video',
    micOn: true,
    mediaHtmlElement,
    delegate: input.delegate,
    enableTalkingStatusEvent: true,
    ...(input.customMediaStream ? { customMediaStream: input.customMediaStream } : {}),
  };
};
