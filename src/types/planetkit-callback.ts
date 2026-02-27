// PlanetKit Callback Event Types

// PlanetKit 실제 콜백 파라미터 구조
export interface PlanetKitCallbackParams {
  sid?: string;              // Session ID
  svc_id?: string;           // Service ID
  id?: string;               // Room/Call ID
  user_svc_id?: string;      // User Service ID
  user_id?: string;          // User ID
  host_svc_id?: string;      // Host Service ID
  host_id?: string;          // Host ID
  sc?: string;               // Status Code (S=Success, E=Error, etc.)
  setup_time?: string;       // Setup timestamp
  start_time?: string;       // Start timestamp
  end_time?: string;         // End timestamp
  online?: string;           // Online status
  media_type?: string;       // Media type (A=Audio, V=Video, AV=Both)
  msc?: string;              // Media status code
  ts?: string;               // Timestamp
  rel_code?: string;         // Release code
  rel_code_str?: string;     // Release code string
  ue_type?: string;          // User event type
  client_address?: string;   // Client IP address
  display_name?: string;     // Display name
  rc_idc?: string;           // Return code indicator
  disconnect_reason?: string; // Disconnect reason
  releaser_type?: string;    // Releaser type
  billing_sec?: string;      // Billing seconds
  app_svr_data?: string;     // App server data
  stid?: string;             // Sub-transaction ID
  [key: string]: any;        // Allow additional fields
}

export interface PlanetKitCallbackEvent {
  eventType: string;
  serviceId?: string;
  roomId?: string;
  userId?: string;
  displayName?: string;
  timestamp?: number;
  data?: Record<string, any>;
}

export interface StoredPlanetKitEvent extends PlanetKitCallbackEvent {
  id: number;
  created_at: string;
}

export const PlanetKitEventTypes = {
  ROOM_CREATE: 'GCALL_EVT_ROOM_CREATE',
  ROOM_DELETE: 'GCALL_EVT_ROOM_DELETE',
  USER_JOIN: 'GCALL_EVT_USER_JOIN',
  USER_LEAVE: 'GCALL_EVT_USER_LEAVE',
  CALL_START: 'GCALL_EVT_START',
  CALL_END: 'GCALL_EVT_END',
} as const;

export type PlanetKitEventType = typeof PlanetKitEventTypes[keyof typeof PlanetKitEventTypes];
