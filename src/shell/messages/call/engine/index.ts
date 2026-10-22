// 通话引擎（无界面）对外出口（合同 §3.9，签名不许改）。
// 首个提交：桩。`useCall` 返回 idle 快照；异步动作以 `not_ready` 拒绝；同步动作不做事。
import { useSyncExternalStore } from "react";
import type { CallSnapshot, CallStats, MediaDeviceLite } from "./types";

export type {
  CallIssue,
  CallParticipantView,
  CallPhase,
  CallSnapshot,
  CallStats,
  IncomingCall,
  MediaDeviceLite,
  NetLevel,
} from "./types";
export { claimCall, releaseCall } from "./mutex";
// 仲裁 A-5（signals/W14-to-W05.md）：通话检测的连接测试用独立 SDK 实例。
export { createDiagnosticsEngine } from "./diagnostics";
export type { DiagnosticsEngine } from "./diagnostics";
// 仲裁 A-9（signals/W06-to-W05.md）：字幕上行复用通话里的麦克风轨道（只许 clone，不许 stop 原轨道）。
export { getLocalMicTrack } from "./active";

const IDLE: CallSnapshot = {
  phase: "idle",
  conversationId: null,
  conversationTitle: null,
  callId: null,
  startedAt: null,
  participants: [],
  order: [],
  visibleIds: [],
  overflowCount: 0,
  screenSharerId: null,
  me: {
    mic: true,
    camera: false,
    screen: false,
    audioOnly: false,
    micDeviceId: null,
    cameraDeviceId: null,
    speakerDeviceId: null,
    network: 0,
  },
  aloneDeadline: null,
  issues: [],
  incoming: null,
  server: null,
  error: null,
  limits: { maxParticipants: 50, maxVideo: 25 },
};

export const callStore: { subscribe(listener: () => void): () => void; getSnapshot(): CallSnapshot } = {
  subscribe: () => () => {},
  getSnapshot: () => IDLE,
};

export function useCall(): CallSnapshot {
  return useSyncExternalStore(callStore.subscribe, callStore.getSnapshot, callStore.getSnapshot);
}

function notReady(): Promise<never> {
  return Promise.reject(new Error("not_ready"));
}

export const callActions: {
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
} = {
  startOrJoin: notReady,
  join: notReady,
  leave: notReady,
  setMic: notReady,
  setCamera: notReady,
  setScreenShare: notReady,
  setAudioOnly: notReady,
  listDevices: notReady,
  selectDevice: notReady,
  setLocalMute: notReady,
  setViewport: () => {},
  attachVideo: () => {},
  acceptIncoming: notReady,
  declineIncoming: notReady,
  cancelAloneTimer: () => {},
  getStats: notReady,
  getScreenShareSurface: () => null,
};
