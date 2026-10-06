// 按会话缓存消息：乐观发送、同 client_id 去重、补缺口、事件增量、撤回/编辑/隐藏。
// 纯逻辑，不依赖 React；界面用 `useConversation(store)`（ConversationView 里）订阅。
// 每个会话（以及每个线程）一个 store，关掉再打开还在，打开时 `catchUp()` 补上期间漏掉的。

import type { MessagesApi, MessagePage, SendMessageInput } from "../../../lib/im/messages-api";
import type {
  ImAttachment,
  ImCard,
  ImEvent,
  ImMessage,
  ImReactionSummary,
} from "../../../lib/im/types";

export const PAGE_SIZE = 50;
const MAX_CACHED_STORES = 12;

export type LeoNoticeCode = "insufficient_balance" | "disabled" | "queued" | "failed";

export interface PendingMessage {
  clientId: string;
  status: "sending" | "failed";
  error: string | null;
  /** 乐观显示用的合成消息（id 以 `pending:` 开头，seq 为 0）。 */
  message: ImMessage;
  input: SendMessageInput;
}

export interface ConversationSnapshot {
  conversationId: string;
  threadRootId: string | null;
  /** 服务端确认过的消息，seq 升序。 */
  messages: ImMessage[];
  /** 还没被服务端确认的（发送中 / 失败），按发出顺序。 */
  pending: PendingMessage[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  loaded: boolean;
  loadingBefore: boolean;
  loadingAfter: boolean;
  error: string | null;
  peerLastReadSeq: number;
  /** leo 流式累加的文字，按消息 id。 */
  streaming: Record<string, string>;
  /** 只给触发人看的 leo 提示，按触发消息 id；只在本地，不存。 */
  notices: Record<string, LeoNoticeCode>;
  /** 线程里的根消息（线程 store 才有）。 */
  root: ImMessage | null;
  /** 置顶的消息（主线 store 才有）。 */
  pins: ImMessage[];
  /** 当前已经载入的最大 seq（0 = 没有）。 */
  lastSeq: number;
}

export interface ConversationStoreOptions {
  api: Pick<
    MessagesApi,
    | "listMessages"
    | "sendMessage"
    | "editMessage"
    | "recallMessage"
    | "addReaction"
    | "removeReaction"
    | "listPins"
    | "pin"
    | "unpin"
    | "getThread"
  >;
  conversationId: string;
  viewerId: string;
  /** 线程 store：只装这条根消息下的回帖。 */
  threadRootId?: string | null;
  now?: () => string;
  newId?: () => string;
}

function defaultNewId(): string {
  return globalThis.crypto.randomUUID();
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const text = String((error as { message?: unknown }).message ?? "");
    if (text) return text;
  }
  return "";
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code ?? "");
  }
  return "";
}

/** 合并同一 id 的消息，保持 seq 升序；seq 相同按 id 稳定。 */
export function mergeMessages(existing: ImMessage[], incoming: ImMessage[]): ImMessage[] {
  const byId = new Map<string, ImMessage>();
  for (const message of existing) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return Array.from(byId.values()).sort((a, b) => a.seq - b.seq || (a.id < b.id ? -1 : 1));
}

/** 反应摘要里的「我」按 viewer 重新算：事件是广播给所有人的，`mine` 对别人没有意义。 */
export function withMine(reactions: ImReactionSummary[], viewerId: string): ImReactionSummary[] {
  return reactions.map((reaction) => ({
    ...reaction,
    mine: Array.isArray(reaction.user_ids) && reaction.user_ids.length > 0
      ? reaction.user_ids.includes(viewerId)
      : reaction.mine,
  }));
}

export class ConversationStore {
  readonly conversationId: string;
  readonly threadRootId: string | null;
  private readonly api: ConversationStoreOptions["api"];
  private readonly viewerId: string;
  private readonly now: () => string;
  private readonly newId: () => string;
  private listeners = new Set<() => void>();
  private state: ConversationSnapshot;
  /** 在本地见过的回帖 id（按根消息），用来判断根消息的回帖摘要要不要刷新。 */
  private refreshingRoots = new Set<string>();
  /** 见过的最大 seq（含线程回帖的事件），判断跳号用。 */
  private seenSeq = 0;

  constructor(options: ConversationStoreOptions) {
    this.conversationId = options.conversationId;
    this.threadRootId = options.threadRootId ?? null;
    this.api = options.api;
    this.viewerId = options.viewerId;
    this.now = options.now ?? (() => new Date().toISOString());
    this.newId = options.newId ?? defaultNewId;
    this.state = {
      conversationId: this.conversationId,
      threadRootId: this.threadRootId,
      messages: [],
      pending: [],
      hasMoreBefore: false,
      hasMoreAfter: false,
      loaded: false,
      loadingBefore: false,
      loadingAfter: false,
      error: null,
      peerLastReadSeq: 0,
      streaming: {},
      notices: {},
      root: null,
      pins: [],
      lastSeq: 0,
    };
  }

  // ── 订阅 ───────────────────────────────────────────────────────────────
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ConversationSnapshot => this.state;

  private set(patch: Partial<ConversationSnapshot>): void {
    const next = { ...this.state, ...patch };
    if (patch.messages) {
      next.lastSeq = patch.messages.reduce((max, m) => Math.max(max, m.seq), 0);
      this.seenSeq = Math.max(this.seenSeq, next.lastSeq);
    }
    this.state = next;
    for (const listener of Array.from(this.listeners)) listener();
  }

  // ── 读取 ───────────────────────────────────────────────────────────────
  private noteSeq(seq: number): void {
    if (seq > this.seenSeq) this.seenSeq = seq;
  }

  private baseParams() {
    return this.threadRootId ? { thread_root_id: this.threadRootId } : {};
  }

  private async fetchPage(params: Parameters<MessagesApi["listMessages"]>[1]): Promise<MessagePage> {
    return this.api.listMessages(this.conversationId, { ...this.baseParams(), ...params });
  }

  private ownMain(items: ImMessage[]): ImMessage[] {
    if (this.threadRootId) return items.filter((m) => m.thread_root_id === this.threadRootId);
    // 主线只显示根消息与非回帖；线程回帖不进来。
    return items.filter((m) => !m.thread_root_id);
  }

  /** 打开会话：取最新一页（替换当前窗口）。 */
  async loadLatest(): Promise<void> {
    try {
      if (this.threadRootId) {
        const thread = await this.api.getThread(this.threadRootId);
        const items = this.ownMain(thread.items ?? []);
        this.set({
          root: thread.root,
          messages: mergeMessages([], items),
          hasMoreBefore: false,
          hasMoreAfter: false,
          loaded: true,
          error: null,
        });
        return;
      }
      const page = await this.fetchPage({ limit: PAGE_SIZE });
      this.set({
        messages: mergeMessages([], this.ownMain(page.items)),
        hasMoreBefore: page.has_more_before,
        hasMoreAfter: page.has_more_after,
        peerLastReadSeq: page.peer_last_read_seq ?? this.state.peerLastReadSeq,
        loaded: true,
        error: null,
      });
    } catch (error) {
      this.set({ loaded: true, error: errorMessage(error) || errorCode(error) || "load_failed" });
    }
  }

  /** 定位到某条（搜索结果 / 深链）：取它前后各一屏，窗口被替换。 */
  async loadAround(seq: number): Promise<void> {
    try {
      const page = await this.fetchPage({ around_seq: seq, limit: PAGE_SIZE });
      this.set({
        messages: mergeMessages([], this.ownMain(page.items)),
        hasMoreBefore: page.has_more_before,
        hasMoreAfter: page.has_more_after,
        peerLastReadSeq: page.peer_last_read_seq ?? this.state.peerLastReadSeq,
        loaded: true,
        error: null,
      });
    } catch (error) {
      this.set({ loaded: true, error: errorMessage(error) || errorCode(error) || "load_failed" });
    }
  }

  /** 往上滚：加载更早的。 */
  async loadBefore(): Promise<void> {
    const { messages, hasMoreBefore, loadingBefore } = this.state;
    if (this.threadRootId || !hasMoreBefore || loadingBefore || messages.length === 0) return;
    this.set({ loadingBefore: true });
    try {
      const page = await this.fetchPage({ before_seq: messages[0].seq, limit: PAGE_SIZE });
      this.set({
        messages: mergeMessages(this.state.messages, this.ownMain(page.items)),
        hasMoreBefore: page.has_more_before,
        loadingBefore: false,
      });
    } catch {
      this.set({ loadingBefore: false });
    }
  }

  /** 定位后往下滚：加载更晚的。 */
  async loadAfter(): Promise<void> {
    const { messages, hasMoreAfter, loadingAfter } = this.state;
    if (this.threadRootId || !hasMoreAfter || loadingAfter || messages.length === 0) return;
    this.set({ loadingAfter: true });
    try {
      const page = await this.fetchPage({
        after_seq: messages[messages.length - 1].seq,
        limit: PAGE_SIZE,
      });
      this.set({
        messages: mergeMessages(this.state.messages, this.ownMain(page.items)),
        hasMoreAfter: page.has_more_after,
        loadingAfter: false,
      });
    } catch {
      this.set({ loadingAfter: false });
    }
  }

  /**
   * 补缺口：断线重连 / 重新打开 / 发现 seq 跳号后，从已知最大 seq 往后补到底。
   * 窗口还停在历史里（hasMoreAfter）时不补——用户往下滚会自己加载。
   */
  async catchUp(afterSeq?: number): Promise<void> {
    if (!this.state.loaded) {
      await this.loadLatest();
      return;
    }
    if (this.threadRootId) {
      await this.loadLatest();
      return;
    }
    if (this.state.hasMoreAfter) return;
    let guard = 0;
    let after = afterSeq !== undefined ? afterSeq : this.state.lastSeq;
    while (guard < 20) {
      guard += 1;
      let page: MessagePage;
      try {
        page = await this.fetchPage({ after_seq: after, limit: PAGE_SIZE });
      } catch {
        return;
      }
      const fresh = this.ownMain(page.items);
      const pageMax = page.items.reduce((max, m) => Math.max(max, m.seq), 0);
      this.noteSeq(pageMax);
      this.set({
        messages: mergeMessages(this.state.messages, fresh),
        hasMoreAfter: false,
        peerLastReadSeq: page.peer_last_read_seq ?? this.state.peerLastReadSeq,
      });
      this.settlePendingFrom(fresh);
      if (!page.has_more_after || pageMax <= after) return;
      after = pageMax;
    }
  }

  async refreshPins(): Promise<void> {
    if (this.threadRootId) return;
    try {
      this.set({ pins: await this.api.listPins(this.conversationId) });
    } catch {
      /* 置顶条拿不到不影响聊天 */
    }
  }

  // ── 写入：乐观发送 ──────────────────────────────────────────────────────
  private buildOptimistic(input: SendMessageInput): ImMessage {
    return {
      id: `pending:${input.client_id}`,
      conversation_id: this.conversationId,
      seq: 0,
      sender_id: this.viewerId,
      sender_kind: "user",
      kind: input.kind,
      body: input.body ?? "",
      mentions: input.mentions ?? [],
      mention_all: Boolean(input.mention_all),
      mention_leo: Boolean(input.mention_leo),
      quote: null,
      thread_root_id: input.thread_root_id ?? null,
      thread: null,
      attachments: input.attachments ?? [],
      card: (input.card as ImCard | null | undefined) ?? null,
      transcript: null,
      reactions: [],
      pinned: false,
      edited_at: null,
      recalled_at: null,
      recalled_by: null,
      hidden_reason: null,
      leo: null,
      mention_reads: null,
      client_id: input.client_id,
      created_at: this.now(),
    };
  }

  /** 发消息：先显示「发送中」，成功后换成服务端那条；失败留着可重试。 */
  async send(input: Omit<SendMessageInput, "client_id"> & { client_id?: string }): Promise<ImMessage | null> {
    const full: SendMessageInput = {
      ...input,
      client_id: input.client_id ?? this.newId(),
      thread_root_id: input.thread_root_id ?? this.threadRootId ?? null,
    };
    const existing = this.state.pending.find((p) => p.clientId === full.client_id);
    const entry: PendingMessage = {
      clientId: full.client_id,
      status: "sending",
      error: null,
      message: this.buildOptimistic(full),
      input: full,
    };
    this.set({
      pending: existing
        ? this.state.pending.map((p) => (p.clientId === full.client_id ? entry : p))
        : [...this.state.pending, entry],
    });
    return this.dispatchPending(full.client_id);
  }

  private async dispatchPending(clientId: string): Promise<ImMessage | null> {
    const entry = this.state.pending.find((p) => p.clientId === clientId);
    if (!entry) return null;
    try {
      const sent = await this.api.sendMessage(this.conversationId, entry.input);
      this.ingestMessage(sent);
      return sent;
    } catch (error) {
      this.set({
        pending: this.state.pending.map((p) =>
          p.clientId === clientId
            ? { ...p, status: "failed", error: errorMessage(error) || errorCode(error) || "send_failed" }
            : p,
        ),
      });
      return null;
    }
  }

  /** 失败后重试：同一个 client_id，服务端幂等，不会发出两条。 */
  async retry(clientId: string): Promise<ImMessage | null> {
    const entry = this.state.pending.find((p) => p.clientId === clientId);
    if (!entry || entry.status === "sending") return null;
    this.set({
      pending: this.state.pending.map((p) =>
        p.clientId === clientId ? { ...p, status: "sending", error: null } : p,
      ),
    });
    return this.dispatchPending(clientId);
  }

  discardPending(clientId: string): void {
    this.set({ pending: this.state.pending.filter((p) => p.clientId !== clientId) });
  }

  private settlePendingFrom(messages: ImMessage[]): void {
    if (this.state.pending.length === 0) return;
    const sent = new Set(
      messages
        .filter((m) => m.sender_id === this.viewerId && m.client_id)
        .map((m) => m.client_id as string),
    );
    if (sent.size === 0) return;
    const rest = this.state.pending.filter((p) => !sent.has(p.clientId));
    if (rest.length !== this.state.pending.length) this.set({ pending: rest });
  }

  // ── 写入：其它操作 ─────────────────────────────────────────────────────
  async edit(messageId: string, body: string): Promise<ImMessage | null> {
    try {
      const updated = await this.api.editMessage(messageId, body);
      this.ingestMessage(updated);
      return updated;
    } catch {
      return null;
    }
  }

  async recall(messageId: string): Promise<ImMessage | null> {
    try {
      const updated = await this.api.recallMessage(messageId);
      this.ingestMessage(updated);
      return updated;
    } catch {
      return null;
    }
  }

  /** 点表情：已回应过就取消，否则加上；先本地改，失败回滚。 */
  async toggleReaction(messageId: string, emoji: string): Promise<void> {
    const message = this.find(messageId);
    if (!message) return;
    const before = message.reactions;
    const mine = before.some((r) => r.emoji === emoji && r.mine);
    const optimistic = applyReactionLocal(before, emoji, this.viewerId, !mine);
    this.patchMessage(messageId, { reactions: optimistic });
    try {
      if (mine) await this.api.removeReaction(messageId, emoji);
      else await this.api.addReaction(messageId, emoji);
    } catch {
      this.patchMessage(messageId, { reactions: before });
    }
  }

  async togglePin(messageId: string, pinned: boolean): Promise<void> {
    try {
      if (pinned) await this.api.unpin(this.conversationId, messageId);
      else await this.api.pin(this.conversationId, messageId);
      this.patchMessage(messageId, { pinned: !pinned });
      await this.refreshPins();
    } catch {
      /* 失败不改状态 */
    }
  }

  find(messageId: string): ImMessage | null {
    return (
      this.state.messages.find((m) => m.id === messageId) ??
      (this.state.root?.id === messageId ? this.state.root : null)
    );
  }

  private patchMessage(messageId: string, patch: Partial<ImMessage>): void {
    const messages = this.state.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m));
    const root = this.state.root?.id === messageId ? { ...this.state.root, ...patch } : this.state.root;
    this.set({ messages, root });
  }

  // ── 事件增量 ───────────────────────────────────────────────────────────
  /** 收下一条服务端的消息（发送响应、事件、补缺口共用）：去重、替换乐观条、必要时补缺口。 */
  ingestMessage(message: ImMessage, source: "response" | "event" = "response"): void {
    if (message.conversation_id !== this.conversationId) return;
    const belongsHere = this.threadRootId
      ? message.thread_root_id === this.threadRootId || message.id === this.threadRootId
      : !message.thread_root_id;

    // 乐观条：同 client_id、且是我发的 → 去掉
    const clientId = message.client_id;
    const pending =
      clientId && message.sender_id === this.viewerId
        ? this.state.pending.filter((p) => p.clientId !== clientId)
        : this.state.pending;
    const pendingChanged = pending.length !== this.state.pending.length;

    if (!belongsHere) {
      if (source === "event") this.noteSeq(message.seq);
      // 回帖：主线不显示，但根消息的「N 条回复」要刷新。
      if (!this.threadRootId && message.thread_root_id) this.refreshRoot(message.thread_root_id);
      if (pendingChanged) this.set({ pending });
      return;
    }

    if (this.threadRootId && message.id === this.threadRootId) {
      this.set({ root: message, ...(pendingChanged ? { pending } : {}) });
      return;
    }

    const known = this.state.messages.some((m) => m.id === message.id);
    const seen = this.seenSeq;
    // 事件来了但窗口停在历史里：不插进去，免得窗口里出现跳号。
    if (source === "event" && !known && this.state.hasMoreAfter) {
      if (pendingChanged) this.set({ pending });
      return;
    }
    const gap =
      source === "event" &&
      !known &&
      !this.threadRootId &&
      this.state.loaded &&
      seen > 0 &&
      message.seq > seen + 1;

    const messages = mergeMessages(this.state.messages, [message]);
    const streaming = { ...this.state.streaming };
    if (message.leo && message.leo.status !== "streaming") delete streaming[message.id];
    this.set({
      messages,
      streaming,
      ...(pendingChanged ? { pending } : {}),
    });
    if (gap) void this.catchUp(seen);
  }

  private refreshRoot(rootId: string): void {
    if (this.refreshingRoots.has(rootId)) return;
    if (!this.state.messages.some((m) => m.id === rootId)) return;
    this.refreshingRoots.add(rootId);
    void this.api
      .getThread(rootId)
      .then((thread) => {
        if (thread?.root) this.patchMessage(rootId, thread.root);
      })
      .catch(() => undefined)
      .finally(() => {
        this.refreshingRoots.delete(rootId);
      });
  }

  /** 实时事件入口（ConversationView 用 useImEvent 把相关事件转进来）。 */
  applyEvent(event: ImEvent): void {
    if (!("conversation_id" in event) || event.conversation_id !== this.conversationId) return;
    switch (event.type) {
      case "message.created":
        this.ingestMessage(event.message, "event");
        break;
      case "message.updated":
        this.ingestMessage(event.message, "event");
        break;
      case "leo.delta":
        this.set({
          streaming: {
            ...this.state.streaming,
            [event.message_id]: (this.state.streaming[event.message_id] ?? "") + event.text,
          },
        });
        break;
      case "leo.notice":
        this.set({ notices: { ...this.state.notices, [event.trigger_message_id]: event.code } });
        break;
      case "reaction.changed":
        this.patchMessage(event.message_id, { reactions: withMine(event.reactions, this.viewerId) });
        break;
      case "pin.changed":
        this.patchMessage(event.message_id, { pinned: event.pinned });
        void this.refreshPins();
        break;
      case "read.updated":
        this.applyRead(event.user_id, event.last_read_seq);
        break;
      default:
        break;
    }
  }

  private applyRead(userId: string, lastReadSeq: number): void {
    if (userId === this.viewerId) return;
    let changed = false;
    const messages = this.state.messages.map((m) => {
      if (m.sender_id !== this.viewerId || !m.mention_reads) return m;
      if (m.seq > lastReadSeq || !(userId in m.mention_reads) || m.mention_reads[userId]) return m;
      changed = true;
      return { ...m, mention_reads: { ...m.mention_reads, [userId]: true } };
    });
    this.set({
      peerLastReadSeq: Math.max(this.state.peerLastReadSeq, lastReadSeq),
      ...(changed ? { messages } : {}),
    });
  }

  dismissNotice(triggerMessageId: string): void {
    if (!(triggerMessageId in this.state.notices)) return;
    const notices = { ...this.state.notices };
    delete notices[triggerMessageId];
    this.set({ notices });
  }
}

/** 本地先把表情改了（乐观），服务端事件回来会整体覆盖。 */
export function applyReactionLocal(
  reactions: ImReactionSummary[],
  emoji: string,
  userId: string,
  add: boolean,
): ImReactionSummary[] {
  const next = reactions.map((r) => ({ ...r, user_ids: [...r.user_ids] }));
  const index = next.findIndex((r) => r.emoji === emoji);
  if (add) {
    if (index === -1) return [...next, { emoji, count: 1, mine: true, user_ids: [userId] }];
    const item = next[index];
    if (item.mine) return next;
    item.count += 1;
    item.mine = true;
    item.user_ids.push(userId);
    return next;
  }
  if (index === -1) return next;
  const item = next[index];
  item.count = Math.max(0, item.count - 1);
  item.mine = false;
  item.user_ids = item.user_ids.filter((id) => id !== userId);
  return item.count === 0 ? next.filter((_, i) => i !== index) : next;
}

// ── 进程内缓存 ─────────────────────────────────────────────────────────────
const cache = new Map<string, ConversationStore>();

/** 取（或建）某会话的 store；最近用过的留 12 个。线程 store 不进缓存（短命）。 */
export function getConversationStore(options: ConversationStoreOptions): ConversationStore {
  if (options.threadRootId) return new ConversationStore(options);
  const key = `${options.viewerId}:${options.conversationId}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const store = new ConversationStore(options);
  cache.set(key, store);
  while (cache.size > MAX_CACHED_STORES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return store;
}

export function clearConversationStores(): void {
  cache.clear();
}

/** 消息是不是已经「不可编辑 / 不可操作」的占位。 */
export function isPlaceholder(message: ImMessage): boolean {
  return Boolean(message.recalled_at) || message.hidden_reason === "moderation";
}

export function attachmentSummary(attachments: ImAttachment[]): string {
  return attachments.map((a) => a.name).join(", ");
}

// ── 消息流的行：日期分隔、未读分隔线、头像合并 ───────────────────────────────
/** 同一个人这么久内的连续消息合并头像。 */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export type MessageRow =
  | { type: "day"; key: string; day: string }
  | { type: "unread"; key: string }
  | { type: "message"; key: string; message: ImMessage; grouped: boolean; pending: PendingMessage | null };

/** 本地日历日（用户所在时区）。 */
export function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function groupable(message: ImMessage): boolean {
  return message.sender_kind === "user" && message.kind !== "system" && !message.recalled_at && message.hidden_reason === null;
}

/**
 * 把消息变成行：
 * - 跨天插日期分隔；
 * - `unreadAfterSeq` 之后的第一条别人的消息前插「未读」分隔线（0 / null = 不画）；
 * - 同一人 5 分钟内、同一天、中间没有分隔线的连续消息合并头像。
 */
export function buildRows(
  messages: ImMessage[],
  pending: PendingMessage[],
  options: { unreadAfterSeq?: number | null; viewerId?: string | null } = {},
): MessageRow[] {
  const rows: MessageRow[] = [];
  let previous: ImMessage | null = null;
  let unreadDrawn = false;
  const entries: Array<{ message: ImMessage; pending: PendingMessage | null }> = [
    ...messages.map((message) => ({ message, pending: null })),
    ...pending.map((entry) => ({ message: entry.message, pending: entry })),
  ];
  for (const entry of entries) {
    const { message } = entry;
    let separated = false;
    const day = dayKey(message.created_at);
    if (day && (!previous || dayKey(previous.created_at) !== day)) {
      rows.push({ type: "day", key: `day:${day}`, day });
      separated = true;
    }
    if (
      !unreadDrawn &&
      options.unreadAfterSeq != null &&
      !entry.pending &&
      message.seq > options.unreadAfterSeq &&
      message.sender_id !== options.viewerId
    ) {
      rows.push({ type: "unread", key: "unread" });
      unreadDrawn = true;
      separated = true;
    }
    const grouped =
      !separated &&
      previous !== null &&
      groupable(previous) &&
      groupable(message) &&
      previous.sender_id === message.sender_id &&
      Date.parse(message.created_at) - Date.parse(previous.created_at) <= GROUP_WINDOW_MS &&
      Date.parse(message.created_at) >= Date.parse(previous.created_at);
    rows.push({
      type: "message",
      key: entry.pending ? `pending:${entry.pending.clientId}` : message.id,
      message,
      grouped,
      pending: entry.pending,
    });
    previous = message;
  }
  return rows;
}

/**
 * 未读分隔线的位置：详情里有 `last_read_seq` 就直接用；没有就按 `unread_count`
 * 从末尾往前数「别人发的」那么多条，返回它前一条的 seq。
 */
export function unreadBoundary(
  messages: ImMessage[],
  options: { lastReadSeq?: number | null; unreadCount?: number; viewerId?: string | null },
): number | null {
  if (typeof options.lastReadSeq === "number" && options.lastReadSeq >= 0) {
    return messages.some((m) => m.seq > options.lastReadSeq!) ? options.lastReadSeq : null;
  }
  const count = options.unreadCount ?? 0;
  if (count <= 0) return null;
  const others = messages.filter((m) => m.sender_id !== options.viewerId && m.sender_kind !== "system");
  if (others.length === 0) return null;
  const first = others[Math.max(0, others.length - count)];
  return first.seq - 1;
}
