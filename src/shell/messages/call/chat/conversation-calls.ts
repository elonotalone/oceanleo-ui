// 各会话「现在有没有通话、几个人」的客户端状态（合同 §3.2 `active_call` / `GET …/call`，§3.3 `call` 事件）。
// 纯 TS、依赖注入：tests/call-chat-inbox.test.mjs 与 call-chat-cards.test.mjs 用假依赖跑真实现。
//
// 口径（任务书 P5/P6：状态以 `call` 事件与 `active_call` 为准，不靠改消息）：
//   - 实时 `call` 事件到了 → 该会话记一条「事件条目」，以它为准；
//   - 没有事件条目时，收件箱行用列表接口带来的 `active_call`，会话视图 / 卡片用 `GET …/call` 取一次；
//   - 实时通道重连（可能丢过事件）或没人订阅期间（没在听事件）→ 条目全部作废，回到上面两种来源。
import type { CallParticipant, CallView } from "../../../../lib/im/call-types";

/** 会话列表行上的 `active_call`（合同 §3.2「会话列表」）。 */
export interface ActiveCallSummary {
  call_id: string;
  participant_count: number;
  started_at: string;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,79}$/;
/** 一通通话最多 50 人；超出的数字当脏数据截断，不拿它撑破界面。 */
const MAX_COUNT = 999;

function idOf(value: unknown): string | null {
  return typeof value === "string" && ID_PATTERN.test(value) ? value : null;
}

function countOf(value: unknown): number {
  const n = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_COUNT, Math.floor(n));
}

function isoOf(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

/** 收件箱行的 `active_call`：形状不对、人数为 0 → 当没有。 */
export function activeCallOf(raw: unknown): ActiveCallSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const callId = idOf(row.call_id);
  const count = countOf(row.participant_count);
  if (!callId || count <= 0) return null;
  return { call_id: callId, participant_count: count, started_at: isoOf(row.started_at) ?? "" };
}

/** 进行中且有人在 → 摘要；已结束、没人 → null（不再出现「进行中 · 0 人」）。 */
export function summaryOfCall(call: CallView | null | undefined): ActiveCallSummary | null {
  if (!call || call.status !== "active") return null;
  const count = Math.max(countOf(call.participant_count), Array.isArray(call.participants) ? call.participants.length : 0);
  if (count <= 0) return null;
  return { call_id: call.call_id, participant_count: Math.min(MAX_COUNT, count), started_at: call.started_at };
}

function participantOf(raw: unknown): CallParticipant | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const participantId = idOf(row.participant_id);
  const userId = idOf(row.user_id);
  if (!participantId || !userId) return null;
  const media = (row.media && typeof row.media === "object" ? row.media : {}) as Record<string, unknown>;
  return {
    participant_id: participantId,
    user_id: userId,
    joined_at: isoOf(row.joined_at) ?? "",
    last_seen_at: isoOf(row.last_seen_at) ?? "",
    media: { mic: media.mic === true, camera: media.camera === true, screen: media.screen === true },
  };
}

/**
 * 服务端给的 CallView 只当数据：核对必需字段，参与者逐个规整。形状不对 → undefined（调用方忽略这次更新）。
 * `expectedConversationId` 给了就必须一致（事件串台时不能把别的会话的通话记到这里）。
 */
export function sanitizeCallView(raw: unknown, expectedConversationId?: string): CallView | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const callId = idOf(row.call_id);
  const conversationId = typeof row.conversation_id === "string" ? row.conversation_id : null;
  const status = row.status === "active" || row.status === "ended" ? row.status : null;
  if (!callId || !conversationId || !status) return undefined;
  if (expectedConversationId && conversationId !== expectedConversationId) return undefined;
  const participants = Array.isArray(row.participants)
    ? (row.participants.map(participantOf).filter(Boolean) as CallParticipant[]).slice(0, MAX_COUNT)
    : [];
  const objectOrNull = <T,>(value: unknown): T | null =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as T) : null;
  const endedReason = row.ended_reason;
  return {
    call_id: callId,
    conversation_id: conversationId,
    status,
    started_by: idOf(row.started_by) ?? "",
    started_at: isoOf(row.started_at) ?? "",
    ended_at: isoOf(row.ended_at),
    ended_reason:
      endedReason === "empty" || endedReason === "stale" || endedReason === "admin" || endedReason === "channel_closed"
        ? endedReason
        : null,
    participants,
    participant_count: Math.max(countOf(row.participant_count), status === "active" ? participants.length : 0),
    // 下面三项归 W02/W03/W04 的状态提供者；本模块只透传、不解读。
    ring: objectOrNull<CallView["ring"]>(row.ring),
    recording: objectOrNull<CallView["recording"]>(row.recording),
    transcription: objectOrNull<CallView["transcription"]>(row.transcription),
    controls: Array.isArray(row.controls) ? (row.controls as CallView["controls"]) : [],
  };
}

export interface ConversationCallEntry {
  /** null = 这个会话现在没有进行中的通话。 */
  call: CallView | null;
  at: number;
  source: "status" | "event";
}

export interface CallEventLike {
  conversation_id?: unknown;
  call?: unknown;
}

export interface ConversationCallsDeps {
  fetchStatus(conversationId: string): Promise<{ call?: unknown }>;
  onCallEvent(handler: (event: CallEventLike) => void): () => void;
  onResync(handler: () => void): () => void;
  now(): number;
}

export interface ConversationCalls {
  subscribe(listener: () => void): () => void;
  get(conversationId: string): ConversationCallEntry | undefined;
  /** 没有条目（或超过 `staleMs`）就取一次 `GET …/call`；同一会话同时只发一个请求，失败后 30 秒内不重试。 */
  ensure(conversationId: string, staleMs?: number): Promise<void>;
  apply(event: CallEventLike): void;
  invalidate(): void;
  /** 见过的某通通话（含已结束的）：结束卡片要用它的起止时间与参与者。 */
  callById(callId: string): CallView | undefined;
  /** 当前有没有在听实时事件（测试用）。 */
  listening(): boolean;
}

export const STATUS_STALE_MS = 5 * 60_000;
export const STATUS_RETRY_MS = 30_000;
const CALL_CACHE_MAX = 200;

export function createConversationCalls(deps: ConversationCallsDeps): ConversationCalls {
  const entries = new Map<string, ConversationCallEntry>();
  const inflight = new Map<string, Promise<void>>();
  const failedAt = new Map<string, number>();
  const calls = new Map<string, CallView>();
  const listeners = new Set<() => void>();
  let detach: (() => void) | null = null;

  function emit(): void {
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch {
        /* 一个订阅者出错不影响别人 */
      }
    }
  }

  function remember(call: CallView | null): void {
    if (!call) return;
    calls.delete(call.call_id);
    calls.set(call.call_id, call);
    while (calls.size > CALL_CACHE_MAX) {
      const oldest = calls.keys().next().value;
      if (oldest === undefined) break;
      calls.delete(oldest);
    }
  }

  function set(conversationId: string, call: CallView | null, source: ConversationCallEntry["source"]): void {
    remember(call);
    // 已结束的 CallView 不算「当前通话」，但上面已经记进 calls，结束卡片还能用。
    const current = call && call.status === "active" ? call : null;
    entries.set(conversationId, { call: current, at: deps.now(), source });
    emit();
  }

  function apply(event: CallEventLike): void {
    const conversationId = typeof event?.conversation_id === "string" ? event.conversation_id : "";
    if (!conversationId) return;
    const call = sanitizeCallView(event.call, conversationId);
    if (call === undefined) return;
    set(conversationId, call, "event");
  }

  function invalidate(): void {
    if (entries.size === 0 && failedAt.size === 0) return;
    entries.clear();
    failedAt.clear();
    emit();
  }

  function attach(): void {
    if (detach) return;
    const offEvent = deps.onCallEvent(apply);
    const offResync = deps.onResync(invalidate);
    detach = () => {
      offEvent();
      offResync();
    };
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!detach) {
        // 没在听的那段时间里事件可能丢了：先作废旧条目再开始听。
        entries.clear();
        failedAt.clear();
        attach();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && detach) {
          detach();
          detach = null;
        }
      };
    },
    get(conversationId) {
      return entries.get(conversationId);
    },
    ensure(conversationId, staleMs = STATUS_STALE_MS) {
      if (!conversationId) return Promise.resolve();
      const current = entries.get(conversationId);
      const now = deps.now();
      if (current && now - current.at < staleMs) return Promise.resolve();
      const failed = failedAt.get(conversationId);
      if (failed !== undefined && now - failed < STATUS_RETRY_MS) return Promise.resolve();
      const pending = inflight.get(conversationId);
      if (pending) return pending;
      const started = now;
      const request = deps
        .fetchStatus(conversationId)
        .then((result) => {
          const latest = entries.get(conversationId);
          // 请求在路上时到了更新的事件：以事件为准。
          if (latest && latest.source === "event" && latest.at >= started) return;
          const call = sanitizeCallView(result?.call ?? null, conversationId);
          if (call === undefined) return;
          failedAt.delete(conversationId);
          set(conversationId, call, "status");
        })
        .catch(() => {
          failedAt.set(conversationId, deps.now());
        })
        .finally(() => {
          inflight.delete(conversationId);
        });
      inflight.set(conversationId, request);
      return request;
    },
    apply,
    invalidate,
    callById(callId) {
      return calls.get(callId);
    },
    listening() {
      return detach !== null;
    },
  };
}
