// 消息的客户端状态：连接状态、未读、在线状态缓存、收件箱列表、事件分发（work-chat 契约 §6.1 / §8.3）。
// 纯 TS：连接、取数、桌面通知都经 StoreDeps 注入，tests/im-inbox.test.mjs 喂假事件跑真实归约。
import type {
  ImConversationSummary,
  ImEvent,
  ImLastMessage,
  ImMessage,
  ImPage,
  ImPresence,
  ImUnread,
} from "../../../lib/im/types";
import type { ImSocket, SocketOutput, SocketState } from "./socket";

export type ImConnectionState = SocketState;

/** 角标数字：0 不显示，超过 99 显示 99+。 */
export function formatBadge(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  return count > 99 ? "99+" : String(Math.floor(count));
}

// ---------------------------------------------------------------------------
// 摘要文案（中文原文即词条 key，渲染时过 tt；词条在 im-shell-copy.ts）
// ---------------------------------------------------------------------------
export const PREVIEW_RECALLED = "撤回了一条消息";
export const PREVIEW_HIDDEN = "该消息因违反规则已隐藏";
export const PREVIEW_IMAGE = "[图片]";
export const PREVIEW_VIDEO = "[视频]";
export const PREVIEW_AUDIO = "[音频]";
export const PREVIEW_VOICE = "[语音]";
export const PREVIEW_FILE = "[文件]";
export const PREVIEW_ARTIFACT = "[作品]";
export const PREVIEW_REPLAY = "[工作回放]";
export const PREVIEW_CARD = "[卡片]";

/** 一条消息在收件箱 / 通知里的一行摘要。撤回、隐藏、卡片、附件各有固定文案。 */
export function messagePreview(message: ImMessage): string {
  if (message.recalled_at) return PREVIEW_RECALLED;
  if (message.hidden_reason === "moderation") return PREVIEW_HIDDEN;
  const body = (message.body || "").replace(/\s+/g, " ").trim();
  switch (message.kind) {
    case "image":
      return body || PREVIEW_IMAGE;
    case "video":
      return body || PREVIEW_VIDEO;
    case "audio":
      return body || PREVIEW_AUDIO;
    case "voice":
      return message.transcript?.status === "done" && message.transcript.text
        ? message.transcript.text.slice(0, 80)
        : PREVIEW_VOICE;
    case "file":
      return body || message.attachments?.[0]?.name || PREVIEW_FILE;
    case "artifact":
      return message.card?.title ? `${PREVIEW_ARTIFACT} ${message.card.title}` : PREVIEW_ARTIFACT;
    case "replay":
      return message.card?.title ? `${PREVIEW_REPLAY} ${message.card.title}` : PREVIEW_REPLAY;
    default:
      if (message.card) return message.card.title ? `${PREVIEW_CARD} ${message.card.title}` : PREVIEW_CARD;
      return body.slice(0, 120);
  }
}

export function lastMessageOf(message: ImMessage): ImLastMessage {
  return {
    id: message.id,
    seq: message.seq,
    sender_id: message.sender_id,
    sender_kind: message.sender_kind,
    kind: message.kind,
    preview: messagePreview(message),
    created_at: message.created_at,
  };
}

// ---------------------------------------------------------------------------
// 收件箱归约
// ---------------------------------------------------------------------------
export interface InboxState {
  filter: string;
  items: ImConversationSummary[];
  nextCursor: string | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  /** 收到不认识的会话的消息等，需要整页刷新。 */
  needsRefresh: boolean;
}

export interface InboxCtx {
  selfId: string | null;
  foregroundConversationId: string | null;
}

export function emptyInbox(filter = "all"): InboxState {
  return { filter, items: [], nextCursor: null, loaded: false, loading: false, error: null, needsRefresh: false };
}

export function sortInbox(items: ImConversationSummary[]): ImConversationSummary[] {
  return items
    .slice()
    .sort((a, b) =>
      a.last_activity_at === b.last_activity_at
        ? a.id < b.id
          ? 1
          : -1
        : a.last_activity_at < b.last_activity_at
          ? 1
          : -1,
    );
}

export function isMentioned(message: ImMessage, selfId: string | null): boolean {
  if (message.mention_all) return true;
  return Boolean(selfId && Array.isArray(message.mentions) && message.mentions.includes(selfId));
}

export function isMine(message: ImMessage, selfId: string | null): boolean {
  return Boolean(selfId) && message.sender_kind === "user" && message.sender_id === selfId;
}

export function applyInboxEvent(state: InboxState, event: ImEvent, ctx: InboxCtx): InboxState {
  switch (event.type) {
    case "message.created": {
      const message = event.message;
      const index = state.items.findIndex((item) => item.id === event.conversation_id);
      if (index < 0) return state.needsRefresh ? state : { ...state, needsRefresh: true };
      const item = state.items[index];
      if (item.last_message && message.seq <= item.last_message.seq) return state; // 重放/已补过
      const mine = isMine(message, ctx.selfId);
      const foreground = ctx.foregroundConversationId === item.id;
      const countIt = !mine && !foreground;
      const next: ImConversationSummary = {
        ...item,
        last_message: lastMessageOf(message),
        last_activity_at: message.created_at,
        unread_count: item.unread_count + (countIt ? 1 : 0),
        mention_count: item.mention_count + (countIt && isMentioned(message, ctx.selfId) ? 1 : 0),
      };
      const items = state.items.slice();
      items[index] = next;
      return { ...state, items: sortInbox(items) };
    }
    case "message.updated": {
      const index = state.items.findIndex((item) => item.id === event.conversation_id);
      if (index < 0) return state;
      const item = state.items[index];
      if (!item.last_message || item.last_message.id !== event.message.id) return state;
      const items = state.items.slice();
      items[index] = { ...item, last_message: lastMessageOf(event.message) };
      return { ...state, items };
    }
    case "conversation.updated": {
      const incoming = event.conversation;
      const exists = state.items.some((item) => item.id === incoming.id);
      const items = exists
        ? state.items.map((item) => (item.id === incoming.id ? incoming : item))
        : [incoming, ...state.items];
      return { ...state, items: sortInbox(items) };
    }
    case "conversation.removed": {
      if (!state.items.some((item) => item.id === event.conversation_id)) return state;
      return { ...state, items: state.items.filter((item) => item.id !== event.conversation_id) };
    }
    case "read.updated": {
      if (!ctx.selfId || event.user_id !== ctx.selfId) return state;
      const index = state.items.findIndex((item) => item.id === event.conversation_id);
      if (index < 0) return state;
      const item = state.items[index];
      if (item.unread_count === 0 && item.mention_count === 0) return state;
      const items = state.items.slice();
      items[index] = { ...item, unread_count: 0, mention_count: 0 };
      return { ...state, items };
    }
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// 未读归约
// ---------------------------------------------------------------------------
export interface UnreadCtx extends InboxCtx {
  /** 已知会话（收件箱里的）：用来判断静音。不认识的会话按不静音算。 */
  conversation(id: string): ImConversationSummary | undefined;
}

export function emptyUnread(): ImUnread {
  return { total: 0, mentions: 0, requests: 0, by_conversation: {} };
}

function conversationIsQuiet(conv: ImConversationSummary | undefined): boolean {
  if (!conv) return false;
  return conv.muted || conv.notify_level === "none";
}

export function applyUnreadEvent(unread: ImUnread | null, event: ImEvent, ctx: UnreadCtx): ImUnread | null {
  if (event.type === "unread.changed") return event.unread;
  if (!unread) return unread;
  switch (event.type) {
    case "message.created": {
      const message = event.message;
      if (isMine(message, ctx.selfId)) return unread;
      if (ctx.foregroundConversationId === event.conversation_id) return unread;
      const conv = ctx.conversation(event.conversation_id);
      if (conv?.last_message && message.seq <= conv.last_message.seq) return unread; // 已经算过
      const mentioned = isMentioned(message, ctx.selfId);
      const quiet = conversationIsQuiet(conv) && !(mentioned && conv?.notify_level !== "none");
      const prev = unread.by_conversation[event.conversation_id] ?? { unread: 0, mentions: 0 };
      return {
        ...unread,
        total: unread.total + (quiet ? 0 : 1),
        mentions: unread.mentions + (mentioned ? 1 : 0),
        by_conversation: {
          ...unread.by_conversation,
          [event.conversation_id]: {
            unread: prev.unread + 1,
            mentions: prev.mentions + (mentioned ? 1 : 0),
          },
        },
      };
    }
    case "read.updated": {
      if (!ctx.selfId || event.user_id !== ctx.selfId) return unread;
      const prev = unread.by_conversation[event.conversation_id];
      if (!prev || (prev.unread === 0 && prev.mentions === 0)) return unread;
      const quiet = conversationIsQuiet(ctx.conversation(event.conversation_id));
      return {
        ...unread,
        total: Math.max(0, unread.total - (quiet ? 0 : prev.unread)),
        mentions: Math.max(0, unread.mentions - prev.mentions),
        by_conversation: { ...unread.by_conversation, [event.conversation_id]: { unread: 0, mentions: 0 } },
      };
    }
    case "conversation.removed": {
      const prev = unread.by_conversation[event.conversation_id];
      if (!prev) return unread;
      const quiet = conversationIsQuiet(ctx.conversation(event.conversation_id));
      const rest = { ...unread.by_conversation };
      delete rest[event.conversation_id];
      return {
        ...unread,
        total: Math.max(0, unread.total - (quiet ? 0 : prev.unread)),
        mentions: Math.max(0, unread.mentions - prev.mentions),
        by_conversation: rest,
      };
    }
    case "contact.request":
    case "group.invite":
      return { ...unread, requests: unread.requests + 1 };
    default:
      return unread;
  }
}

// ---------------------------------------------------------------------------
// 桌面通知的取舍（尊重会话 notify_level 与免打扰）
// ---------------------------------------------------------------------------
export function shouldNotifyDesktop(
  message: ImMessage,
  conv: ImConversationSummary | undefined,
  ctx: InboxCtx & { hidden: boolean },
): boolean {
  if (!ctx.hidden) return false;
  if (isMine(message, ctx.selfId)) return false;
  if (message.sender_kind === "system") return false;
  const mentioned = isMentioned(message, ctx.selfId);
  if (!conv) return true;
  if (conv.notify_level === "none") return false;
  if (conv.notify_level === "mentions" && !mentioned) return false;
  if (conv.muted && !mentioned) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 状态仓
// ---------------------------------------------------------------------------
export interface StoreDeps {
  socket: ImSocket;
  fetchUnread(): Promise<ImUnread>;
  fetchConversations(filter: string, cursor?: string | null): Promise<ImPage<ImConversationSummary>>;
  /** W03 的桌面通知；这里已经按会话规则筛过。 */
  notifyDesktop(input: { title: string; body: string; conversationId: string; icon?: string | null }): void;
  isHidden(): boolean;
  /** 没有 `ready` 帧之前，用它拿自己的 id。 */
  selfId(): Promise<string | null>;
  /** 桌面通知里「某人发来消息」之类的兜底标题。 */
  fallbackTitle(): string;
}

type EventHandler = (event: ImEvent) => void;

export interface ImStore {
  start(): void;
  stop(): void;
  subscribe(listener: () => void): () => void;
  connection(): ImConnectionState;
  unread(): ImUnread | null;
  presenceMap(): Record<string, ImPresence>;
  inbox(): InboxState;
  selfId(): string | null;
  onEvent<T extends ImEvent["type"]>(type: T, handler: (event: Extract<ImEvent, { type: T }>) => void): () => void;
  onResync(handler: () => void): () => void;
  setForegroundConversation(id: string | null): void;
  foregroundConversation(): string | null;
  /** 把已知的在线状态灌进缓存（联系人、成员列表的接口会带 presence）。 */
  seedPresence(map: Record<string, ImPresence>): void;
  loadInbox(filter?: string): Promise<void>;
  loadMoreInbox(): Promise<void>;
  refreshUnread(): Promise<void>;
  /** 本地立即清零某会话的未读（点开会话时；服务端以 read.updated 为准）。 */
  clearConversationUnread(conversationId: string): void;
}

export function createImStore(deps: StoreDeps): ImStore {
  const listeners = new Set<() => void>();
  const handlers = new Map<string, Set<EventHandler>>();
  const resyncHandlers = new Set<() => void>();
  let connection: ImConnectionState = "closed";
  let unread: ImUnread | null = null;
  let presence: Record<string, ImPresence> = {};
  let inbox: InboxState = emptyInbox();
  let self: string | null = null;
  let foreground: string | null = null;
  let unsubscribeSocket: (() => void) | null = null;
  let loadSeq = 0;

  function emit(): void {
    for (const listener of Array.from(listeners)) listener();
  }

  function ctx(): InboxCtx {
    return { selfId: self, foregroundConversationId: foreground };
  }

  function dispatch(event: ImEvent): void {
    const set = handlers.get(event.type);
    if (!set) return;
    for (const handler of Array.from(set)) {
      try {
        handler(event);
      } catch {
        /* 订阅者的错不影响其他订阅者 */
      }
    }
  }

  function conversationLookup(id: string): ImConversationSummary | undefined {
    return inbox.items.find((item) => item.id === id);
  }

  function maybeNotify(event: Extract<ImEvent, { type: "message.created" }>): void {
    const conv = conversationLookup(event.conversation_id);
    const c = ctx();
    if (!shouldNotifyDesktop(event.message, conv, { ...c, hidden: deps.isHidden() })) return;
    try {
      deps.notifyDesktop({
        title: conv?.title || conv?.peer?.display_name || deps.fallbackTitle(),
        body: messagePreview(event.message),
        conversationId: event.conversation_id,
        icon: conv?.avatar_url ?? conv?.peer?.avatar_url ?? null,
      });
    } catch {
      /* 通知失败不影响消息 */
    }
  }

  function applyEvent(event: ImEvent): void {
    // 顺序要紧：未读与桌面通知先看「事件到来之前」的收件箱（要拿旧的 last_message.seq 去重），再更新收件箱。
    const uctx: UnreadCtx = { ...ctx(), conversation: conversationLookup };
    unread = applyUnreadEvent(unread, event, uctx);
    if (event.type === "message.created") maybeNotify(event);
    if (event.type === "presence.changed") {
      if (presence[event.user_id] !== event.presence) presence = { ...presence, [event.user_id]: event.presence };
    }
    const nextInbox = applyInboxEvent(inbox, event, ctx());
    inbox = nextInbox;
    emit();
    dispatch(event);
    if (inbox.needsRefresh && !inbox.loading) void refreshInbox();
  }

  async function refreshUnread(): Promise<void> {
    try {
      const next = await deps.fetchUnread();
      unread = next;
      emit();
    } catch {
      /* 后端没好或断网：保持旧值 */
    }
  }

  async function refreshInbox(): Promise<void> {
    if (!inbox.loaded && !inbox.needsRefresh) return;
    await loadInbox(inbox.filter);
  }

  async function loadInbox(filter: string = inbox.filter): Promise<void> {
    const mySeq = ++loadSeq;
    inbox = { ...(filter === inbox.filter ? inbox : emptyInbox(filter)), filter, loading: true, error: null };
    emit();
    try {
      const page = await deps.fetchConversations(filter, null);
      if (mySeq !== loadSeq) return;
      inbox = {
        filter,
        items: sortInbox(page.items),
        nextCursor: page.next_cursor,
        loaded: true,
        loading: false,
        error: null,
        needsRefresh: false,
      };
    } catch (error) {
      if (mySeq !== loadSeq) return;
      inbox = {
        ...inbox,
        loading: false,
        loaded: inbox.loaded,
        needsRefresh: false,
        error: error instanceof Error && error.message ? error.message : "load_failed",
      };
    }
    emit();
  }

  async function loadMoreInbox(): Promise<void> {
    if (inbox.loading || !inbox.nextCursor) return;
    const mySeq = ++loadSeq;
    const filter = inbox.filter;
    const cursor = inbox.nextCursor;
    inbox = { ...inbox, loading: true };
    emit();
    try {
      const page = await deps.fetchConversations(filter, cursor);
      if (mySeq !== loadSeq) return;
      const known = new Set(inbox.items.map((item) => item.id));
      inbox = {
        ...inbox,
        items: sortInbox([...inbox.items, ...page.items.filter((item) => !known.has(item.id))]),
        nextCursor: page.next_cursor,
        loading: false,
        error: null,
      };
    } catch (error) {
      if (mySeq !== loadSeq) return;
      inbox = { ...inbox, loading: false, error: error instanceof Error && error.message ? error.message : "load_failed" };
    }
    emit();
  }

  function onSocket(out: SocketOutput): void {
    switch (out.kind) {
      case "state":
        connection = out.state;
        emit();
        return;
      case "ready":
        if (out.userId) self = out.userId;
        void refreshUnread();
        return;
      case "resync":
        // 重连：未读与收件箱整页补一次；订阅者（当前会话）自己用 after_seq 补。
        void refreshUnread();
        if (inbox.loaded) void loadInbox(inbox.filter);
        for (const handler of Array.from(resyncHandlers)) {
          try {
            handler();
          } catch {
            /* ignore */
          }
        }
        return;
      case "event":
        applyEvent(out.event);
        return;
    }
  }

  return {
    start() {
      if (unsubscribeSocket) return;
      unsubscribeSocket = deps.socket.subscribe(onSocket);
      void deps.selfId().then((id) => {
        if (id && !self) self = id;
      });
      deps.socket.start();
    },
    stop() {
      if (unsubscribeSocket) unsubscribeSocket();
      unsubscribeSocket = null;
      deps.socket.stop();
      connection = "closed";
      unread = null;
      presence = {};
      inbox = emptyInbox();
      self = null;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    connection: () => connection,
    unread: () => unread,
    presenceMap: () => presence,
    inbox: () => inbox,
    selfId: () => self,
    onEvent(type, handler) {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler as EventHandler);
      return () => {
        set?.delete(handler as EventHandler);
      };
    },
    onResync(handler) {
      resyncHandlers.add(handler);
      return () => {
        resyncHandlers.delete(handler);
      };
    },
    setForegroundConversation(id) {
      if (foreground === id) return;
      foreground = id;
    },
    foregroundConversation: () => foreground,
    seedPresence(map) {
      let changed = false;
      const next = { ...presence };
      for (const [id, value] of Object.entries(map)) {
        if (next[id] !== value) {
          next[id] = value;
          changed = true;
        }
      }
      if (changed) {
        presence = next;
        emit();
      }
    },
    loadInbox,
    loadMoreInbox,
    refreshUnread,
    clearConversationUnread(conversationId) {
      const fake: ImEvent = {
        type: "read.updated",
        conversation_id: conversationId,
        user_id: self ?? "",
        last_read_seq: Number.MAX_SAFE_INTEGER,
      };
      if (!self) return;
      const uctx: UnreadCtx = { ...ctx(), conversation: conversationLookup };
      unread = applyUnreadEvent(unread, fake, uctx);
      inbox = applyInboxEvent(inbox, fake, ctx());
      emit();
    },
  };
}
