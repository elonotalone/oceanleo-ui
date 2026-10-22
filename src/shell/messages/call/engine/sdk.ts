// 阿里云 ARTC Web SDK 装载与最小接口（以 aliyun-rtc-sdk@7.3.8 包内 dist/types/index.d.ts 为准）。
//
// 装载顺序：先 `import("aliyun-rtc-sdk")`（随包打进来，桌面客户端 CSP 只放行 'self' 时也能用）；
// 失败再插官方 CDN 脚本（`window.AliRtcEngine`）。2026-10-23 实测 CDN 上 7.3.8 是 404、7.3.7 是 200，
// 所以回落表按顺序先试 7.3.8 再试 7.3.7（7.3.x 接口一致：createInstance / joinChannel / refreshAuthInfo …）。
//
// 包内声明里要紧的几处（W05 journal 里有原文行号）：
//   - `static createInstance(config?)` 多实例；`static getInstance()` 单例。本引擎一律用 createInstance，离开时 destroy。
//   - `subscribeRemoteMediaStream(uid, videoTrack, subVideo, subAudio)`：第三个参数是**视频**、第四个是**音频**
//     （旧 meeting/artc-client.ts 把两者写反了）。videoTrack：0 无、1 摄像头、2 屏幕、3 两者。
//   - `setRemoteViewConfig(view, uid, track)`、`setLocalViewConfig(view, track)`，track 1 摄像头 / 2 屏幕。
//   - 事件：`authInfoWillExpire`（过期前 30 秒）、`authInfoExpired`、`connectionStatusChange(status, reason)`、
//     `remoteUserOnLineNotify(uid)`、`remoteUserOffLineNotify(uid, reason)`、`remoteTrackAvailableNotify(uid, audioTrack, videoTrack)`、
//     `audioVolume([{userId, volume}])`（userId 为空串 = 本地麦克风）、`networkQuality({subscribe:{rtt, loss, quality}})`、
//     `rtcStats`（成功的 candidate-pair）、`rtcLocalAudioStats` / `rtcRemoteAudioStats` 等（每 2 秒）、`bye(code)`、
//     `localDeviceException(deviceType, exceptionType, msg)`、`userAudioMuted/userVideoMuted/userScreenMuted(uid, mute)`。
//   - 引擎没有 `getStats()` 方法：统计只来自上面这些事件。
//   - npm 的 ES 产物只有 `default` 导出是引擎类（声明里写的具名 `AliRtcEngine` 在 ES 产物里不存在）。

export const ARTC_SDK_VERSION = "7.3.8";
export const ARTC_CDN_URLS: readonly string[] = [
  "https://g.alicdn.com/apsara-media-box/imp-web-rtc/7.3.8/aliyun-rtc-sdk.js",
  "https://g.alicdn.com/apsara-media-box/imp-web-rtc/7.3.7/aliyun-rtc-sdk.js",
];

/** AliRtcVideoTrack */
export const VIDEO_TRACK = { none: 0, camera: 1, screen: 2, both: 3 } as const;
/** AliRtcAudioTrack */
export const AUDIO_TRACK = { none: 0, mic: 1, dual: 2 } as const;
/** AliRtcConnectionStatus */
export const CONNECTION_STATUS = { init: 0, disconnected: 1, connecting: 2, connected: 3, reconnecting: 4, failed: 5 } as const;
/** AliRtcNetworkQuality */
export const NETWORK_QUALITY = { excellent: 0, good: 1, poor: 2, bad: 3, veryBad: 4, disconnected: 5, unknown: 6 } as const;
/** AliRtcOnByeType */
export const BYE_TYPE = { kicked: 1, channelTerminated: 2, userReplaced: 3 } as const;
/** AliRtcUserOfflineReason */
export const OFFLINE_REASON = { quit: 0, dropped: 1, becomeAudience: 2 } as const;
/** AliRtcEngineLocalDeviceType */
export const DEVICE_TYPE = { unknown: 0, mic: 1, speaker: 2, audioDevice: 3, camera: 4, display: 5, videoDevice: 6 } as const;
/** AliRtcEngineLocalDeviceExceptionType */
export const DEVICE_EXCEPTION = {
  unknown: 0,
  micOpenFail: 1,
  micInterrupt: 2,
  micAuthFail: 3,
  micNotAvailable: 4,
  speakerOpenFail: 5,
  speakerInterrupt: 6,
  speakerNotAvailable: 7,
  audioDeviceException: 8,
  cameraOpenFail: 9,
  cameraInterrupt: 10,
  cameraAuthFail: 11,
  displayException: 12,
  videoDeviceException: 13,
} as const;

export interface ArtcAuthInfo {
  channelId: string;
  userId: string;
  appId: string;
  token: string;
  timestamp: number;
  nonce?: string;
}

export interface ArtcRefreshAuthInfo {
  userId: string;
  token: string;
  timestamp: number;
  nonce?: string;
}

export interface ArtcRemoteUserInfo {
  hasAudio?: boolean;
  hasCamera?: boolean;
  hasScreenShare?: boolean;
  audioElement?: HTMLAudioElement;
}

export interface ArtcCheckResult {
  support: boolean;
  detail?: { isScreenShareSupported?: boolean; isWebRTCSupported?: boolean; isBrowserSupported?: boolean };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ArtcListener = (...args: any[]) => void;

/** 引擎实例上本工程用到的方法（结构类型；不引入包内全局声明）。 */
export interface ArtcEngine {
  on(event: string, listener: ArtcListener): unknown;
  off?(event: string, listener?: ArtcListener): unknown;
  removeAllListeners?(event?: string): unknown;
  setChannelProfile(profile: string): void;
  setDefaultSubscribeAllRemoteAudioStreams(sub: boolean): void;
  setDefaultSubscribeAllRemoteVideoStreams(sub: boolean): void;
  subscribeRemoteMediaStream(uid: string, videoTrack: number, subVideo: boolean, subAudio: boolean): void;
  publishLocalAudioStream(enabled: boolean): Promise<void> | void;
  publishLocalVideoStream(enabled: boolean): Promise<void> | void;
  publishLocalScreenShareStream?(enabled: boolean): Promise<void> | void;
  startScreenShare(config?: { audio?: boolean }): Promise<void>;
  stopScreenShare(): Promise<void>;
  enableAudioVolumeIndication(intervalMs: number): void;
  muteLocalMic(mute?: boolean): void;
  muteRemoteAudioPlaying(uid: string, mute?: boolean): void;
  startAudioCapture?(constraints?: MediaTrackConstraints): Promise<void>;
  stopAudioCapture?(): void;
  switchMicrophone(deviceId: string): Promise<void>;
  switchCamera(deviceId?: string): Promise<void>;
  setCameraCapturerConfiguration?(config: { deviceId?: string }): Promise<void>;
  enableLocalVideo?(enabled?: boolean): Promise<void>;
  startPreview(): Promise<void>;
  stopPreview(): Promise<void>;
  setLocalViewConfig(view: HTMLVideoElement | null, track: number): Promise<void> | void;
  setRemoteViewConfig(view: HTMLVideoElement | null, uid: string, track: number): void;
  getUserInfo?(uid: string): ArtcRemoteUserInfo | undefined;
  getOnlineRemoteUsers?(): string[];
  /** streamType：0 摄像头、1 屏幕（AliRtcRawDataStreamType）。 */
  getVideoTrack?(config: { userId?: string; streamType: number }): Promise<MediaStreamTrack | undefined>;
  /** 不传 userId = 本地麦克风轨道。 */
  getAudioTrack?(userId?: string): Promise<MediaStreamTrack | undefined>;
  joinChannel(auth: ArtcAuthInfo, userName?: string): Promise<void>;
  leaveChannel(): Promise<void>;
  refreshAuthInfo(auth: ArtcRefreshAuthInfo): Promise<void>;
  destroy(): Promise<void> | void;
}

/** 引擎类的静态面。 */
export interface ArtcEngineClass {
  isSupported?(direction?: "sendrecv" | "recvonly" | "sendonly"): Promise<ArtcCheckResult>;
  createInstance?(config?: Record<string, unknown>): ArtcEngine;
  getInstance?(config?: Record<string, unknown>): ArtcEngine;
  getMicrophoneList?(): Promise<MediaDeviceInfo[]>;
  getCameraList?(): Promise<MediaDeviceInfo[]>;
  getSpeakerList?(): Promise<MediaDeviceInfo[]>;
  getSdkVersion?(): string;
}

export interface ArtcSdk {
  source: "npm" | "cdn";
  version: string | null;
  isSupported(): Promise<ArtcCheckResult>;
  /** 新的独立实例（createInstance）。没有多实例方法时抛 `artc_multi_instance_unsupported`。 */
  createEngine(): ArtcEngine;
  getMicrophoneList(): Promise<MediaDeviceInfo[]>;
  getCameraList(): Promise<MediaDeviceInfo[]>;
  getSpeakerList(): Promise<MediaDeviceInfo[]>;
}

/** 从模块或全局对象里取出引擎类：npm ES 产物是 `default`；CDN 脚本是 `window.AliRtcEngine` 本身；UMD 是 `{default}`。 */
export function pickEngineClass(candidate: unknown): ArtcEngineClass | null {
  const seen = new Set<unknown>();
  let current: unknown = candidate;
  for (let depth = 0; depth < 3 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    if (typeof current === "function") {
      const cls = current as ArtcEngineClass;
      if (typeof cls.createInstance === "function" || typeof cls.getInstance === "function") return cls;
    }
    const record = current as { default?: unknown; AliRtcEngine?: unknown };
    current = record.default ?? record.AliRtcEngine ?? null;
  }
  return null;
}

export function wrapEngineClass(cls: ArtcEngineClass, source: "npm" | "cdn"): ArtcSdk {
  const list = async (fn: (() => Promise<MediaDeviceInfo[]>) | undefined, kind: MediaDeviceKind): Promise<MediaDeviceInfo[]> => {
    if (typeof fn === "function") {
      try {
        const items = await fn.call(cls);
        if (Array.isArray(items)) return items;
      } catch {
        /* 退回浏览器枚举 */
      }
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((device) => device.kind === kind);
  };
  let version: string | null = null;
  try {
    version = typeof cls.getSdkVersion === "function" ? String(cls.getSdkVersion.call(cls) || "") || null : null;
  } catch {
    version = null;
  }
  return {
    source,
    version,
    async isSupported() {
      if (typeof cls.isSupported !== "function") return { support: true };
      try {
        const result = await cls.isSupported.call(cls);
        return result && typeof result === "object" ? result : { support: false };
      } catch {
        return { support: false };
      }
    },
    createEngine() {
      if (typeof cls.createInstance !== "function") throw new Error("artc_multi_instance_unsupported");
      return cls.createInstance.call(cls);
    },
    getMicrophoneList: () => list(cls.getMicrophoneList, "audioinput"),
    getCameraList: () => list(cls.getCameraList, "videoinput"),
    getSpeakerList: () => list(cls.getSpeakerList, "audiooutput"),
  };
}

function loadScript(url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error("artc_sdk_load_failed"));
    };
    document.head.appendChild(script);
  });
}

async function loadFromCdn(): Promise<ArtcEngineClass> {
  const win = window as unknown as { AliRtcEngine?: unknown };
  const existing = pickEngineClass(win.AliRtcEngine);
  if (existing) return existing;
  let lastError: unknown = new Error("artc_sdk_load_failed");
  for (const url of ARTC_CDN_URLS) {
    try {
      await loadScript(url);
      const cls = pickEngineClass(win.AliRtcEngine);
      if (cls) return cls;
      lastError = new Error("artc_sdk_unavailable");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

let sdkPromise: Promise<ArtcSdk> | null = null;

/** 装载 SDK（每个标签页一次；失败后下次再试）。 */
export function loadArtcSdk(): Promise<ArtcSdk> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(new Error("browser_required"));
  }
  if (sdkPromise) return sdkPromise;
  const pending = (async () => {
    try {
      const mod: unknown = await import("aliyun-rtc-sdk");
      const cls = pickEngineClass(mod);
      if (cls) return wrapEngineClass(cls, "npm");
    } catch {
      /* 打包环境里没有这个包：走 CDN */
    }
    return wrapEngineClass(await loadFromCdn(), "cdn");
  })();
  sdkPromise = pending.catch((error) => {
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}
