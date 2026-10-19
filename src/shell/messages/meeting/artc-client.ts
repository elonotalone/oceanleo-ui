import type { ImMeetingJoinCredentials } from "../../../lib/im/types";

const SDK_URL = "https://g.alicdn.com/apsara-media-box/imp-web-rtc/7.3.4/aliyun-rtc-sdk.js";

interface AliRtcEngineLike {
  setDefaultSubscribeAllRemoteAudioStreams(enabled: boolean): void;
  setDefaultSubscribeAllRemoteVideoStreams(enabled: boolean): void;
  publishLocalAudioStream(enabled: boolean): void;
  publishLocalVideoStream(enabled: boolean): void;
  publishLocalScreenShareStream(enabled: boolean): void;
  setChannelProfile(profile: string): void;
  joinChannel(auth: { channelId: string; userId: string; appId: string; token: string; timestamp: number }, name: string): Promise<void>;
  leaveChannel(): Promise<void>;
  destroy(): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  subscribeRemoteMediaStream(userId: string, track: number, subscribeAudio: boolean, subscribeVideo: boolean): void;
  setRemoteViewConfig(view: HTMLVideoElement | null, userId: string, track: number): void;
  setLocalViewConfig(view: HTMLVideoElement | string | null, track: number): void;
  startPreview(): Promise<void>;
  stopPreview(): Promise<void>;
}

interface AliRtcNamespace {
  isSupported(): Promise<{ support: boolean }>;
  getInstance(): AliRtcEngineLike;
  AliRtcVideoTrack?: { AliRtcVideoTrackBoth?: number };
}

declare global {
  interface Window { AliRtcEngine?: AliRtcNamespace }
}

let sdkPromise: Promise<AliRtcNamespace> | null = null;
function loadAliRtc(): Promise<AliRtcNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("browser_required"));
  if (window.AliRtcEngine) return Promise.resolve(window.AliRtcEngine);
  if (sdkPromise) return sdkPromise;
  const pending = new Promise<AliRtcNamespace>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => window.AliRtcEngine ? resolve(window.AliRtcEngine) : reject(new Error("artc_sdk_unavailable"));
    script.onerror = () => reject(new Error("artc_sdk_load_failed"));
    document.head.appendChild(script);
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });
  sdkPromise = pending;
  return pending;
}

export interface ArtcClient {
  engine: AliRtcEngineLike;
  leave(): Promise<void>;
  setMicrophone(enabled: boolean): void;
  setCamera(enabled: boolean): void;
  setScreenShare(enabled: boolean): void;
  subscribeAudio(userId: string, enabled: boolean): void;
  subscribeVideo(userId: string, enabled: boolean): void;
  destroy(): Promise<void>;
}

/** Creates an SDK engine only after server join credentials are present. */
export async function createArtcClient(credentials: ImMeetingJoinCredentials, displayName: string): Promise<ArtcClient> {
  if (!credentials.app_id || !credentials.token || !credentials.channel_id || !credentials.user_id) {
    throw new Error("meeting_credentials_incomplete");
  }
  const sdk = await loadAliRtc();
  const support = await sdk.isSupported();
  if (!support.support) throw new Error("artc_browser_unsupported");
  const engine = sdk.getInstance();
  // Aliyun's SDK defaults to subscribing to all remote streams; disable before join.
  engine.setDefaultSubscribeAllRemoteAudioStreams(false);
  engine.setDefaultSubscribeAllRemoteVideoStreams(false);
  engine.publishLocalAudioStream(false);
  engine.publishLocalVideoStream(false);
  engine.publishLocalScreenShareStream(false);
  engine.setChannelProfile("communication");
  const timestamp = Math.floor(new Date(credentials.expires_at).getTime() / 1000);
  if (!Number.isFinite(timestamp) || timestamp <= Math.floor(Date.now() / 1000)) {
    engine.destroy();
    throw new Error("meeting_credentials_expired");
  }
  try {
    await engine.joinChannel({
      channelId: credentials.channel_id,
      userId: credentials.user_id,
      appId: credentials.app_id,
      token: credentials.token,
      timestamp,
    }, displayName);
  } catch (error) {
    try { await engine.leaveChannel(); } catch { /* join may have failed before entering */ }
    engine.destroy();
    throw error;
  }
  return {
    engine,
    leave: () => engine.leaveChannel(),
    setMicrophone: (enabled) => engine.publishLocalAudioStream(enabled),
    setCamera: (enabled) => engine.publishLocalVideoStream(enabled),
    setScreenShare: (enabled) => engine.publishLocalScreenShareStream(enabled),
    subscribeAudio: (userId, enabled) => {
      const track = sdk.AliRtcVideoTrack?.AliRtcVideoTrackBoth;
      if (typeof track !== "number") throw new Error("artc_video_track_unavailable");
      engine.subscribeRemoteMediaStream(userId, track, enabled, false);
    },
    subscribeVideo: (userId, enabled) => {
      const track = sdk.AliRtcVideoTrack?.AliRtcVideoTrackBoth;
      if (typeof track !== "number") throw new Error("artc_video_track_unavailable");
      engine.subscribeRemoteMediaStream(userId, track, false, enabled);
    },
    destroy: async () => {
      try { await engine.stopPreview(); } catch { /* preview may never have started */ }
      try { await engine.leaveChannel(); } finally { engine.destroy(); }
    },
  };
}
