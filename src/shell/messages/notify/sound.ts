// 新消息提示音（work-chat 契约 §9.8，F03）：设置里的「提示音」开着时，新消息到达响一声。
//
// - 用 Web Audio 现场合成一声约 200ms 的短音，不带音频文件、不加依赖；
// - 浏览器的自动播放限制：`AudioContext` 在第一次用户手势（点、按键、触摸）之后才创建/恢复，
//   在那之前到达的消息一律静默；
// - 什么时候响：设置 `sound === true`、不是自己发的、不是系统消息、不是此刻正在看的那个会话
//   （`foregroundConversation`：标签页可见且浮层开着并选中它）、会话没静音；
//   被 @ 仍然响，除非 `notify_level === "none"`（与桌面通知同一套规则）；
// - 节流：2 秒内最多响一次（真正响了才计时）。
import type { ImConversationSummary, ImEvent, ImMessage, ImSettings } from "../../../lib/im/types";

/** 两次提示音之间的最短间隔。 */
export const SOUND_THROTTLE_MS = 2000;
/** 提示音长度（秒）。 */
export const SOUND_DURATION_S = 0.2;

export interface ToneParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}

export interface AudioContextLike {
  readonly state: string;
  readonly currentTime: number;
  readonly destination: unknown;
  resume?(): Promise<void> | void;
  createOscillator(): {
    type: string;
    frequency: ToneParamLike;
    connect(node: unknown): unknown;
    start(time?: number): void;
    stop(time?: number): void;
  };
  createGain(): {
    gain: ToneParamLike;
    connect(node: unknown): unknown;
  };
}

/** 一条新消息该不该响。纯函数，规则与桌面通知一致（但不要求标签页在后台）。 */
export function shouldPlayMessageSound(input: {
  settings: Pick<ImSettings, "sound"> | null | undefined;
  message: Pick<ImMessage, "sender_kind" | "sender_id" | "mentions" | "mention_all">;
  conversationId: string;
  conversation: Pick<ImConversationSummary, "muted" | "notify_level"> | undefined;
  selfId: string | null;
  foregroundConversationId: string | null;
}): boolean {
  const { settings, message, conversation, selfId } = input;
  if (!settings || settings.sound !== true) return false;
  if (!selfId) return false; // 还不知道自己是谁，就分不清「自己发的」：宁可不响
  if (message.sender_kind === "system") return false;
  if (selfId && message.sender_kind === "user" && message.sender_id === selfId) return false;
  if (input.foregroundConversationId && input.foregroundConversationId === input.conversationId) return false;
  const mentioned =
    Boolean(message.mention_all) ||
    Boolean(selfId && Array.isArray(message.mentions) && message.mentions.includes(selfId));
  if (conversation) {
    if (conversation.notify_level === "none") return false;
    if (conversation.notify_level === "mentions" && !mentioned) return false;
    if (conversation.muted && !mentioned) return false;
  }
  return true;
}

export interface MessageSoundDeps {
  /** 造 `AudioContext`；没有 Web Audio 时返回 null。 */
  createContext(): AudioContextLike | null;
  now(): number;
}

export interface MessageSound {
  /** 用户做过手势：创建（或恢复）AudioContext。幂等。 */
  noteUserGesture(): void;
  /** 响一声。返回是否真的响了（手势之前、被节流时为 false）。 */
  play(): boolean;
  /** 释放 AudioContext。 */
  dispose(): void;
}

export function createMessageSound(deps: MessageSoundDeps): MessageSound {
  let ctx: AudioContextLike | null = null;
  let lastPlayedAt = Number.NEGATIVE_INFINITY;
  let unlocked = false;

  function ensureContext(): AudioContextLike | null {
    if (ctx) return ctx;
    try {
      ctx = deps.createContext();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  return {
    noteUserGesture() {
      unlocked = true;
      const context = ensureContext();
      if (!context) return;
      if (context.state === "suspended") {
        try {
          void Promise.resolve(context.resume?.()).catch(() => {});
        } catch {
          /* 恢复失败就保持静默 */
        }
      }
    },
    play() {
      if (!unlocked || !ctx) return false;
      if (ctx.state !== "running") return false;
      const at = deps.now();
      if (at - lastPlayedAt < SOUND_THROTTLE_MS) return false;
      try {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        // 一个轻快的上扬音：784Hz → 1046Hz，淡入淡出，避免爆音。
        osc.frequency.setValueAtTime(784, t);
        osc.frequency.setValueAtTime(1046, t + SOUND_DURATION_S / 2);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + SOUND_DURATION_S);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + SOUND_DURATION_S);
      } catch {
        return false;
      }
      lastPlayedAt = at;
      return true;
    },
    dispose() {
      const context = ctx as (AudioContextLike & { close?(): Promise<void> | void }) | null;
      ctx = null;
      unlocked = false;
      try {
        void Promise.resolve(context?.close?.()).catch(() => {});
      } catch {
        /* ignore */
      }
    },
  };
}

// ---------------------------------------------------------------------------
// 接到消息状态仓与浏览器
// ---------------------------------------------------------------------------
export interface SoundStoreLike {
  onEvent(
    type: "message.created",
    handler: (event: Extract<ImEvent, { type: "message.created" }>) => void,
  ): () => void;
  selfId(): string | null;
  inbox(): { items: ImConversationSummary[] };
  foregroundConversation(): string | null;
}

export interface GestureTargetLike {
  addEventListener(type: string, listener: () => void, options?: unknown): void;
  removeEventListener(type: string, listener: () => void, options?: unknown): void;
}

export interface AttachSoundOptions {
  store: SoundStoreLike;
  sound: MessageSound;
  /** 当前的提醒设置（读缓存）；还没取到时返回 null——此时静默，不拿默认值瞎响。 */
  getSettings(): Pick<ImSettings, "sound"> | null;
  gestureTarget: GestureTargetLike;
}

export const GESTURE_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

/** 订阅「新消息到达」，按规则响提示音。返回取消函数。 */
export function attachMessageSound(options: AttachSoundOptions): () => void {
  const { store, sound, gestureTarget } = options;
  const onGesture = () => sound.noteUserGesture();
  for (const name of GESTURE_EVENTS) gestureTarget.addEventListener(name, onGesture, { capture: true, passive: true });

  const off = store.onEvent("message.created", (event) => {
    const conversation = store.inbox().items.find((item) => item.id === event.conversation_id);
    const ok = shouldPlayMessageSound({
      settings: options.getSettings(),
      message: event.message,
      conversationId: event.conversation_id,
      conversation,
      selfId: store.selfId(),
      foregroundConversationId: store.foregroundConversation(),
    });
    if (ok) sound.play();
  });

  return () => {
    off();
    for (const name of GESTURE_EVENTS) gestureTarget.removeEventListener(name, onGesture, { capture: true });
    sound.dispose();
  };
}

/** 浏览器默认接线：真实 `AudioContext`、`window` 上的手势。 */
export function createBrowserMessageSound(): MessageSound {
  return createMessageSound({
    createContext() {
      if (typeof window === "undefined") return null;
      const w = window as unknown as {
        AudioContext?: new () => AudioContextLike;
        webkitAudioContext?: new () => AudioContextLike;
      };
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      return Ctor ? new Ctor() : null;
    },
    now: () => Date.now(),
  });
}
