// LeoChat 通话 v2 的数据形状（合同 docs/work-logs/2026-10-23-calls-v2/00-contract.md §3.2–§3.9）。
// 唯一口径是合同；改形状先在 signals 里申请仲裁。

export type CallStatus = "active" | "ended";
export type CallEndedReason = "empty" | "stale" | "admin" | "channel_closed";
export type CallEdition = "cn" | "global";
export type CallBillingMode = "platform_absorbed" | "metered";

/** 每位参与者向服务端报告的媒体开关（心跳带上；变了才广播）。 */
export interface CallMedia {
  mic: boolean;
  camera: boolean;
  screen: boolean;
}

export interface CallParticipant {
  participant_id: string;
  user_id: string;
  joined_at: string;
  last_seen_at: string;
  media: CallMedia;
}

export type CallRingState = "ringing" | "answered" | "declined" | "missed" | "cancelled";

export interface CallRing {
  caller_id: string;
  callee_ids: string[];
  expires_at: string;
  state: CallRingState;
}

/** §3.5：录制状态（状态提供者名 `recording`，值为当前或最近一次）。 */
export type RecordingState = "starting" | "recording" | "stopping" | "processing" | "ready" | "failed";

export interface RecordingView {
  recording_id: string;
  state: RecordingState;
  started_by: string;
  started_at: string;
  stopped_by: string | null;
  stopped_at: string | null;
  error: string | null;
}

/** §3.6：转写状态（状态提供者名 `transcription`）。 */
export interface TranscriptionView {
  enabled: boolean;
  started_by: string | null;
  started_at: string | null;
}

/** §3.8：远程控制会话（状态提供者名 `controls`：进行中与待批准的列表）。 */
export type ControlState = "pending" | "active" | "ended" | "declined" | "expired" | "cancelled";

export interface ControlView {
  session_id: string;
  call_id: string;
  controller_id: string;
  target_id: string;
  state: ControlState;
  created_at: string;
  expires_at: string;
  approved_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
}

/** §3.2 `CallView`：`call_id` 就是 `im_meetings.meeting_id`。 */
export interface CallView {
  call_id: string;
  conversation_id: string;
  status: CallStatus;
  started_by: string;
  started_at: string;
  ended_at: string | null;
  ended_reason: CallEndedReason | null;
  participants: CallParticipant[];
  participant_count: number;
  ring: CallRing | null;
  recording: RecordingView | null;
  transcription: TranscriptionView | null;
  controls: ControlView[];
}

/** §3.2 入频道凭证：`user_id` = participant_id 去掉连字符；`timestamp` = 到期 unix 秒。 */
export interface RtcCredentials {
  app_id: string;
  channel_id: string;
  user_id: string;
  token: string;
  timestamp: number;
  expires_at: string;
}

export interface CallLimits {
  max_participants: number;
  max_video: number;
}

/** `GET /v1/im/conversations/{cid}/call` */
export interface CallStatusResponse {
  call: CallView | null;
  artc_configured: boolean;
  billing_mode: CallBillingMode;
  limits: CallLimits;
}

/** `POST /v1/im/conversations/{cid}/call` 与 `POST /v1/im/calls/{call_id}/join` */
export interface JoinResponse {
  call: CallView;
  participant_id: string;
  rtc: RtcCredentials;
  edition: CallEdition;
}

/** `POST /v1/im/calls/{call_id}/leave` */
export interface LeaveResponse {
  ok: boolean;
  call: CallView | null;
}

/** `POST /v1/im/calls/{call_id}/token` 与 `POST /v1/im/calls/test-token` */
export interface TokenResponse {
  rtc: RtcCredentials;
}

export interface OkResponse {
  ok: boolean;
}

/** §3.2 错误码（`{"detail":{"code","message"}}`）。 */
export type CallErrorCode =
  | "not_member"
  | "talent_not_supported"
  | "call_full"
  | "call_unavailable"
  | "artc_not_configured"
  | "removed_from_conversation"
  | "rate_limited";

// ---------------------------------------------------------------------------
// §3.3 实时事件（经 hub 推送，前端 useImEvent / imStore().onEvent）
// ---------------------------------------------------------------------------

export type CallRingEndReason = "answered" | "declined" | "missed" | "cancelled";

export interface CallChangedEvent {
  type: "call";
  conversation_id: string;
  call: CallView | null;
}

export interface CallRingEvent {
  type: "call_ring";
  conversation_id: string;
  call_id: string;
  caller_id: string;
  expires_at: string;
}

export interface CallRingEndEvent {
  type: "call_ring_end";
  conversation_id: string;
  call_id: string;
  reason: CallRingEndReason;
}

export interface CallKickedEvent {
  type: "call_kicked";
  conversation_id: string;
  call_id: string;
  reason: "removed_from_conversation";
}

export interface CallCaptionEvent {
  type: "call_caption";
  call_id: string;
  conversation_id: string;
  participant_id: string;
  user_id: string;
  sentence_id: string | number;
  text: string;
  is_final: boolean;
  begin_ms: number;
  end_ms: number;
}

export interface CallControlRequestEvent {
  type: "call_control_request";
  call_id: string;
  conversation_id: string;
  session_id: string;
  controller_id: string;
  expires_at: string;
}

export interface CallControlEvent {
  type: "call_control";
  call_id: string;
  conversation_id: string;
  session: ControlView;
}

/** §3.3 全部通话事件的联合（`ImEvent` 里也包含这几种）。 */
export type CallHubEvent =
  | CallChangedEvent
  | CallRingEvent
  | CallRingEndEvent
  | CallKickedEvent
  | CallCaptionEvent
  | CallControlRequestEvent
  | CallControlEvent;

// ---------------------------------------------------------------------------
// §3.4 系统消息 `meta.kind`
// ---------------------------------------------------------------------------

export type CallMessageKind =
  | "call_started"
  | "call_ended"
  | "call_missed"
  | "call_declined"
  | "call_recording_started"
  | "call_recording_stopped"
  | "call_recording_ready"
  | "call_transcription_started"
  | "call_transcription_stopped"
  | "call_minutes";

/** §3.4 各 kind 的 meta 字段（服务端写入；前端只读）。 */
export type CallMessageMeta =
  | { kind: "call_started"; call_id: string; started_by: string }
  | { kind: "call_ended"; call_id: string; duration_seconds: number; participant_ids: string[]; reason: string | null }
  | { kind: "call_missed"; call_id: string; caller_id: string; callee_ids: string[] }
  | { kind: "call_declined"; call_id: string; callee_id: string }
  | { kind: "call_recording_started" | "call_recording_stopped"; call_id: string; user_id: string }
  | { kind: "call_recording_ready"; call_id: string; recording_id: string; duration_seconds: number; size_bytes: number; format: string }
  | { kind: "call_transcription_started" | "call_transcription_stopped"; call_id: string; user_id: string }
  | { kind: "call_minutes"; call_id: string; segment_count: number; duration_seconds: number; language: string };

/** §3.1 常量（客户端用到的那部分）。 */
export const CALL_LIMITS = {
  MAX_PARTICIPANTS: 50,
  MAX_VIDEO: 25,
  RING_TIMEOUT_MS: 45_000,
  HEARTBEAT_MS: 30_000,
  STALE_AFTER_MS: 120_000,
  ALONE_AFTER_MS: 10 * 60_000,
  ALONE_COUNTDOWN_MS: 60_000,
  DOCK_TILES: 4,
  STAGE_PAGE: 9,
  STAGE_PAGE_MOBILE: 4,
  SWAP_IN_SPEAKING_MS: 2_500,
  SWAP_MIN_INTERVAL_MS: 5_000,
  SWAP_PROTECT_RECENT_MS: 3_000,
} as const;

/** 服务端 participant UUID → ARTC userId（去掉连字符）。 */
export function rtcUserIdForParticipant(participantId: string): string {
  return String(participantId || "").replace(/-/g, "");
}
