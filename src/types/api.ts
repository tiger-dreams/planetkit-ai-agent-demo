// Agent Call API Types

export interface AgentCallInitiateRequest {
  toUserId: string;
  toServiceId: string;
  callerUserId: string;
  callerServiceId: string;
  audioFileIds: string[];
  language?: 'ko' | 'en';
}

export interface AgentCallInitiateResponse {
  success: boolean;
  sid?: string;
  roomId?: string;
  mock?: boolean;
  error?: string;
  warning?: string;
  message?: string;
}

export interface AgentCallCallbackData {
  sid: string;
  status: string;
  result?: 'SUCCESS' | 'FAIL';
  fail_reason?: string;
  timestamp: number;
  [key: string]: any;
}

export interface OneToOneCallEventData {
  cc_call_id: string;
  event_type: 'CONNECTED' | 'DISCONNECTED' | string;
  userId?: string;
  timestamp?: number;
  [key: string]: any;
}

export interface AgentCallSession {
  id: number;
  sid: string;
  caller_user_id: string;
  callee_user_id: string;
  caller_service_id?: string;
  callee_service_id?: string;
  room_id?: string;
  status: 'initiated' | 'ringing' | 'answered' | 'ended' | 'failed' | 'missed';
  audio_file_ids?: string[];
  language?: 'ko' | 'en';
  created_at: string;
  answered_at?: string;
  ended_at?: string;
  data?: Record<string, any>;
}
