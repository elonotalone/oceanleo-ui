// 通话引擎（无界面）对外出口（合同 §3.9，签名不许改）。实现见 controller.ts；这里只接真实依赖。
//
// 给界面的约定（与 signals/W07-to-W05.md 对齐）：
//   - `visibleIds` / `overflowCount` 是小窗（4 格）口径：槽位稳定，换入者占换出者的下标；说话只亮不挪。
//   - 放大视图按 `order` 分页，并用 `setViewport("stage", 本页 ids)` 告诉引擎收哪些画面；
//     共享屏幕的画面只在 stage 模式下订阅（小窗只显示「XX 在共享屏幕 · 查看」）。
//   - `participants[].level` 为 0–1 的平滑电平；`network` 0 未知、1 很差 … 5 很好。
//   - 远端声音由 SDK 自己播放；`attachVideo` 只管画面（自己的 participantId = 本地预览）。
//   - `phase`：idle → joining → connected ⇄ reconnecting → leaving → ended（6 s 后回 idle）；
//     入会失败 → error（10 s 后回 idle）。结束原因/失败原因在 `error.code`（见 controller.ts CALL_ERROR_MESSAGES）。
import { useSyncExternalStore } from "react";
import { getUserId } from "../../../../lib/auth/client";
import { callsApi } from "../../../../lib/im/calls-api";
import type { CallHubEvent } from "../../../../lib/im/call-types";
import { getProfiles } from "../../../../lib/im/people-api";
import { imStore } from "../../realtime/hooks";
import { setActiveEngine } from "./active";
import { createCallController, type CallController, type Clock, type MediaDevicesLike } from "./controller";
import { claimCall, releaseCall } from "./mutex";
import { browserPrefsStorage } from "./prefs";
import { loadArtcSdk } from "./sdk";
import type { CallActions, CallSnapshot } from "./types";

export type {
  CallActions,
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
export { pageOf } from "./ordering";

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

const browserClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

function browserMediaDevices(): MediaDevicesLike | null {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!md || typeof md.enumerateDevices !== "function") return null;
  return {
    enumerateDevices: () => md.enumerateDevices(),
    addEventListener: (type, listener) => md.addEventListener(type, listener),
    removeEventListener: (type, listener) => md.removeEventListener(type, listener),
  };
}

/** `navigator.permissions.query`；Firefox 等不认 "microphone"/"camera" 时返回 null。 */
async function queryBrowserPermission(name: "microphone" | "camera"): Promise<"granted" | "denied" | "prompt" | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return null;
    const status = await navigator.permissions.query({ name: name as PermissionName });
    return status.state === "granted" || status.state === "denied" || status.state === "prompt" ? status.state : null;
  } catch {
    return null;
  }
}

function subscribeCallEvents(handler: (event: CallHubEvent) => void): () => void {
  const store = imStore();
  const offs = [
    store.onEvent("call", handler),
    store.onEvent("call_ring", handler),
    store.onEvent("call_ring_end", handler),
    store.onEvent("call_kicked", handler),
  ];
  return () => {
    for (const off of offs) off();
  };
}

let controller: CallController | null = null;

/** 浏览器里每个标签页一个引擎；服务端渲染时为 null（快照恒为 idle）。 */
function getController(): CallController | null {
  if (typeof window === "undefined") return null;
  if (controller) return controller;
  controller = createCallController({
    api: callsApi,
    loadSdk: loadArtcSdk,
    selfUserId: () => getUserId(),
    fetchProfiles: (ids) => getProfiles(ids),
    subscribeHub: subscribeCallEvents,
    storage: browserPrefsStorage(),
    clock: browserClock,
    mediaDevices: browserMediaDevices(),
    claimCall,
    releaseCall,
    setActiveEngine,
    sinkIdSupported: () => typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype,
    queryPermission: queryBrowserPermission,
  });
  window.addEventListener("pagehide", () => controller?.onPageHide());
  return controller;
}

function need(): CallController {
  const c = getController();
  if (!c) throw new Error("browser_required");
  return c;
}

export const callStore: { subscribe(listener: () => void): () => void; getSnapshot(): CallSnapshot } = {
  subscribe(listener) {
    const c = getController();
    return c ? c.store.subscribe(listener) : () => {};
  },
  getSnapshot() {
    const c = getController();
    return c ? c.store.getSnapshot() : IDLE;
  },
};

const getServerSnapshot = (): CallSnapshot => IDLE;

export function useCall(): CallSnapshot {
  return useSyncExternalStore(callStore.subscribe, callStore.getSnapshot, getServerSnapshot);
}

export const callActions: CallActions = {
  startOrJoin: (conversationId, ctx) => need().actions.startOrJoin(conversationId, ctx),
  join: (callId, conversationId, ctx) => need().actions.join(callId, conversationId, ctx),
  leave: (reason) => (getController() ? need().actions.leave(reason) : Promise.resolve()),
  setMic: (on) => need().actions.setMic(on),
  setCamera: (on) => need().actions.setCamera(on),
  setScreenShare: (on) => need().actions.setScreenShare(on),
  setAudioOnly: (on) => need().actions.setAudioOnly(on),
  listDevices: () => need().actions.listDevices(),
  selectDevice: (kind, deviceId) => need().actions.selectDevice(kind, deviceId),
  setLocalMute: (participantId, muted) => need().actions.setLocalMute(participantId, muted),
  setViewport: (mode, visibleIds) => getController()?.actions.setViewport(mode, visibleIds),
  attachVideo: (el, participantId, track) => getController()?.actions.attachVideo(el, participantId, track),
  acceptIncoming: () => need().actions.acceptIncoming(),
  declineIncoming: () => need().actions.declineIncoming(),
  cancelAloneTimer: () => getController()?.actions.cancelAloneTimer(),
  getStats: () => need().actions.getStats(),
  getScreenShareSurface: () => getController()?.actions.getScreenShareSurface() ?? null,
};
