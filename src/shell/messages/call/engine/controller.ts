// 通话引擎的状态机（合同 §3.9 的实现）。不依赖 React 与浏览器全局：网关、SDK、时钟、存储、设备、实时事件
// 全部经 `CallControllerDeps` 注入（`index.ts` 接真实现，单测接假对象）。
//
// 要点（合同 §1 A1/A4/A5/A6/A8/A9/A11/A20，任务书 W05 P2）：
//   - 入会：网关 startOrJoin/join → SDK（互动模式 + 主播角色，单参数令牌，仲裁 A-11）；默认麦克风开、摄像头关，读写本地记忆。
//   - 名单以 SDK 远端上下线/轨道事件为准；服务端 `CallView` 只补姓名头像与媒体状态（`call` 事件）。
//     SDK 报「超时掉线」而服务端名单里还在的人显示为 reconnecting，最多 2 分钟（服务端清理口径）。
//   - 订阅：远端音频全自动；画面只收可见格的摄像头 + 共享者的屏幕；仅语音模式一律不收画面。
//   - 续期：`authInfoWillExpire` → refreshToken → `refreshAuthInfo(新 token)`；`authInfoExpired`/连接失败 → 重新入会。
//   - 心跳 30 s（带媒体状态；媒体变化后 0.4 s 内补一次）；只剩自己 10 分钟 → 60 s 倒计时后离开（可取消）。
//   - 来电：`call_ring` → incoming；`call_ring_end` 清掉；被移出 → 离开并给出 error。
//   - 与 Leo 实时通话互斥（mutex.claimCall/releaseCall）。
import { CALL_LIMITS, rtcUserIdForParticipant } from "../../../../lib/im/call-types";
import type {
  CallChangedEvent,
  CallHubEvent,
  CallKickedEvent,
  CallMedia,
  CallParticipant,
  CallRingEndEvent,
  CallRingEvent,
  CallView,
  JoinResponse,
  LeaveResponse,
  OkResponse,
  TokenResponse,
} from "../../../../lib/im/call-types";
import { httpsAvatarUrl } from "../../../../lib/im/types";
import { issueFromDeviceException, issueFromMediaError, sameIssues, withIssue, withoutIssue } from "./issues";
import { EMPTY_STATS, createStatsTracker } from "./network";
import { EMPTY_ORDERING, updateOrdering, type OrderingResult, type SpeakingInfo } from "./ordering";
import { readPrefs, writePrefs, type CallPrefs, type PrefsStorage } from "./prefs";
import {
  AUDIO_TRACK,
  BYE_TYPE,
  CONNECTION_STATUS,
  OFFLINE_REASON,
  VIDEO_TRACK,
  applyRemoteVideoWant,
  prepareEngine,
  type ArtcEngine,
  type ArtcSdk,
  type VideoWant,
} from "./sdk";
import { QUIET_SPEAKER, silence, updateSpeaker, viewLevel, type SpeakerState } from "./speaking";
import type {
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

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------
export const VOLUME_INTERVAL_MS = 300;
export const MIC_SILENT_MS = 8_000;
export const NETWORK_POOR_MS = 6_000;
export const ENDED_RESET_MS = 4_000;
export const ERROR_RESET_MS = 10_000;
export const HEARTBEAT_DEBOUNCE_MS = 400;
export const DEVICE_ISSUE_CLEAR_MS = 15_000;
export const TOKEN_RETRY_MS = 5_000;
export const REJOIN_DELAYS_MS: readonly number[] = [0, 2_000, 5_000, 10_000];
export const DROPPED_GRACE_MS = CALL_LIMITS.STALE_AFTER_MS;

export const CALL_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  not_member: "你不是这个会话的成员",
  talent_not_supported: "交易会话不支持通话",
  call_full: "通话人数已满（最多 50 人）",
  call_unavailable: "通话已结束",
  artc_not_configured: "通话服务尚未开通",
  removed_from_conversation: "你已被移出这个会话",
  rate_limited: "操作太频繁，请稍后再试",
  network: "网络不通",
  unauthorized: "请先登录",
  artc_unsupported: "当前浏览器不支持通话",
  artc_sdk_load_failed: "通话组件加载失败，请检查网络",
  artc_join_failed: "加入通话失败",
  busy_leo_realtime: "正在与 Leo 实时通话，请先结束",
  ring_declined: "对方已拒绝",
  ring_missed: "未接通",
  joined_elsewhere: "你已在其他页面或设备加入这个通话",
  artc_kicked: "你已离开通话",
  rejoin_failed: "网络中断，重新连接失败",
  alone_timeout: "只剩你一人，已自动离开通话",
};

// ---------------------------------------------------------------------------
// 依赖
// ---------------------------------------------------------------------------
export interface CallApi {
  startOrJoin(conversationId: string): Promise<JoinResponse>;
  join(callId: string): Promise<JoinResponse>;
  leave(callId: string, opts?: { keepalive?: boolean }): Promise<LeaveResponse>;
  refreshToken(callId: string): Promise<TokenResponse>;
  heartbeat(callId: string, media: CallMedia): Promise<OkResponse>;
  decline(callId: string): Promise<OkResponse>;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface MediaDevicesLike {
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
  addEventListener?(type: "devicechange", listener: () => void): void;
  removeEventListener?(type: "devicechange", listener: () => void): void;
}

export interface ProfileLite {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface CallControllerDeps {
  api: CallApi;
  loadSdk(): Promise<ArtcSdk>;
  selfUserId(): Promise<string | null>;
  fetchProfiles(ids: string[]): Promise<ProfileLite[]>;
  /** 订阅 `call` / `call_ring` / `call_ring_end` / `call_kicked` 四种实时事件；返回退订函数。 */
  subscribeHub(handler: (event: CallHubEvent) => void): () => void;
  storage: PrefsStorage | null;
  clock: Clock;
  mediaDevices: MediaDevicesLike | null;
  claimCall(owner: "meeting"): number | null;
  releaseCall(owner: "meeting", claim: number | null | undefined): void;
  setActiveEngine(engine: ArtcEngine | null): void;
  /** 浏览器能否给音频元素换输出设备（`HTMLMediaElement.setSinkId`）。 */
  sinkIdSupported(): boolean;
  log?(message: string, detail?: unknown): void;
}

export interface CallController {
  store: { subscribe(listener: () => void): () => void; getSnapshot(): CallSnapshot };
  actions: CallActions;
  /** 页面关闭（pagehide）时尽力离开。 */
  onPageHide(): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------
export function participantIdFromRtcUserId(uid: string): string {
  if (!/^[0-9a-f]{32}$/i.test(uid)) return uid;
  return `${uid.slice(0, 8)}-${uid.slice(8, 12)}-${uid.slice(12, 16)}-${uid.slice(16, 20)}-${uid.slice(20)}`;
}

function codeOf(error: unknown): string {
  const row = (error ?? {}) as { code?: unknown; message?: unknown };
  if (typeof row.code === "string" && row.code) return row.code;
  if (typeof row.message === "string" && /^[a-z][a-z0-9_]*$/.test(row.message)) return row.message;
  return "unknown";
}

function statusOf(error: unknown): number | null {
  const row = (error ?? {}) as { status?: unknown };
  return typeof row.status === "number" ? row.status : null;
}

export function callErrorOf(error: unknown, fallbackCode = "unknown"): { code: string; message: string } {
  let code = codeOf(error);
  if (code === "unknown") code = fallbackCode;
  const row = (error ?? {}) as { message?: unknown };
  const text = typeof row.message === "string" ? row.message.trim() : "";
  const serverText = text && text !== code && !/^[a-z][a-z0-9_]*$/.test(text) ? text : "";
  return { code, message: serverText || CALL_ERROR_MESSAGES[code] || "通话出错了，请稍后再试" };
}

function namedError(code: string): Error {
  return new Error(code);
}

class Cancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "Cancelled";
  }
}

interface RemoteState {
  uid: string;
  seq: number;
  joinedAt: number;
  online: boolean;
  droppedAt: number | null;
  audio: boolean | null;
  camera: boolean | null;
  screen: boolean | null;
  audioMuted: boolean;
  cameraMuted: boolean;
  screenMuted: boolean;
  screenAt: number;
}

interface Session {
  gen: number;
  conversationId: string;
  conversationTitle: string | null;
  callId: string | null;
  participantId: string | null;
  rtcUserId: string | null;
  startedAt: string | null;
  joinedAt: number;
  engine: ArtcEngine | null;
  sdk: ArtcSdk | null;
  screenShareSupported: boolean;
  claim: number | null;
  joined: boolean;
  micCaptured: boolean;
  wantMic: boolean;
  wantCamera: boolean;
  rejoining: boolean;
  refreshRetried: boolean;
}

interface CallContextView {
  conversationId: string;
  conversationTitle: string | null;
  callId: string | null;
  startedAt: string | null;
}

interface MeState {
  mic: boolean;
  camera: boolean;
  screen: boolean;
  audioOnly: boolean;
  micDeviceId: string | null;
  cameraDeviceId: string | null;
  speakerDeviceId: string | null;
  network: NetLevel;
}

const IN_CALL_PHASES: ReadonlySet<CallPhase> = new Set<CallPhase>(["connected", "reconnecting"]);

// ---------------------------------------------------------------------------
// 控制器
// ---------------------------------------------------------------------------
export function createCallController(deps: CallControllerDeps): CallController {
  const { api, clock } = deps;
  const log = (message: string, detail?: unknown) => {
    try {
      deps.log?.(message, detail);
    } catch {
      /* 日志失败不影响通话 */
    }
  };

  let prefs: CallPrefs = readPrefs(deps.storage);
  let phase: CallPhase = "idle";
  let session: Session | null = null;
  let context: CallContextView | null = null;
  let gen = 0;
  let me: MeState = {
    mic: prefs.mic,
    camera: false,
    screen: false,
    audioOnly: false,
    micDeviceId: prefs.micDeviceId,
    cameraDeviceId: prefs.cameraDeviceId,
    speakerDeviceId: prefs.speakerDeviceId,
    network: 0,
  };
  let server: CallView | null = null;
  let serverVersion = 0;
  let serverByUid = new Map<string, CallParticipant>();
  const remotes = new Map<string, RemoteState>();
  let remoteSeq = 0;
  const speakers = new Map<string, SpeakerState>(); // "" = 自己
  let ordering: OrderingResult = EMPTY_ORDERING;
  let viewport: { mode: "dock" | "stage"; ids: string[] } | null = null;
  const wanted = new Map<string, VideoWant>();
  const locallyMuted = new Set<string>();
  const views = new Map<string, { participantId: string; track: "camera" | "screen"; el: HTMLVideoElement }>();
  let issues: CallIssue[] = [];
  let incoming: IncomingCall | null = null;
  let error: { code: string; message: string } | null = null;
  let aloneSince: number | null = null;
  let aloneDeadline: number | null = null;
  let micSilentSince: number | null = null;
  let poorSince: number | null = null;
  let connectionLost = false;
  let screenTrack: MediaStreamTrack | null = null;
  let screenTrackEnded: (() => void) | null = null;
  const tracker = createStatsTracker(() => clock.now());
  const profiles = new Map<string, ProfileLite>();
  const pendingProfiles = new Set<string>();
  let selfId: string | null = null;
  let selfIdLoading: Promise<string | null> | null = null;
  let hubOff: (() => void) | null = null;
  let deviceWatcher: (() => void) | null = null;
  const timers: Record<string, unknown> = {};
  const listeners = new Set<() => void>();
  let snapshot: CallSnapshot = buildSnapshot();
  let signature = signatureOf(snapshot);

  // ---- 定时器 ------------------------------------------------------------
  function setTimer(name: string, fn: () => void, ms: number): void {
    clearTimer(name);
    timers[name] = clock.setTimeout(() => {
      delete timers[name];
      fn();
    }, ms);
  }
  function clearTimer(name: string): void {
    if (timers[name] !== undefined) {
      clock.clearTimeout(timers[name]);
      delete timers[name];
    }
  }
  function setRepeating(name: string, fn: () => void, ms: number): void {
    clearRepeating(name);
    timers[name] = clock.setInterval(fn, ms);
  }
  function clearRepeating(name: string): void {
    if (timers[name] !== undefined) {
      clock.clearInterval(timers[name]);
      delete timers[name];
    }
  }
  function sleep(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      clock.setTimeout(resolve, ms);
    });
  }

  // ---- 身份与资料 ------------------------------------------------------------
  function ensureSelfId(): Promise<string | null> {
    if (selfId) return Promise.resolve(selfId);
    if (!selfIdLoading) {
      selfIdLoading = deps
        .selfUserId()
        .then((id) => {
          selfId = id || null;
          if (selfId) requestProfiles([selfId]);
          return selfId;
        })
        .catch(() => null)
        .finally(() => {
          selfIdLoading = null;
        });
    }
    return selfIdLoading;
  }

  function requestProfiles(ids: readonly string[]): void {
    const missing = Array.from(new Set(ids.filter((id) => id && !profiles.has(id) && !pendingProfiles.has(id)))).slice(0, 100);
    if (missing.length === 0) return;
    for (const id of missing) pendingProfiles.add(id);
    deps
      .fetchProfiles(missing)
      .then((items) => {
        for (const item of items ?? []) {
          if (!item || typeof item.user_id !== "string") continue;
          profiles.set(item.user_id, {
            user_id: item.user_id,
            display_name: typeof item.display_name === "string" ? item.display_name : "",
            avatar_url: httpsAvatarUrl(item.avatar_url),
          });
        }
        if (incoming && !incoming.callerName) {
          const name = profiles.get(incoming.callerId)?.display_name;
          if (name) incoming = { ...incoming, callerName: name };
        }
      })
      .catch(() => undefined)
      .finally(() => {
        for (const id of missing) pendingProfiles.delete(id);
        commit();
      });
  }

  function nameOf(userId: string | null | undefined): string {
    return (userId && profiles.get(userId)?.display_name) || "";
  }
  function avatarOf(userId: string | null | undefined): string | null {
    return (userId && profiles.get(userId)?.avatar_url) || null;
  }

  // ---- 实时事件 ----------------------------------------------------------------
  function ensureHub(): void {
    if (hubOff) return;
    try {
      hubOff = deps.subscribeHub(onHub);
    } catch (err) {
      hubOff = null;
      log("hub subscribe failed", err);
    }
    void ensureSelfId();
  }

  function onHub(event: CallHubEvent): void {
    switch (event.type) {
      case "call":
        onServerCall(event);
        return;
      case "call_ring":
        onRing(event);
        return;
      case "call_ring_end":
        onRingEnd(event);
        return;
      case "call_kicked":
        onKicked(event);
        return;
      default:
        return;
    }
  }

  function setServer(call: CallView | null): void {
    server = call;
    serverVersion += 1;
    serverByUid = new Map((call?.participants ?? []).map((p) => [rtcUserIdForParticipant(p.participant_id), p] as const));
    if (call) requestProfiles(call.participants.map((p) => p.user_id).concat(call.started_by ? [call.started_by] : []));
  }

  function onServerCall(event: CallChangedEvent): void {
    if (
      incoming &&
      incoming.conversationId === event.conversation_id &&
      (!event.call || event.call.status !== "active" || event.call.call_id !== incoming.callId)
    ) {
      clearIncoming();
    }
    const s = session;
    if (!s || event.conversation_id !== s.conversationId) {
      commit();
      return;
    }
    const call = event.call;
    if (!call || call.status !== "active") {
      // 只在已经入会后才相信「结束了」：入会过程中可能收到上一通的结束广播。
      if (s.joined && (!call || call.call_id === s.callId)) void teardown({ callApi: false, error: null });
      return;
    }
    if (s.callId && call.call_id !== s.callId) return;
    setServer(call);
    commit();
  }

  function onRing(event: CallRingEvent): void {
    if (selfId && event.caller_id === selfId) return;
    if (session && session.callId === event.call_id) return;
    incoming = {
      callId: event.call_id,
      conversationId: event.conversation_id,
      callerId: event.caller_id,
      callerName: nameOf(event.caller_id),
      expiresAt: event.expires_at,
    };
    requestProfiles([event.caller_id]);
    const parsed = Date.parse(event.expires_at);
    const ms = Number.isFinite(parsed)
      ? Math.min(Math.max(0, parsed - clock.now()), CALL_LIMITS.RING_TIMEOUT_MS + 5_000)
      : CALL_LIMITS.RING_TIMEOUT_MS;
    const callId = event.call_id;
    setTimer("incoming", () => {
      if (incoming?.callId === callId) {
        incoming = null;
        commit();
      }
    }, ms);
    commit();
  }

  function clearIncoming(): void {
    incoming = null;
    clearTimer("incoming");
  }

  function onRingEnd(event: CallRingEndEvent): void {
    if (incoming?.callId === event.call_id) clearIncoming();
    const s = session;
    if (
      s &&
      s.callId === event.call_id &&
      (event.reason === "declined" || event.reason === "missed") &&
      renderedRemotes(clock.now()).length === 0
    ) {
      const code = event.reason === "declined" ? "ring_declined" : "ring_missed";
      void teardown({ callApi: true, error: { code, message: CALL_ERROR_MESSAGES[code] } });
      return;
    }
    commit();
  }

  function onKicked(event: CallKickedEvent): void {
    if (incoming && incoming.conversationId === event.conversation_id) clearIncoming();
    const s = session;
    if (s && (s.callId === event.call_id || s.conversationId === event.conversation_id)) {
      void teardown({
        callApi: false,
        error: { code: "removed_from_conversation", message: CALL_ERROR_MESSAGES.removed_from_conversation },
      });
      return;
    }
    commit();
  }

  // ---- 远端名单（以 SDK 为准） ------------------------------------------------------
  function pidOf(uid: string): string {
    return serverByUid.get(uid)?.participant_id ?? participantIdFromRtcUserId(uid);
  }

  function renderedRemotes(now: number): RemoteState[] {
    return Array.from(remotes.values())
      .filter((r) => r.online || (r.droppedAt !== null && now - r.droppedAt < DROPPED_GRACE_MS && serverByUid.has(r.uid)))
      .sort((a, b) => a.seq - b.seq);
  }

  function purgeDropped(now: number): void {
    for (const r of Array.from(remotes.values())) {
      if (r.online) continue;
      if (r.droppedAt === null || now - r.droppedAt >= DROPPED_GRACE_MS || !serverByUid.has(r.uid)) {
        remotes.delete(r.uid);
        speakers.delete(r.uid);
        wanted.delete(r.uid);
      }
    }
  }

  function remoteOnline(engine: ArtcEngine, uid: string): void {
    if (!uid) return;
    const now = clock.now();
    let r = remotes.get(uid);
    if (!r) {
      remoteSeq += 1;
      r = {
        uid,
        seq: remoteSeq,
        joinedAt: now,
        online: true,
        droppedAt: null,
        audio: null,
        camera: null,
        screen: null,
        audioMuted: false,
        cameraMuted: false,
        screenMuted: false,
        screenAt: 0,
      };
      remotes.set(uid, r);
    } else {
      r.online = true;
      r.droppedAt = null;
    }
    try {
      const info = engine.getUserInfo?.(uid);
      if (info) {
        if (typeof info.hasAudio === "boolean") r.audio = info.hasAudio;
        if (typeof info.hasCamera === "boolean") r.camera = info.hasCamera;
        if (typeof info.hasScreenShare === "boolean") {
          if (info.hasScreenShare && !r.screen) r.screenAt = now;
          r.screen = info.hasScreenShare;
        }
      }
    } catch {
      /* 拿不到就等轨道事件 */
    }
    wanted.delete(uid); // SDK 里这个人是新对象：想要的画面重新对账
    const pid = pidOf(uid);
    if (locallyMuted.has(pid)) {
      try {
        engine.muteRemoteAudioPlaying(uid, true);
      } catch {
        /* 下次再试 */
      }
    }
    for (const view of views.values()) if (view.participantId === pid) applyView(view.participantId, view.track, view.el);
    const userId = serverByUid.get(uid)?.user_id;
    if (userId) requestProfiles([userId]);
  }

  function remoteOffline(uid: string, reason: unknown): void {
    const r = remotes.get(uid);
    if (!r) return;
    speakers.set(uid, silence(speakers.get(uid)));
    wanted.delete(uid);
    if (reason === OFFLINE_REASON.dropped && serverByUid.has(uid)) {
      r.online = false;
      r.droppedAt = clock.now();
      setTimer(`drop:${uid}`, () => commit(), DROPPED_GRACE_MS + 10);
    } else {
      remotes.delete(uid);
      speakers.delete(uid);
    }
  }

  function remoteTracks(engine: ArtcEngine, uid: string, audioTrack: unknown, videoTrack: unknown): void {
    if (!remotes.has(uid)) remoteOnline(engine, uid);
    const r = remotes.get(uid);
    if (!r) return;
    const now = clock.now();
    r.audio = audioTrack !== AUDIO_TRACK.none && audioTrack !== undefined && audioTrack !== null;
    const camera = videoTrack === VIDEO_TRACK.camera || videoTrack === VIDEO_TRACK.both;
    const screen = videoTrack === VIDEO_TRACK.screen || videoTrack === VIDEO_TRACK.both;
    if (screen && !r.screen) r.screenAt = now;
    r.camera = camera;
    r.screen = screen;
  }

  function currentRemoteSharer(): string | null {
    let best: RemoteState | null = null;
    for (const r of remotes.values()) {
      if (!r.online || !r.screen || r.screenMuted) continue;
      if (!best || r.screenAt > best.screenAt) best = r;
    }
    return best ? best.uid : null;
  }

  // ---- 订阅（只收看得到的画面） ----------------------------------------------------
  function syncSubscriptions(): void {
    const s = session;
    const engine = s?.engine;
    if (!s || !engine || !s.joined) return;
    // 小窗：界面给的格子 ∪ 引擎算的可见格（界面晚一拍时也不漏订）；放大视图：只认界面给的本页。
    // 屏幕画面只在放大视图里挂（signals/W07-to-W05.md 第 4 条），小窗模式不收屏幕流。
    const stage = viewport?.mode === "stage";
    const viewIds = new Set<string>(stage ? viewport?.ids ?? [] : [...(viewport?.ids ?? []), ...ordering.visible]);
    const sharer = stage ? currentRemoteSharer() : null;
    for (const r of remotes.values()) {
      if (!r.online) continue;
      const next: VideoWant = {
        camera: !me.audioOnly && r.camera === true && !r.cameraMuted && viewIds.has(pidOf(r.uid)),
        screen: !me.audioOnly && sharer === r.uid,
      };
      const previous = wanted.get(r.uid) ?? { camera: false, screen: false };
      if (previous.camera === next.camera && previous.screen === next.screen) continue;
      try {
        applyRemoteVideoWant(engine, r.uid, previous, next);
        wanted.set(r.uid, next);
      } catch (err) {
        log("subscribe failed", err);
      }
    }
  }

  function applyView(participantId: string, track: "camera" | "screen", el: HTMLVideoElement | null): void {
    const s = session;
    const engine = s?.engine;
    if (!s || !engine) return;
    const trackNo = track === "camera" ? VIDEO_TRACK.camera : VIDEO_TRACK.screen;
    try {
      if (s.participantId && participantId === s.participantId) {
        void Promise.resolve(engine.setLocalViewConfig(el, trackNo)).catch((err) => log("local view failed", err));
      } else {
        engine.setRemoteViewConfig(el, rtcUserIdForParticipant(participantId), trackNo);
      }
    } catch (err) {
      log("view failed", err);
    }
  }

  function reapplyViews(): void {
    for (const view of views.values()) applyView(view.participantId, view.track, view.el);
  }

  // ---- 扬声器 ------------------------------------------------------------------
  function applySink(engine: ArtcEngine, uid: string): void {
    if (!deps.sinkIdSupported()) return;
    try {
      const el = engine.getUserInfo?.(uid)?.audioElement as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | undefined;
      if (!el || typeof el.setSinkId !== "function") return;
      void el.setSinkId(me.speakerDeviceId ?? "").catch((err) => log("setSinkId failed", err));
    } catch {
      /* 元素还没建好：订阅成功后再来 */
    }
  }

  function applySinkAll(): void {
    const engine = session?.engine;
    if (!engine) return;
    for (const r of remotes.values()) if (r.online) applySink(engine, r.uid);
  }

  // ---- 说话、电平、网络 ------------------------------------------------------------
  function onVolume(list: unknown): void {
    if (!Array.isArray(list)) return;
    const now = clock.now();
    let localRaw: number | null = null;
    for (const item of list) {
      const row = (item ?? {}) as { userId?: unknown; volume?: unknown };
      const key = typeof row.userId === "string" ? row.userId : "";
      const volume = typeof row.volume === "number" ? row.volume : 0;
      if (key === "") {
        localRaw = volume;
        speakers.set("", updateSpeaker(speakers.get("") ?? QUIET_SPEAKER, me.mic ? volume : 0, now));
      } else if (remotes.get(key)?.online) {
        speakers.set(key, updateSpeaker(speakers.get(key) ?? QUIET_SPEAKER, volume, now));
      }
    }
    // 开麦但电平为 0 超过 8 秒 → mic_silent
    if (me.mic && session?.joined && session.micCaptured && localRaw !== null) {
      if (localRaw <= 0) {
        if (micSilentSince === null) micSilentSince = now;
        if (now - micSilentSince >= MIC_SILENT_MS) issues = withIssue(issues, { kind: "mic_silent" });
      } else {
        micSilentSince = null;
        issues = withoutIssue(issues, "mic_silent");
      }
    }
    commit();
  }

  function updateNetwork(): void {
    const now = clock.now();
    const level: NetLevel = connectionLost ? 1 : tracker.selfLevel();
    me = me.network === level ? me : { ...me, network: level };
    if (level > 0 && level <= 2) {
      if (poorSince === null) poorSince = now;
      if (now - poorSince >= NETWORK_POOR_MS) issues = withIssue(issues, { kind: "network_poor" });
    } else {
      poorSince = null;
      issues = withoutIssue(issues, "network_poor");
    }
    commit();
  }

  // ---- 独处计时 ------------------------------------------------------------------
  function refreshAlone(now: number): void {
    const s = session;
    const active = Boolean(s && s.joined && IN_CALL_PHASES.has(phase));
    const alone = active && renderedRemotes(now).length === 0;
    if (!alone) {
      if (aloneSince !== null || aloneDeadline !== null) {
        clearTimer("aloneWarn");
        clearTimer("aloneLeave");
        aloneSince = null;
        aloneDeadline = null;
      }
      return;
    }
    if (aloneSince === null) {
      aloneSince = now;
      setTimer("aloneWarn", startAloneCountdown, CALL_LIMITS.ALONE_AFTER_MS);
    }
  }

  function startAloneCountdown(): void {
    if (!session) return;
    aloneDeadline = clock.now() + CALL_LIMITS.ALONE_COUNTDOWN_MS;
    setTimer("aloneLeave", () => void leaveAction("alone_timeout"), CALL_LIMITS.ALONE_COUNTDOWN_MS);
    commit();
  }

  // ---- 快照 ----------------------------------------------------------------------
  /** 开摄像头前的计数：以服务端 `media.camera` 为准（任务书），SDK 已看到的开着摄像头的人只会让它更大。 */
  function cameraCountExcludingMe(): number {
    const myPid = session?.participantId ?? null;
    let fromServer = 0;
    for (const p of server?.participants ?? []) if (p.participant_id !== myPid && p.media?.camera) fromServer += 1;
    let fromSdk = 0;
    for (const view of remoteViews(clock.now())) if (view.camera) fromSdk += 1;
    return Math.max(fromServer, fromSdk);
  }

  function remoteViews(now: number): CallParticipantView[] {
    return renderedRemotes(now).map((r) => {
      const sp = serverByUid.get(r.uid);
      const pid = pidOf(r.uid);
      const userId = sp?.user_id ?? "";
      const speaker = r.online ? speakers.get(r.uid) : undefined;
      return {
        participantId: pid,
        userId,
        displayName: nameOf(userId),
        avatarUrl: avatarOf(userId),
        isMe: false,
        mic: r.audio !== null ? r.audio && !r.audioMuted : Boolean(sp?.media?.mic),
        camera: r.camera !== null ? r.camera && !r.cameraMuted : Boolean(sp?.media?.camera),
        screen: r.screen !== null ? r.screen && !r.screenMuted : Boolean(sp?.media?.screen),
        speaking: Boolean(speaker?.speaking),
        level: viewLevel(speaker),
        network: r.online ? tracker.remoteLevel(r.uid) : 1,
        connection: r.online ? "connected" : "reconnecting",
        locallyMuted: locallyMuted.has(pid),
      };
    });
  }

  function participantsNow(now: number): CallParticipantView[] {
    const s = session;
    // 重新入会（换新 SDK 实例）期间照样显示名单，免得小窗一闪变空。
    if (!s || !(s.joined || s.rejoining) || !s.participantId || !IN_CALL_PHASES.has(phase)) return [];
    const mine = speakers.get("");
    const self: CallParticipantView = {
      participantId: s.participantId,
      userId: selfId ?? "",
      displayName: nameOf(selfId),
      avatarUrl: avatarOf(selfId),
      isMe: true,
      mic: me.mic,
      camera: me.camera,
      screen: me.screen,
      speaking: me.mic && Boolean(mine?.speaking),
      level: me.mic ? viewLevel(mine) : 0,
      network: me.network,
      connection: phase === "reconnecting" ? "reconnecting" : "connected",
      locallyMuted: false,
    };
    return [self, ...remoteViews(now)];
  }

  function recomputeOrdering(now: number, participants: CallParticipantView[]): void {
    const s = session;
    if (!s || participants.length === 0) {
      ordering = EMPTY_ORDERING;
      return;
    }
    const speaking: Record<string, SpeakingInfo> = {};
    const joinedAt = new Map<string, number>();
    for (const view of participants) {
      if (view.isMe) {
        const sp = speakers.get("");
        speaking[view.participantId] = me.mic && sp ? { speakingSince: sp.speakingSince, lastSpokeAt: sp.lastSpokeAt } : { speakingSince: null, lastSpokeAt: sp?.lastSpokeAt ?? null };
        joinedAt.set(view.participantId, s.joinedAt);
      } else {
        const uid = rtcUserIdForParticipant(view.participantId);
        const sp = speakers.get(uid);
        speaking[view.participantId] = { speakingSince: sp?.speakingSince ?? null, lastSpokeAt: sp?.lastSpokeAt ?? null };
        joinedAt.set(view.participantId, remotes.get(uid)?.joinedAt ?? now);
      }
    }
    ordering = updateOrdering(ordering, {
      participants: participants.map((view) => ({ id: view.participantId, isMe: view.isMe, joinedAt: joinedAt.get(view.participantId) ?? now })),
      speaking,
      capacity: CALL_LIMITS.DOCK_TILES,
      now,
    });
  }

  function buildSnapshot(participantsArg?: CallParticipantView[]): CallSnapshot {
    const now = clock.now();
    const participants = participantsArg ?? participantsNow(now);
    const sharerUid = currentRemoteSharer();
    const screenSharerId = me.screen && session?.participantId ? session.participantId : sharerUid ? pidOf(sharerUid) : null;
    return {
      phase,
      conversationId: context?.conversationId ?? null,
      conversationTitle: context?.conversationTitle ?? null,
      callId: context?.callId ?? null,
      startedAt: context?.startedAt ?? null,
      participants,
      order: participants.length ? ordering.order.slice() : [],
      visibleIds: participants.length ? ordering.visible.slice() : [],
      overflowCount: participants.length ? ordering.overflowCount : 0,
      screenSharerId: participants.length ? screenSharerId : null,
      me: { ...me },
      aloneDeadline,
      issues: issues.slice(),
      incoming,
      server,
      error,
      limits: { maxParticipants: CALL_LIMITS.MAX_PARTICIPANTS, maxVideo: CALL_LIMITS.MAX_VIDEO },
    };
  }

  function signatureOf(value: CallSnapshot): string {
    return JSON.stringify({ ...value, server: serverVersion });
  }

  /** 状态变了之后统一走这里：清过期掉线者 → 独处计时 → 排序 → 订阅 → 快照 → 通知。 */
  function commit(): void {
    const now = clock.now();
    purgeDropped(now);
    refreshAlone(now);
    const participants = participantsNow(now);
    recomputeOrdering(now, participants);
    if (issues.some((i) => i.kind === "video_full") && !me.camera && cameraCountExcludingMe() < CALL_LIMITS.MAX_VIDEO) {
      issues = withoutIssue(issues, "video_full");
    }
    syncSubscriptions();
    const next = buildSnapshot(participants);
    const nextSignature = signatureOf(next);
    if (nextSignature === signature) return;
    const previousIssues = snapshot.issues;
    snapshot = next;
    if (sameIssues(previousIssues, next.issues)) snapshot = { ...next, issues: previousIssues };
    signature = nextSignature;
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch {
        /* 订阅者的错不影响别人 */
      }
    }
  }

  // ---- 心跳 ----------------------------------------------------------------------
  function mediaNow(): CallMedia {
    return { mic: me.mic, camera: me.camera, screen: me.screen };
  }

  async function sendHeartbeat(): Promise<void> {
    const s = session;
    if (!s || !s.joined || !s.callId) return;
    try {
      await api.heartbeat(s.callId, mediaNow());
    } catch (err) {
      if (session !== s) return;
      const code = codeOf(err);
      const status = statusOf(err);
      if (code === "call_unavailable") {
        void teardown({ callApi: false, error: null });
      } else if (code === "removed_from_conversation" || code === "not_member") {
        void teardown({ callApi: false, error: callErrorOf(err) });
      } else if (status === 403 || status === 404) {
        void rejoin(`heartbeat_${code}`);
      }
    }
  }

  function heartbeatSoon(): void {
    if (!session?.joined) return;
    setTimer("heartbeatSoon", () => void sendHeartbeat(), HEARTBEAT_DEBOUNCE_MS);
  }

  // ---- 设备 ----------------------------------------------------------------------
  function micConstraints(): MediaTrackConstraints | undefined {
    return me.micDeviceId ? { deviceId: me.micDeviceId } : undefined;
  }

  async function listDevices(): Promise<{ microphones: MediaDeviceLite[]; cameras: MediaDeviceLite[]; speakers: MediaDeviceLite[] }> {
    const md = deps.mediaDevices;
    if (!md) return { microphones: [], cameras: [], speakers: [] };
    let all: MediaDeviceInfo[] = [];
    try {
      all = await md.enumerateDevices();
    } catch {
      all = [];
    }
    const pick = (kind: MediaDeviceKind): MediaDeviceLite[] => {
      const seen = new Set<string>();
      const out: MediaDeviceLite[] = [];
      for (const device of all) {
        if (device.kind !== kind || !device.deviceId || seen.has(device.deviceId)) continue;
        seen.add(device.deviceId);
        out.push({ deviceId: device.deviceId, label: device.label || "" });
      }
      return out;
    };
    return { microphones: pick("audioinput"), cameras: pick("videoinput"), speakers: deps.sinkIdSupported() ? pick("audiooutput") : [] };
  }

  function flagDeviceIssue(issue: CallIssue): void {
    issues = withIssue(issues, issue);
    if (issue.kind === "device_lost") {
      setTimer("deviceIssue", () => {
        issues = withoutIssue(issues, "device_lost");
        commit();
      }, DEVICE_ISSUE_CLEAR_MS);
    }
  }

  /** 设备拔出：当前选的设备不见了就回落到「默认」或第一个可用的（沿用旧面板的回落思路）。 */
  async function onDeviceChange(): Promise<void> {
    const s = session;
    const engine = s?.engine;
    if (!s || !engine || !s.joined) return;
    const list = await listDevices();
    if (session !== s) return;
    if (list.microphones.length === 0) {
      if (me.mic) flagDeviceIssue({ kind: "no_mic" });
    } else {
      issues = withoutIssue(issues, "no_mic");
      if (me.micDeviceId && !list.microphones.some((d) => d.deviceId === me.micDeviceId)) {
        const fallback = list.microphones.find((d) => d.deviceId === "default") ?? list.microphones[0];
        me = { ...me, micDeviceId: fallback.deviceId };
        if (s.micCaptured) {
          try {
            await engine.switchMicrophone(fallback.deviceId);
          } catch (err) {
            log("mic fallback failed", err);
          }
        }
        flagDeviceIssue({ kind: "device_lost", detail: "mic" });
      }
    }
    if (me.cameraDeviceId && !list.cameras.some((d) => d.deviceId === me.cameraDeviceId)) {
      const fallback = list.cameras[0];
      me = { ...me, cameraDeviceId: fallback ? fallback.deviceId : null };
      if (me.camera) {
        if (fallback) {
          try {
            await engine.switchCamera(fallback.deviceId);
          } catch (err) {
            log("camera fallback failed", err);
          }
        } else {
          await setCameraInternal(false, { persist: false });
        }
        flagDeviceIssue({ kind: "device_lost", detail: "camera" });
      }
    }
    if (me.speakerDeviceId && !list.speakers.some((d) => d.deviceId === me.speakerDeviceId)) {
      me = { ...me, speakerDeviceId: null };
      applySinkAll();
      flagDeviceIssue({ kind: "device_lost", detail: "speaker" });
    }
    commit();
  }

  function attachDeviceWatcher(): void {
    if (deviceWatcher || !deps.mediaDevices?.addEventListener) return;
    const md = deps.mediaDevices;
    const handler = () => void onDeviceChange();
    md.addEventListener?.("devicechange", handler);
    deviceWatcher = () => md.removeEventListener?.("devicechange", handler);
  }

  function detachDeviceWatcher(): void {
    deviceWatcher?.();
    deviceWatcher = null;
  }

  // ---- SDK 事件 -------------------------------------------------------------------
  function bindEngine(s: Session, engine: ArtcEngine): void {
    const on = (name: string, fn: (...args: unknown[]) => void) => {
      engine.on(name, (...args: unknown[]) => {
        if (session !== s || s.engine !== engine) return;
        try {
          fn(...args);
        } catch (err) {
          log(`sdk event ${name} failed`, err);
        }
      });
    };
    on("connectionStatusChange", (status) => onConnectionStatus(s, status));
    on("remoteUserOnLineNotify", (uid) => {
      if (typeof uid !== "string") return;
      remoteOnline(engine, uid);
      commit();
    });
    on("remoteUserOffLineNotify", (uid, reason) => {
      if (typeof uid !== "string") return;
      remoteOffline(uid, reason);
      commit();
    });
    on("remoteTrackAvailableNotify", (uid, audioTrack, videoTrack) => {
      if (typeof uid !== "string") return;
      remoteTracks(engine, uid, audioTrack, videoTrack);
      commit();
    });
    on("userAudioMuted", (uid, mute) => {
      const r = typeof uid === "string" ? remotes.get(uid) : undefined;
      if (!r) return;
      r.audioMuted = Boolean(mute);
      if (r.audioMuted) speakers.set(r.uid, silence(speakers.get(r.uid)));
      commit();
    });
    on("userVideoMuted", (uid, mute) => {
      const r = typeof uid === "string" ? remotes.get(uid) : undefined;
      if (!r) return;
      r.cameraMuted = Boolean(mute);
      commit();
    });
    on("userScreenMuted", (uid, mute) => {
      const r = typeof uid === "string" ? remotes.get(uid) : undefined;
      if (!r) return;
      r.screenMuted = Boolean(mute);
      commit();
    });
    on("audioSubscribeStateChanged", (uid) => {
      if (typeof uid === "string") applySink(engine, uid);
    });
    on("audioVolume", (list) => onVolume(list));
    on("authInfoWillExpire", () => void refreshToken(s));
    on("authInfoExpired", () => void rejoin("auth_expired"));
    on("bye", (code) => onBye(code));
    on("localDeviceException", (_type, exceptionType) => {
      const issue = issueFromDeviceException(exceptionType);
      if (!issue) return;
      if (issue.kind === "mic_permission" || issue.kind === "no_mic") me = { ...me, mic: false };
      if (issue.kind === "camera_permission") me = { ...me, camera: false };
      flagDeviceIssue(issue);
      if (issue.kind === "device_lost") void onDeviceChange();
      heartbeatSoon();
      commit();
    });
    on("rtcStats", (pair) => {
      tracker.onTransport(pair);
      updateNetwork();
    });
    on("rtcLocalAudioStats", (list) => tracker.onLocalOutbound("audio", list));
    on("rtcLocalVideoStats", (list) => tracker.onLocalOutbound("video", list));
    on("rtcRemoteAudioStats", (list) => tracker.onRemoteInbound("audio", list));
    on("rtcRemoteVideoStats", (list) => tracker.onRemoteInbound("video", list));
    on("networkQuality", (event) => {
      tracker.onNetworkQuality(event);
      updateNetwork();
    });
    on("occurError", (err) => log("sdk error", err));
  }

  function onConnectionStatus(s: Session, status: unknown): void {
    if (!s.joined) return;
    if (status === CONNECTION_STATUS.connected) {
      connectionLost = false;
      issues = withoutIssue(issues, "network_lost");
      if (phase === "reconnecting" && !s.rejoining) phase = "connected";
      updateNetwork();
    } else if (
      status === CONNECTION_STATUS.reconnecting ||
      status === CONNECTION_STATUS.disconnected ||
      status === CONNECTION_STATUS.connecting
    ) {
      connectionLost = true;
      issues = withIssue(issues, { kind: "network_lost" });
      if (phase === "connected") phase = "reconnecting";
      updateNetwork();
    } else if (status === CONNECTION_STATUS.failed) {
      void rejoin("connection_failed");
    }
  }

  function onBye(code: unknown): void {
    if (code === BYE_TYPE.userReplaced) {
      void teardown({ callApi: false, error: { code: "joined_elsewhere", message: CALL_ERROR_MESSAGES.joined_elsewhere } });
    } else if (code === BYE_TYPE.kicked) {
      void teardown({ callApi: false, error: { code: "artc_kicked", message: CALL_ERROR_MESSAGES.artc_kicked } });
    } else if (code === BYE_TYPE.channelTerminated) {
      void teardown({ callApi: false, error: null });
    }
  }

  async function refreshToken(s: Session): Promise<void> {
    if (session !== s || !s.callId || !s.engine) return;
    const engine = s.engine;
    try {
      const { rtc } = await api.refreshToken(s.callId);
      if (session !== s || s.engine !== engine) return;
      await engine.refreshAuthInfo(rtc.token);
      s.refreshRetried = false;
    } catch (err) {
      if (session !== s) return;
      const code = codeOf(err);
      if (code === "call_unavailable") {
        void teardown({ callApi: false, error: null });
      } else if (code === "removed_from_conversation" || code === "not_member") {
        void teardown({ callApi: false, error: callErrorOf(err) });
      } else if (!s.refreshRetried) {
        s.refreshRetried = true;
        setTimer("tokenRetry", () => void refreshToken(s), TOKEN_RETRY_MS);
      }
    }
  }

  // ---- 入会 ----------------------------------------------------------------------
  function adoptJoinResponse(s: Session, res: JoinResponse): void {
    s.callId = res.call.call_id;
    s.participantId = res.participant_id;
    s.rtcUserId = res.rtc.user_id;
    s.startedAt = res.call.started_at;
    context = { conversationId: s.conversationId, conversationTitle: s.conversationTitle, callId: s.callId, startedAt: s.startedAt };
    setServer(res.call);
  }

  async function connectEngine(s: Session, res: JoinResponse, sdk: ArtcSdk): Promise<void> {
    adoptJoinResponse(s, res);
    if (!res.rtc?.token) throw namedError("rtc_credentials_incomplete");
    const engine = sdk.createEngine();
    s.engine = engine;
    s.sdk = sdk;
    bindEngine(s, engine);
    const stale = () => session !== s || s.engine !== engine;
    await prepareEngine(engine, { autoSubscribeAudio: true });
    engine.enableAudioVolumeIndication(VOLUME_INTERVAL_MS);
    await engine.publishLocalVideoStream(false);
    if (engine.publishLocalScreenShareStream) await engine.publishLocalScreenShareStream(false);
    s.micCaptured = false;
    if (s.wantMic) {
      try {
        await engine.publishLocalAudioStream(true);
        if (engine.startAudioCapture) await engine.startAudioCapture(micConstraints());
        s.micCaptured = true;
        me = { ...me, mic: true };
        issues = withoutIssue(withoutIssue(issues, "mic_permission"), "no_mic");
      } catch (err) {
        me = { ...me, mic: false };
        const issue = issueFromMediaError("mic", err);
        if (issue) issues = withIssue(issues, issue);
        try {
          await engine.publishLocalAudioStream(false);
        } catch {
          /* 没采到就不发 */
        }
      }
    } else {
      await engine.publishLocalAudioStream(false);
      me = { ...me, mic: false };
    }
    if (stale()) throw new Cancelled();
    await engine.joinChannel(res.rtc.token, nameOf(selfId) || undefined);
    if (stale()) throw new Cancelled();
    s.joined = true;
    deps.setActiveEngine(engine);
    phase = "connected";
    connectionLost = false;
    for (const uid of engine.getOnlineRemoteUsers?.() ?? []) remoteOnline(engine, uid);
    reapplyViews();
    applySinkAll();
    setRepeating("heartbeat", () => void sendHeartbeat(), CALL_LIMITS.HEARTBEAT_MS);
    void sendHeartbeat();
    attachDeviceWatcher();
    commit();
    if (s.wantCamera) await setCameraInternal(true, { persist: false });
  }

  async function begin(
    target: { conversationId: string; callId: string | null },
    ctx: { title?: string } | undefined,
  ): Promise<void> {
    ensureHub();
    const current = session;
    if (current && current.conversationId === target.conversationId && (phase === "joining" || IN_CALL_PHASES.has(phase))) {
      if (!target.callId || !current.callId || current.callId === target.callId) return;
    }
    if (current) await teardown({ callApi: true, error: null, silent: true });
    clearTimer("reset");
    if (incoming && incoming.conversationId === target.conversationId) clearIncoming();
    error = null;
    issues = [];
    const claim = deps.claimCall("meeting");
    context = { conversationId: target.conversationId, conversationTitle: ctx?.title ?? null, callId: target.callId, startedAt: null };
    if (claim === null) {
      fail({ code: "busy_leo_realtime", message: CALL_ERROR_MESSAGES.busy_leo_realtime });
      return;
    }
    gen += 1;
    prefs = readPrefs(deps.storage);
    const s: Session = {
      gen,
      conversationId: target.conversationId,
      conversationTitle: ctx?.title ?? null,
      callId: target.callId,
      participantId: null,
      rtcUserId: null,
      startedAt: null,
      joinedAt: clock.now(),
      engine: null,
      sdk: null,
      screenShareSupported: true,
      claim,
      joined: false,
      micCaptured: false,
      wantMic: prefs.mic,
      wantCamera: prefs.camera,
      rejoining: false,
      refreshRetried: false,
    };
    session = s;
    me = {
      mic: prefs.mic,
      camera: false,
      screen: false,
      audioOnly: false,
      micDeviceId: prefs.micDeviceId,
      cameraDeviceId: prefs.cameraDeviceId,
      speakerDeviceId: prefs.speakerDeviceId,
      network: 0,
    };
    phase = "joining";
    commit();
    try {
      await ensureSelfId();
      let sdk: ArtcSdk;
      try {
        sdk = await deps.loadSdk();
      } catch (err) {
        throw Object.assign(namedError("artc_sdk_load_failed"), { cause: err });
      }
      if (session !== s) return;
      const support = await sdk.isSupported();
      if (!support.support) throw namedError("artc_unsupported");
      s.screenShareSupported = support.detail?.isScreenShareSupported !== false;
      if (session !== s) return;
      const res = target.callId ? await api.join(target.callId) : await api.startOrJoin(target.conversationId);
      if (session !== s) {
        void api.leave(res.call.call_id).catch(() => undefined);
        return;
      }
      await connectEngine(s, res, sdk);
    } catch (err) {
      if (err instanceof Cancelled || session !== s) return;
      const failure = callErrorOf(err, "artc_join_failed");
      if (failure.code === "call_full") issues = withIssue(issues, { kind: "call_full" });
      if (failure.code === "artc_unsupported") issues = withIssue(issues, { kind: "artc_unsupported" });
      log("join failed", err);
      await teardown({ callApi: Boolean(s.callId), error: failure, phase: "error" });
    }
  }

  function fail(failure: { code: string; message: string }): void {
    phase = "error";
    error = failure;
    commit();
    setTimer("reset", resetToIdle, ERROR_RESET_MS);
  }

  function resetToIdle(): void {
    if (phase !== "ended" && phase !== "error") return;
    phase = "idle";
    error = null;
    context = null;
    issues = [];
    commit();
  }

  async function destroyEngine(engine: ArtcEngine | null): Promise<void> {
    if (!engine) return;
    try {
      await engine.leaveChannel();
    } catch {
      /* 不在频道里 */
    }
    try {
      await engine.destroy();
    } catch {
      /* 已销毁 */
    }
  }

  function clearCallTimers(): void {
    clearRepeating("heartbeat");
    for (const name of Object.keys(timers)) {
      if (name === "incoming" || name === "heartbeat") continue;
      clearTimer(name);
    }
  }

  function stopScreenWatch(): void {
    if (screenTrack && screenTrackEnded) screenTrack.removeEventListener?.("ended", screenTrackEnded);
    screenTrack = null;
    screenTrackEnded = null;
  }

  async function teardown(opts: {
    callApi: boolean;
    error: { code: string; message: string } | null;
    phase?: "ended" | "error";
    silent?: boolean;
  }): Promise<void> {
    const s = session;
    if (!s) return;
    session = null;
    phase = "leaving";
    if (!opts.silent) commit();
    clearCallTimers();
    detachDeviceWatcher();
    stopScreenWatch();
    deps.setActiveEngine(null);
    const tasks: Array<Promise<unknown>> = [destroyEngine(s.engine)];
    if (opts.callApi && s.callId) tasks.push(api.leave(s.callId).catch(() => undefined));
    await Promise.all(tasks);
    deps.releaseCall("meeting", s.claim);
    remotes.clear();
    speakers.clear();
    wanted.clear();
    views.clear();
    ordering = EMPTY_ORDERING;
    viewport = null;
    aloneSince = null;
    aloneDeadline = null;
    micSilentSince = null;
    poorSince = null;
    connectionLost = false;
    tracker.reset();
    setServer(null);
    me = { ...me, mic: prefs.mic, camera: false, screen: false, audioOnly: false, network: 0 };
    issues = withoutIssue(withoutIssue(withoutIssue(issues, "network_lost"), "network_poor"), "mic_silent");
    phase = opts.phase ?? "ended";
    error = opts.error;
    if (opts.silent) {
      phase = "idle";
      context = null;
      return;
    }
    commit();
    setTimer("reset", resetToIdle, phase === "error" ? ERROR_RESET_MS : ENDED_RESET_MS);
  }

  async function rejoin(reason: string): Promise<void> {
    const s = session;
    if (!s || !s.callId || s.rejoining || !s.joined) return;
    s.rejoining = true;
    log("rejoin", reason);
    phase = "reconnecting";
    connectionLost = true;
    issues = withIssue(issues, { kind: "network_lost" });
    commit();
    s.wantMic = me.mic;
    s.wantCamera = me.camera;
    for (const delay of REJOIN_DELAYS_MS) {
      await sleep(delay);
      if (session !== s) return;
      try {
        const sdk = s.sdk ?? (await deps.loadSdk());
        const res = await api.join(s.callId);
        if (session !== s) return;
        const old = s.engine;
        s.engine = null;
        s.joined = false;
        deps.setActiveEngine(null);
        stopScreenWatch();
        me = { ...me, screen: false };
        await destroyEngine(old);
        if (session !== s) return;
        const now = clock.now();
        for (const r of remotes.values()) {
          if (r.online) {
            r.online = false;
            r.droppedAt = now;
          }
        }
        wanted.clear();
        await connectEngine(s, res, sdk);
        s.rejoining = false;
        connectionLost = false;
        issues = withoutIssue(issues, "network_lost");
        commit();
        return;
      } catch (err) {
        if (session !== s || err instanceof Cancelled) return;
        const code = codeOf(err);
        if (code === "call_unavailable") {
          s.rejoining = false;
          await teardown({ callApi: false, error: null });
          return;
        }
        if (code === "removed_from_conversation" || code === "not_member") {
          s.rejoining = false;
          await teardown({ callApi: false, error: callErrorOf(err) });
          return;
        }
        log("rejoin attempt failed", err);
      }
    }
    s.rejoining = false;
    await teardown({ callApi: true, error: { code: "rejoin_failed", message: CALL_ERROR_MESSAGES.rejoin_failed }, phase: "error" });
  }

  // ---- 本地媒体 ------------------------------------------------------------------
  async function setMicAction(on: boolean): Promise<void> {
    const s = session;
    const engine = s?.engine;
    if (!s || !engine || !s.joined) {
      if (s) s.wantMic = on;
      me = { ...me, mic: on };
      prefs = writePrefs(deps.storage, { mic: on });
      commit();
      return;
    }
    if (on) {
      try {
        if (!s.micCaptured) {
          if (engine.startAudioCapture) await engine.startAudioCapture(micConstraints());
          await engine.publishLocalAudioStream(true);
          s.micCaptured = true;
        }
        engine.muteLocalMic(false);
        me = { ...me, mic: true };
        issues = withoutIssue(withoutIssue(issues, "mic_permission"), "no_mic");
        prefs = writePrefs(deps.storage, { mic: true });
      } catch (err) {
        me = { ...me, mic: false };
        const issue = issueFromMediaError("mic", err);
        if (issue) issues = withIssue(issues, issue);
      }
    } else {
      try {
        engine.muteLocalMic(true);
      } catch (err) {
        log("mute failed", err);
      }
      me = { ...me, mic: false };
      micSilentSince = null;
      issues = withoutIssue(issues, "mic_silent");
      speakers.set("", silence(speakers.get("")));
      prefs = writePrefs(deps.storage, { mic: false });
    }
    heartbeatSoon();
    commit();
  }

  async function setCameraInternal(on: boolean, opts: { persist: boolean }): Promise<void> {
    const s = session;
    const engine = s?.engine;
    if (!s || !engine || !s.joined) {
      if (s) s.wantCamera = on;
      if (opts.persist) prefs = writePrefs(deps.storage, { camera: on });
      commit();
      return;
    }
    if (on) {
      if (cameraCountExcludingMe() >= CALL_LIMITS.MAX_VIDEO) {
        issues = withIssue(issues, { kind: "video_full" });
        commit();
        return;
      }
      try {
        if (me.cameraDeviceId && engine.setCameraCapturerConfiguration) {
          await engine.setCameraCapturerConfiguration({ deviceId: me.cameraDeviceId });
        }
        await engine.publishLocalVideoStream(true);
        if (session !== s) return;
        me = { ...me, camera: true };
        issues = withoutIssue(withoutIssue(issues, "camera_permission"), "video_full");
        if (opts.persist) prefs = writePrefs(deps.storage, { camera: true });
        for (const view of views.values()) {
          if (view.participantId === s.participantId && view.track === "camera") applyView(view.participantId, view.track, view.el);
        }
      } catch (err) {
        me = { ...me, camera: false };
        const issue = issueFromMediaError("camera", err);
        if (issue) issues = withIssue(issues, issue);
        try {
          await engine.publishLocalVideoStream(false);
        } catch {
          /* 没开成就不发 */
        }
      }
    } else {
      try {
        await engine.publishLocalVideoStream(false);
        if (engine.enableLocalVideo) await engine.enableLocalVideo(false);
      } catch (err) {
        log("camera off failed", err);
      }
      me = { ...me, camera: false };
      if (opts.persist) prefs = writePrefs(deps.storage, { camera: false });
    }
    heartbeatSoon();
    commit();
  }

  async function setScreenShareAction(on: boolean): Promise<void> {
    const s = session;
    const engine = s?.engine;
    if (!s || !engine || !s.joined) throw namedError("not_in_call");
    if (on) {
      if (me.screen) return;
      if (!s.screenShareSupported) throw namedError("screen_share_unsupported");
      try {
        if (engine.publishLocalScreenShareStream) await engine.publishLocalScreenShareStream(true);
        else await engine.startScreenShare();
        if (session !== s) return;
        me = { ...me, screen: true };
        issues = withoutIssue(issues, "screen_permission");
        stopScreenWatch();
        try {
          const track = (await engine.getVideoTrack?.({ streamType: 1 })) ?? null;
          if (track && session === s) {
            screenTrack = track;
            screenTrackEnded = () => void setScreenShareAction(false).catch(() => undefined);
            track.addEventListener?.("ended", screenTrackEnded);
          }
        } catch {
          /* 拿不到轨道：只是没有尺寸信息 */
        }
        for (const view of views.values()) {
          if (view.participantId === s.participantId && view.track === "screen") applyView(view.participantId, view.track, view.el);
        }
      } catch (err) {
        me = { ...me, screen: false };
        const issue = issueFromMediaError("screen", err);
        if (issue) issues = withIssue(issues, issue);
        try {
          if (engine.publishLocalScreenShareStream) await engine.publishLocalScreenShareStream(false);
        } catch {
          /* ignore */
        }
      }
    } else {
      if (!me.screen) return;
      stopScreenWatch();
      try {
        if (engine.publishLocalScreenShareStream) await engine.publishLocalScreenShareStream(false);
        await engine.stopScreenShare();
      } catch (err) {
        log("screen off failed", err);
      }
      me = { ...me, screen: false };
    }
    heartbeatSoon();
    commit();
  }

  async function selectDeviceAction(kind: "mic" | "camera" | "speaker", deviceId: string): Promise<void> {
    const id = String(deviceId || "");
    const s = session;
    const engine = s?.joined ? s.engine : null;
    if (kind === "speaker") {
      if (!deps.sinkIdSupported()) throw namedError("speaker_select_unsupported");
      me = { ...me, speakerDeviceId: id || null };
      prefs = writePrefs(deps.storage, { speakerDeviceId: id || null });
      applySinkAll();
      commit();
      return;
    }
    if (kind === "mic") {
      me = { ...me, micDeviceId: id || null };
      prefs = writePrefs(deps.storage, { micDeviceId: id || null });
      if (engine && s?.micCaptured && id) {
        try {
          await engine.switchMicrophone(id);
          issues = withoutIssue(issues, "device_lost");
        } catch (err) {
          const issue = issueFromMediaError("mic", err);
          if (issue) flagDeviceIssue(issue);
        }
      }
      commit();
      return;
    }
    me = { ...me, cameraDeviceId: id || null };
    prefs = writePrefs(deps.storage, { cameraDeviceId: id || null });
    if (engine && id) {
      try {
        if (me.camera) await engine.switchCamera(id);
        else await engine.setCameraCapturerConfiguration?.({ deviceId: id });
        issues = withoutIssue(issues, "device_lost");
      } catch (err) {
        const issue = issueFromMediaError("camera", err);
        if (issue) flagDeviceIssue(issue);
      }
    }
    commit();
  }

  async function setLocalMuteAction(participantId: string, muted: boolean): Promise<void> {
    if (!participantId) return;
    if (muted) locallyMuted.add(participantId);
    else locallyMuted.delete(participantId);
    const engine = session?.engine;
    const uid = rtcUserIdForParticipant(participantId);
    if (engine && remotes.get(uid)?.online) {
      try {
        engine.muteRemoteAudioPlaying(uid, muted);
      } catch (err) {
        log("local mute failed", err);
      }
    }
    commit();
  }

  async function leaveAction(reason?: string): Promise<void> {
    if (!session) {
      if (phase === "ended" || phase === "error") {
        clearTimer("reset");
        resetToIdle();
      }
      return;
    }
    const failure = reason === "alone_timeout" ? { code: "alone_timeout", message: CALL_ERROR_MESSAGES.alone_timeout } : null;
    await teardown({ callApi: true, error: failure });
  }

  const actions: CallActions = {
    startOrJoin: (conversationId, ctx) => begin({ conversationId: String(conversationId || ""), callId: null }, ctx),
    join: (callId, conversationId, ctx) => begin({ conversationId: String(conversationId || ""), callId: String(callId || "") || null }, ctx),
    leave: (reason) => leaveAction(reason),
    setMic: (on) => setMicAction(Boolean(on)),
    setCamera: (on) => setCameraInternal(Boolean(on), { persist: true }),
    setScreenShare: (on) => setScreenShareAction(Boolean(on)),
    async setAudioOnly(on) {
      me = { ...me, audioOnly: Boolean(on) };
      commit();
    },
    listDevices,
    selectDevice: (kind, deviceId) => selectDeviceAction(kind, deviceId),
    setLocalMute: (participantId, muted) => setLocalMuteAction(participantId, Boolean(muted)),
    setViewport(mode, visibleIds) {
      viewport = { mode: mode === "stage" ? "stage" : "dock", ids: Array.isArray(visibleIds) ? visibleIds.filter((id) => typeof id === "string") : [] };
      syncSubscriptions();
      commit();
    },
    attachVideo(el, participantId, track) {
      if (!participantId || (track !== "camera" && track !== "screen")) return;
      const key = `${participantId}:${track}`;
      if (el) views.set(key, { participantId, track, el });
      else views.delete(key);
      applyView(participantId, track, el);
    },
    async acceptIncoming() {
      const call = incoming;
      if (!call) return;
      clearIncoming();
      commit();
      await begin({ conversationId: call.conversationId, callId: call.callId }, { title: call.callerName || undefined });
    },
    async declineIncoming() {
      const call = incoming;
      if (!call) return;
      clearIncoming();
      commit();
      try {
        await api.decline(call.callId);
      } catch (err) {
        log("decline failed", err);
      }
    },
    cancelAloneTimer() {
      clearTimer("aloneWarn");
      clearTimer("aloneLeave");
      aloneSince = null;
      aloneDeadline = null;
      commit();
    },
    async getStats(): Promise<CallStats> {
      return session?.joined ? tracker.stats() : { ...EMPTY_STATS };
    },
    getScreenShareSurface() {
      if (!me.screen || !screenTrack) return null;
      let settings: MediaTrackSettings & { displaySurface?: string } = {};
      try {
        settings = (screenTrack.getSettings?.() ?? {}) as MediaTrackSettings & { displaySurface?: string };
      } catch {
        settings = {};
      }
      const width = typeof settings.width === "number" ? settings.width : 0;
      const height = typeof settings.height === "number" ? settings.height : 0;
      return { width, height, displaySurface: typeof settings.displaySurface === "string" ? settings.displaySurface : "unknown" };
    },
  };

  return {
    store: {
      subscribe(listener) {
        ensureHub();
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getSnapshot: () => snapshot,
    },
    actions,
    onPageHide() {
      const s = session;
      if (!s) return;
      if (s.callId) void api.leave(s.callId, { keepalive: true }).catch(() => undefined);
      if (s.engine) void s.engine.leaveChannel().catch(() => undefined);
    },
    dispose() {
      hubOff?.();
      hubOff = null;
      void teardown({ callApi: true, error: null, silent: true });
      for (const name of Object.keys(timers)) {
        clearTimer(name);
        clearRepeating(name);
      }
      listeners.clear();
    },
  };
}
