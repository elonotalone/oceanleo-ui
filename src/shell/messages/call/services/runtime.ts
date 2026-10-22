// 通话服务的浏览器接线：状态仓单例 + 字幕上行控制器工厂（真 WebSocket、真计时器、真麦克风）。
// JWT 与网关地址的取法照 IM 实时连接（src/shell/messages/realtime/hooks.ts）：`accessToken()` + `GATEWAY_BASE`。
import { accessToken } from "../../../../lib/auth/client";
import { GATEWAY_BASE } from "../../../../lib/auth/config";
import { imEnabledHere } from "../../../../lib/im/client";
import { recordingApi, transcriptionApi } from "./api";
import { startBrowserMicCapture } from "./capture";
import { createCaptionsController, type CaptionsController } from "./controller";
import { createServicesStore, type KeyValueStorage } from "./store";
import { captionsSocketUrl, createCaptionsUplink, type CaptionsSocketLike } from "./uplink";

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const servicesStore = createServicesStore({
  api: {
    setTranscription: (callId, enabled) => transcriptionApi.setEnabled(callId, enabled),
    startRecording: (callId) => recordingApi.start(callId),
    stopRecording: (callId) => recordingApi.stop(callId),
  },
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  storage: browserStorage,
});

/** 一个 CallServicesHost 一份：卸载时 dispose（关上行、停采集）。 */
export function createBrowserCaptionsController(): CaptionsController {
  const uplink = createCaptionsUplink({
    url: (callId) => (imEnabledHere() ? captionsSocketUrl(GATEWAY_BASE, callId) : null),
    getToken: () => accessToken(),
    createSocket: (url) => new WebSocket(url) as unknown as CaptionsSocketLike,
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    random: () => Math.random(),
    now: () => Date.now(),
  });
  return createCaptionsController({
    uplink,
    startCapture: startBrowserMicCapture,
    onUplink: (status) => servicesStore.setUplink(status),
    onCapture: (state) => servicesStore.setCapture(state),
  });
}
