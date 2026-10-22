// 通话服务的状态仓（模块级单例，一个标签页一份）：字幕聚合结果、本地「隐藏字幕」选择、
// 转写/录制开关的进行中与错误、开关请求结果的短暂覆盖、自己的字幕上行与采集状态。
// 纯 TS（依赖注入 API、时钟、计时器、存储），tests/call-services-toggles.test.mjs 直接跑真实现。
//
// 状态以服务端为准：转写/录制是否开着读 W05 快照里的 `server.transcription` / `server.recording`（CallView）。
// 开关请求返回后、`call` 广播到达前的那一小会儿，用请求返回的视图顶一下（最多 10 秒；
// 一旦服务端快照变了就以快照为准）。
import type { RecordingView, TranscriptionView } from "../../../../lib/im/call-types";
import {
  applyCaptionEvent,
  captionsForCall,
  emptyCaptions,
  pruneCaptions,
  type CaptionEventInput,
  type CaptionsModel,
} from "./captions-model";
import { RECORDING_STORAGE_UNAVAILABLE, toServiceError, type ServiceError } from "./errors";
import { participantKey } from "./ids";
import { CAPTIONS_SAMPLE_RATE } from "./pcm";
import type { CaptionsCaptureState } from "./types";
import type { UplinkStatus } from "./uplink";

export const SERVICE_OVERRIDE_MAX_MS = 10_000;
export const SERVICE_ERROR_SHOW_MS = 8_000;
export const CAPTIONS_HIDDEN_KEY = "oceanleo.call.captions.hidden";

export interface ServiceOverride<T> {
  value: T;
  /** 点开关那一刻服务端视图的指纹；快照变了就作废。 */
  base: string;
  at: number;
}

export interface ServiceSlot<T> {
  busy: boolean;
  error: (ServiceError & { at: number }) | null;
  override: ServiceOverride<T | null> | null;
}

/** 说话人名册：本通话里见过的参与者（离开后，他最后几句字幕仍能标对名字）。 */
export interface SpeakerInfo {
  userId: string;
  displayName: string;
  isMe: boolean;
}

export interface SpeakerSource {
  participantId: string;
  userId: string;
  displayName: string;
  isMe: boolean;
}

export interface ServicesState {
  callId: string | null;
  captions: CaptionsModel;
  /** 键 = participantKey(participantId)。 */
  speakers: Record<string, SpeakerInfo>;
  captionsHidden: boolean;
  transcription: ServiceSlot<TranscriptionView>;
  recording: ServiceSlot<RecordingView> & { storageUnavailable: boolean };
  uplink: UplinkStatus;
  capture: CaptionsCaptureState;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ServicesApi {
  setTranscription(callId: string, enabled: boolean): Promise<{ transcription: TranscriptionView } | undefined>;
  startRecording(callId: string): Promise<{ recording: RecordingView } | undefined>;
  stopRecording(callId: string): Promise<{ recording: RecordingView } | undefined>;
}

export interface ServicesStoreDeps {
  api: ServicesApi;
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  storage(): KeyValueStorage | null;
}

/** 服务端视图的指纹（值比较，不依赖对象引用）。 */
export function viewStamp(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "";
  }
}

/**
 * 有效视图：开关刚返回、服务端快照还没变时用请求结果，否则用服务端快照。
 * 覆盖最多活 10 秒：状态仓到点自己清掉；传了 `now` 时这里也按它再判一次（同一个时钟）。
 */
export function effectiveView<T>(
  server: T | null | undefined,
  override: ServiceOverride<T | null> | null,
  now?: number,
): T | null {
  const fresh = now === undefined || !override || now - override.at < SERVICE_OVERRIDE_MAX_MS;
  if (override && fresh && override.base === viewStamp(server)) return override.value;
  return server ?? null;
}

export function transcriptionIsOn(view: TranscriptionView | null | undefined): boolean {
  return view?.enabled === true;
}

/** 「录制中」：starting / recording。 */
export function recordingIsActive(view: RecordingView | null | undefined): boolean {
  return view?.state === "starting" || view?.state === "recording";
}

export function recordingIsStopping(view: RecordingView | null | undefined): boolean {
  return view?.state === "stopping";
}

const IDLE_UPLINK: UplinkStatus = { state: "idle", sampleRate: CAPTIONS_SAMPLE_RATE, error: null };

function emptySlot<T>(): ServiceSlot<T> {
  return { busy: false, error: null, override: null };
}

export function initialServicesState(captionsHidden = false): ServicesState {
  return {
    callId: null,
    captions: emptyCaptions(null),
    speakers: {},
    captionsHidden,
    transcription: emptySlot<TranscriptionView>(),
    recording: { ...emptySlot<RecordingView>(), storageUnavailable: false },
    uplink: IDLE_UPLINK,
    capture: "off",
  };
}

export interface ServicesStore {
  subscribe(listener: () => void): () => void;
  getState(): ServicesState;
  /** 状态仓用的时钟（字幕淡出、覆盖过期都按它算；界面也用它，免得两个时钟对不上）。 */
  now(): number;
  /** 进入/离开/换了通话（null = 不在通话里）。换通话清空字幕、错误与覆盖。 */
  setCall(callId: string | null): void;
  applyCaption(event: CaptionEventInput): void;
  prune(): void;
  /** 记下当前在场者的名字（合并，不删：离开的人最后几句字幕仍要标名）。 */
  rememberSpeakers(list: SpeakerSource[]): void;
  setCaptionsHidden(hidden: boolean): void;
  setUplink(status: UplinkStatus): void;
  setCapture(state: CaptionsCaptureState): void;
  /** 翻转转写开关。`server` = 此刻快照里的 `server.transcription`。 */
  toggleTranscription(callId: string | null, server: TranscriptionView | null | undefined): Promise<void>;
  /** 开始/停止录制。`server` = 此刻快照里的 `server.recording`。 */
  toggleRecording(callId: string | null, server: RecordingView | null | undefined): Promise<void>;
}

export function createServicesStore(deps: ServicesStoreDeps): ServicesStore {
  const listeners = new Set<() => void>();
  let hiddenLoaded = false;
  let state = initialServicesState(false);
  const errorTimers: { transcription: unknown; recording: unknown } = { transcription: null, recording: null };
  const overrideTimers: { transcription: unknown; recording: unknown } = { transcription: null, recording: null };

  function readHidden(): boolean {
    try {
      return deps.storage()?.getItem(CAPTIONS_HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  }

  function ensureHidden(): void {
    if (hiddenLoaded) return;
    hiddenLoaded = true;
    const hidden = readHidden();
    if (hidden !== state.captionsHidden) state = { ...state, captionsHidden: hidden };
  }

  function set(next: ServicesState): void {
    if (next === state) return;
    state = next;
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch {
        /* 订阅者异常不影响别人 */
      }
    }
  }

  function armErrorClear(kind: "transcription" | "recording"): void {
    if (errorTimers[kind] !== null) deps.clearTimer(errorTimers[kind]);
    errorTimers[kind] = deps.setTimer(() => {
      errorTimers[kind] = null;
      const slot = state[kind];
      if (slot.error && deps.now() - slot.error.at >= SERVICE_ERROR_SHOW_MS - 1) {
        set({ ...state, [kind]: { ...slot, error: null } } as ServicesState);
      }
    }, SERVICE_ERROR_SHOW_MS);
  }

  /** 请求结果顶替服务端视图最多 10 秒：到点清掉覆盖并通知重绘（之后一律以服务端快照为准）。 */
  function armOverrideClear(kind: "transcription" | "recording"): void {
    if (overrideTimers[kind] !== null) deps.clearTimer(overrideTimers[kind]);
    overrideTimers[kind] = deps.setTimer(() => {
      overrideTimers[kind] = null;
      const slot = state[kind];
      if (slot.override && deps.now() - slot.override.at >= SERVICE_OVERRIDE_MAX_MS - 1) {
        set({ ...state, [kind]: { ...slot, override: null } } as ServicesState);
      }
    }, SERVICE_OVERRIDE_MAX_MS);
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState() {
      ensureHidden();
      return state;
    },
    now: () => deps.now(),
    setCall(callId) {
      ensureHidden();
      if (state.callId === callId) return;
      set({
        ...initialServicesState(state.captionsHidden),
        callId,
        captions: captionsForCall(state.captions, callId),
        uplink: state.uplink,
        capture: state.capture,
      });
    },
    applyCaption(event) {
      const captions = applyCaptionEvent(state.captions, event, deps.now());
      if (captions !== state.captions) set({ ...state, captions });
    },
    prune() {
      const captions = pruneCaptions(state.captions, deps.now());
      if (captions !== state.captions) set({ ...state, captions });
    },
    rememberSpeakers(list) {
      let speakers: Record<string, SpeakerInfo> | null = null;
      for (const item of list) {
        const key = participantKey(item.participantId);
        if (!key) continue;
        const known = (speakers ?? state.speakers)[key];
        const displayName = String(item.displayName ?? "").trim();
        if (known && known.displayName === displayName && known.isMe === item.isMe && known.userId === item.userId) continue;
        speakers = speakers ?? { ...state.speakers };
        speakers[key] = { userId: String(item.userId ?? ""), displayName, isMe: Boolean(item.isMe) };
      }
      if (speakers) set({ ...state, speakers });
    },
    setCaptionsHidden(hidden) {
      ensureHidden();
      try {
        deps.storage()?.setItem(CAPTIONS_HIDDEN_KEY, hidden ? "1" : "0");
      } catch {
        /* 隐私模式等写不进去：本次会话内照样生效 */
      }
      if (state.captionsHidden !== hidden) set({ ...state, captionsHidden: hidden });
    },
    setUplink(status) {
      const prev = state.uplink;
      if (prev.state === status.state && prev.error === status.error && prev.sampleRate === status.sampleRate) return;
      set({ ...state, uplink: { state: status.state, error: status.error, sampleRate: status.sampleRate } });
    },
    setCapture(capture) {
      if (state.capture !== capture) set({ ...state, capture });
    },
    async toggleTranscription(callId, server) {
      if (!callId || state.callId !== callId || state.transcription.busy) return;
      const base = viewStamp(server);
      const current = effectiveView(server ?? null, state.transcription.override, deps.now());
      const next = !transcriptionIsOn(current);
      set({ ...state, transcription: { ...state.transcription, busy: true, error: null } });
      try {
        const response = await deps.api.setTranscription(callId, next);
        if (state.callId !== callId) return;
        const value: TranscriptionView = response?.transcription ?? {
          enabled: next,
          started_by: null,
          started_at: null,
        };
        set({ ...state, transcription: { busy: false, error: null, override: { value, base, at: deps.now() } } });
        armOverrideClear("transcription");
      } catch (error) {
        if (state.callId !== callId) return;
        set({
          ...state,
          transcription: { ...state.transcription, busy: false, error: { ...toServiceError(error), at: deps.now() } },
        });
        armErrorClear("transcription");
      } finally {
        if (state.callId === callId && state.transcription.busy) {
          set({ ...state, transcription: { ...state.transcription, busy: false } });
        }
      }
    },
    async toggleRecording(callId, server) {
      if (!callId || state.callId !== callId || state.recording.busy) return;
      const base = viewStamp(server);
      const current = effectiveView(server ?? null, state.recording.override, deps.now());
      if (recordingIsStopping(current)) return;
      const stop = recordingIsActive(current);
      set({ ...state, recording: { ...state.recording, busy: true, error: null } });
      try {
        const response = stop ? await deps.api.stopRecording(callId) : await deps.api.startRecording(callId);
        if (state.callId !== callId) return;
        const value = response?.recording ?? null;
        set({
          ...state,
          recording: {
            busy: false,
            error: null,
            override: value ? { value, base, at: deps.now() } : null,
            storageUnavailable: false,
          },
        });
        if (value) armOverrideClear("recording");
      } catch (error) {
        if (state.callId !== callId) return;
        const serviceError = toServiceError(error);
        set({
          ...state,
          recording: {
            ...state.recording,
            busy: false,
            error: { ...serviceError, at: deps.now() },
            storageUnavailable: state.recording.storageUnavailable || serviceError.code === RECORDING_STORAGE_UNAVAILABLE,
          },
        });
        armErrorClear("recording");
      } finally {
        if (state.callId === callId && state.recording.busy) {
          set({ ...state, recording: { ...state.recording, busy: false } });
        }
      }
    },
  };
}
