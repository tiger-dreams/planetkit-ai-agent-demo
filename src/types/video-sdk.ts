export type SDKType = 'planetkit';

export enum ParticipantRole {
  HOST = 'host',
  MODERATOR = 'moderator',
  PARTICIPANT = 'participant'
}

export interface RolePermissions {
  canKickOut: boolean;
  canMuteOthers: boolean;
  canChangeRole: boolean;
  canManageRoom: boolean;
}

export interface PlanetKitConfig {
  serviceId: string;
  apiKey: string;
  apiSecret: string;
  userId: string;
  displayName: string; // LINE 프로필 표시 이름
  roomId: string;
  accessToken: string;
  environment: 'eval' | 'real' | ''; // Evaluation vs Real 환경 선택 (빈 값 = 미선택)
}

export interface ConnectionStatus {
  connected: boolean;
  connecting: boolean;
  error?: string;
}

export interface VideoMetrics {
  frameRate: number;
  resolution: string;
  bitrate: number;
  packetLoss: number;
}

export interface Participant {
  id: string;
  name: string;
  isVideoOn: boolean;
  isAudioOn: boolean;
  isScreenSharing?: boolean;
  isTalking?: boolean; // Visual indicator for speaking participants
  isLocal?: boolean; // Flag to identify local participant
  role?: ParticipantRole;
  permissions?: RolePermissions;
  isHost?: boolean;
  videoElement?: HTMLVideoElement;
}

// Custom PlanetKit Credentials
export interface CustomPlanetKitCredentials {
  enabled: boolean;
  serviceId: string;
  apiKey: string;
  apiSecret: string;
  environment: 'eval' | 'real';
}

// Feature Availability based on credentials mode
export interface FeatureAvailability {
  hasBackendSupport: boolean;
  canUseCallHistory: boolean;
  canUseAllUsers: boolean;
  canSendDirectInvites: boolean;
  canUseLiffShare: boolean;  // Always true
  canCopyInviteUrl: boolean;  // Always true
}