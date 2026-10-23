// 通话引擎对外的数据形状（合同 §3.9，签名不许改）。
import type { CallView } from "../../../../lib/im/call-types";

export type CallPhase = "idle" | "joining" | "connected" | "reconnecting" | "leaving" | "ended" | "error";
export type NetLevel = 0 | 1 | 2 | 3 | 4 | 5; // 0 未知，1 很差 … 5 很好

export interface CallParticipantView {
  participantId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isMe: boolean;
  mic: boolean;
  camera: boolean;
  screen: boolean;
  speaking: boolean;
  level: number;
  network: NetLevel;
  connection: "connected" | "reconnecting";
  locallyMuted: boolean;
}

export interface CallIssue {
  kind:
    | "mic_permission"
    | "camera_permission"
    | "screen_permission"
    | "no_mic"
    | "mic_silent"
    | "device_lost"
    | "network_poor"
    | "network_lost"
    | "artc_unsupported"
    | "call_full"
    | "video_full";
  detail?: string;
}

export interface IncomingCall {
  callId: string;
  conversationId: string;
  callerId: string;
  callerName: string;
  expiresAt: string;
  /** 主叫头像（https；`call_ring` 带了就直接用，否则查到资料后补上；仲裁 A-34 加的可选字段）。 */
  callerAvatarUrl?: string | null;
}

export interface CallSnapshot {
  phase: CallPhase;
  conversationId: string | null;
  conversationTitle: string | null;
  callId: string | null;
  startedAt: string | null;
  participants: CallParticipantView[];
  order: string[];
  visibleIds: string[];
  overflowCount: number;
  screenSharerId: string | null;
  me: {
    mic: boolean;
    camera: boolean;
    screen: boolean;
    audioOnly: boolean;
    micDeviceId: string | null;
    cameraDeviceId: string | null;
    speakerDeviceId: string | null;
    network: NetLevel;
  };
  aloneDeadline: number | null;
  issues: CallIssue[];
  incoming: IncomingCall | null;
  server: CallView | null;
  error: { code: string; message: string } | null;
  limits: { maxParticipants: number; maxVideo: number };
}

export interface MediaDeviceLite {
  deviceId: string;
  label: string;
}

export interface CallStats {
  rttMs: number | null;
  upLossPct: number | null;
  downLossPct: number | null;
  upKbps: number | null;
  downKbps: number | null;
}

export type CallOwner = "meeting" | "leo-realtime";

/** `callActions` 的形状（合同 §3.9，签名不许改）。 */
export interface CallActions {
  startOrJoin(conversationId: string, ctx?: { title?: string }): Promise<void>;
  join(callId: string, conversationId: string, ctx?: { title?: string }): Promise<void>;
  leave(reason?: string): Promise<void>;
  setMic(on: boolean): Promise<void>;
  setCamera(on: boolean): Promise<void>;
  setScreenShare(on: boolean): Promise<void>;
  setAudioOnly(on: boolean): Promise<void>;
  listDevices(): Promise<{ microphones: MediaDeviceLite[]; cameras: MediaDeviceLite[]; speakers: MediaDeviceLite[] }>;
  selectDevice(kind: "mic" | "camera" | "speaker", deviceId: string): Promise<void>;
  setLocalMute(participantId: string, muted: boolean): Promise<void>;
  setViewport(mode: "dock" | "stage", visibleIds: string[]): void;
  attachVideo(el: HTMLVideoElement | null, participantId: string, track: "camera" | "screen"): void;
  acceptIncoming(): Promise<void>;
  declineIncoming(): Promise<void>;
  cancelAloneTimer(): void;
  getStats(): Promise<CallStats>;
  getScreenShareSurface(): { width: number; height: number; displaySurface: string } | null;
}
