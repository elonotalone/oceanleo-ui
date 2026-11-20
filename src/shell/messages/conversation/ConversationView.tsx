"use client";

// 会话：消息流、输入框、置顶条、「正在输入」。导出名不变（契约 §8.2）；与任务页同一套顶栏与选择模式
// （session / sites wave 2026-11-21, contract §1 / §2.4）：搜索右边一个「转发 / 复制」键，点开即全选并弹出小菜单；
// 搜索打开时顶栏本身变成「<会话名> / 搜索消息」面包屑。旧的底部多选条与批量删除已去掉。
import { BackButton } from "../../../ui/BackButton";
import { Breadcrumb } from "../../../ui/Breadcrumb";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { ImApiError } from "../../../lib/im/client";
import { conversationDisplayTitle, visiblePersonName } from "../../../lib/im/people-api";
import { messagesApi } from "../../../lib/im/messages-api";
import type { ImConversationDetail, ImMessage, ImProfile } from "../../../lib/im/types";
import { RoutePageSkeleton } from "../../nav-source/route-boundary";
import { Composer } from "../composer/Composer";
import { openMessages } from "../host-state";
import { SearchView } from "../search/SearchView";
import { ProfileCard } from "../people/ProfileCard";
import { useImEvent, useImResync, usePresence } from "../realtime/hooks";
import { ReportDialog } from "../report/ReportDialog";
import { MessageList, useStoreEvents } from "./MessageList";
import { useMessageHandlers, type MessageCardOpeners } from "./MessageItem";
import { PinnedBar } from "./PinnedBar";
import { TypingLine, useTypingUsers } from "./TypingLine";
import { getConversationStore, unreadBoundary, type ConversationStore } from "./conversation-store";
import { historyEventTargetsConversation, subscribeHistoryCleared } from "./history-events";
import { WorkConversationHeader } from "./WorkConversationHeader";
import { workSendPolicy } from "./work-policy";
import { loadSelectionHistory } from "./selection-history";
import { ForwardCopyMenu, type ForwardCopyPage } from "./ForwardCopyMenu";
import { everythingSelected, orderedSelection, selectableIds, selectionText } from "./message-selection";
import {
  CallButton,
  CallChatProvider,
  callMetaOf,
  callMetaUserIds,
  removalReasonFor,
  useEndedCallIndex,
  type CallChatContextValue,
  type RemovalReason,
} from "../call/chat";

/** The task page's header icon button (`AgentChat.tsx` HEADER_ICON_BUTTON_CLASS): `p-1.5` + 16 px icon = 28 px. */
export const CONVERSATION_HEADER_ICON_CLASS =
  "inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 text-stone-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-100 hover:text-stone-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

/** Rows stay clickable while the Forward / Copy menu is open (it closes on any other outside click). */
const SELECT_ROW_SELECTOR = "[data-share-select-control], [data-message-select-row]";

function HeaderIcon({ name }: { name: "search" | "info" }) {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {name === "search" ? <path d="M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm9 2-4-4" /> : <path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm0-5v-5m0-3h.01" />}
    </svg>
  );
}

export interface ConversationViewProps {
  conversationId: string;
  active?: boolean;
  layout: "docked" | "full" | "mobile";
  onBack?: () => void;
  onOpenInfo?: () => void;
  highlightSeq?: number | null;
  /**
   * 这条会话当前这个人打不开（不存在，或不是成员）。LeoChat 会记住上次停在哪条会话，
   * 换了账号、被移出群之后那条记录就失效了：调用方据此退回列表，而不是停在一块空白上。
   */
  onUnavailable?: () => void;
  // ── Optional; absent = an ordinary LeoChat conversation. ──
  /** Replaces the title + member count in the header (a session shows its breadcrumb). */
  titleSlot?: ReactNode;
  /** Extra header buttons, before search. */
  headerActions?: ReactNode;
  /** One short line under a message, by message id. */
  messageMarks?: Readonly<Record<string, string>>;
  /** Enter select mode with exactly these ids (a new nonce each time). */
  selectionRequest?: { ids: readonly string[]; nonce: number } | null;
  /** Where this conversation is shown (contract §2.4): a LeoChat chat, or a project session. */
  surface?: "leochat" | "session";
  /** A task card was clicked (default: the card opens the task in the right panel). */
  onOpenTask?: (taskId: string, title: string) => void;
  /** A quote card was clicked (default: the card opens it read-only in the right panel). */
  onOpenQuote?: (message: ImMessage) => void;
  /** The composer's attach menu offers "Task" (sessions; composer unit UM). */
  attachTaskCard?: boolean;
}

// ── 我是谁（整个页面只问一次）─────────────────────────────────────────────
let viewerPromise: Promise<string | null> | null = null;
function loadViewerId(): Promise<string | null> {
  if (!viewerPromise) {
    viewerPromise = messagesApi
      .me()
      .then((result) => result.profile.user_id)
      .catch(() => {
        viewerPromise = null;
        return null;
      });
  }
  return viewerPromise;
}

export function useViewerId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void loadViewerId().then((value) => {
      if (alive) setId(value);
    });
    return () => {
      alive = false;
    };
  }, []);
  return id;
}

/** 会话详情（成员、角色、leo 开关）；成员变化 / 会话更新时重新取。 */
function useConversationDetail(conversationId: string, onUnavailable?: () => void): ImConversationDetail | null {
  const [detail, setDetail] = useState<ImConversationDetail | null>(null);
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;
  const load = useCallback(() => {
    void messagesApi
      .getConversation(conversationId)
      .then(setDetail)
      .catch((error: unknown) => {
        // 断网、超时不算：只有服务端明说「没有这条」或「你不在里面」才退回列表。
        if (error instanceof ImApiError && (error.status === 403 || error.status === 404)) unavailableRef.current?.();
      });
  }, [conversationId]);
  useEffect(() => {
    setDetail(null);
    load();
  }, [load]);
  useImEvent("member.changed", (event) => {
    if (event.conversation_id === conversationId) load();
  });
  useImEvent("message.created", (event) => {
    if (event.message.conversation_id === conversationId) load();
  });
  useImEvent("contact.changed", () => load());
  useImEvent("conversation.updated", (event) => {
    if (event.conversation.id === conversationId) load();
  });
  // 被移出 / 退出 / 解散（V02 D5）：以网关为准重取一次；网关说不再是成员就由 onUnavailable 关掉这个会话。
  useImEvent("conversation.removed", (event) => {
    if (removalReasonFor(event, conversationId)) load();
  });
  useImEvent("call_kicked", (event) => {
    if (removalReasonFor(event, conversationId)) load();
  });
  useImResync(load);
  return detail;
}

/** 名字 / 头像表：成员 + 消息里出现但已不是成员的人（按需批量取）。 */
function useProfileMap(
  conversation: ImConversationDetail | null,
  referencedIds: string[],
): Record<string, ImProfile | undefined> {
  const [extra, setExtra] = useState<Record<string, ImProfile>>({});
  const requested = useRef(new Set<string>());
  const base = useMemo(() => {
    const map: Record<string, ImProfile | undefined> = {};
    for (const member of conversation?.members ?? []) {
      map[member.user_id] = {
        ...member.profile,
        nickname: member.nickname || member.profile.nickname,
      };
    }
    return map;
  }, [conversation]);

  const key = referencedIds.join("|");
  useEffect(() => {
    const missing = referencedIds.filter((id) => id && !base[id] && !extra[id] && !requested.current.has(id));
    if (missing.length === 0) return;
    for (const id of missing) requested.current.add(id);
    void messagesApi
      .profiles(missing)
      .then((items) => setExtra((current) => ({ ...current, ...Object.fromEntries(items.map((p) => [p.user_id, p])) })))
      .catch(() => {
        for (const id of missing) requested.current.delete(id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, base]);

  return useMemo(() => ({ ...extra, ...base }), [extra, base]);
}

export function ConversationView(props: ConversationViewProps) {
  const { conversationId, active = true, layout, onBack, onOpenInfo, highlightSeq = null, onUnavailable } = props;
  const tt = useUI();
  const viewerId = useViewerId();
  const conversation = useConversationDetail(conversationId, onUnavailable);

  const store = useMemo(
    () => (viewerId ? getConversationStore({ api: messagesApi, conversationId, viewerId }) : null),
    [conversationId, viewerId],
  );
  if (!store) {
    return (
      <div className="h-full" data-conversation-loading="">
        <RoutePageSkeleton variant="list" label={tt("正在加载…")} />
      </div>
    );
  }
  return (
    <ConversationBody
      {...props}
      key={`${conversationId}:${viewerId}`}
      conversationId={conversationId}
      layout={layout}
      active={active}
      onBack={onBack}
      onOpenInfo={onOpenInfo}
      highlightSeq={highlightSeq}
      viewerId={viewerId}
      conversation={conversation}
      store={store}
    />
  );
}

function ConversationBody(props: ConversationViewProps & {
  viewerId: string | null;
  conversation: ImConversationDetail | null;
  store: ConversationStore;
}) {
  const { conversationId, active = true, layout, onBack, onOpenInfo, highlightSeq = null, viewerId, conversation, store } = props;
  const { titleSlot, headerActions, messageMarks, selectionRequest, surface = "leochat", onOpenTask, onOpenQuote, attachTaskCard } = props;
  const tt = useUI();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [quote, setQuote] = useState<ImMessage | null>(null);
  const [editing, setEditing] = useState<ImMessage | null>(null);
  // Select mode lives exactly as long as the Forward / Copy menu is open (task page Share behaviour).
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());
  const [menuPage, setMenuPage] = useState<ForwardCopyPage>("actions");
  const [selectingAll, setSelectingAll] = useState(false);
  const [wholeConversation, setWholeConversation] = useState(false);
  const selectionGeneration = useRef(0);
  useEffect(() => () => { selectionGeneration.current += 1; }, []);
  const [reporting, setReporting] = useState<ImMessage | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<{ id: string; nonce: number } | null>(null);
  const [unreadAfterSeq, setUnreadAfterSeq] = useState<number | null>(null);
  // 收到移出类事件（call_kicked / conversation.removed）后立即置灰，不等会话详情重取回来（V02 D5）。
  const [removed, setRemoved] = useState<RemovalReason | null>(null);
  const unreadFrozen = useRef(false);
  const readState = useRef({ last: 0, at: 0, pending: 0, timer: null as ReturnType<typeof setTimeout> | null });

  useStoreEvents(store);

  const reloadHistory = useCallback(() => {
    setQuote(null);
    setEditing(null);
    setScrollTarget(null);
    setUnreadAfterSeq(null);
    // Reload replaces the transcript; catchUp would retain locally cached history.
    void store.loadLatest();
    void store.refreshPins();
  }, [store]);

  useEffect(() => subscribeHistoryCleared(window, conversationId, reloadHistory), [conversationId, reloadHistory]);
  useImEvent("conversation.updated", (event) => {
    if (historyEventTargetsConversation(event, conversationId)) reloadHistory();
  });
  useImEvent("conversation.removed", (event) => {
    if (historyEventTargetsConversation(event, conversationId)) reloadHistory();
    const reason = removalReasonFor(event, conversationId);
    if (reason) setRemoved(reason);
  });
  useImEvent("call_kicked", (event) => {
    const reason = removalReasonFor(event, conversationId);
    if (reason) setRemoved((current) => current ?? reason);
  });

  // 打开：定位到高亮那条，或补到最新
  useEffect(() => {
    if (highlightSeq) {
      if (!store.getSnapshot().messages.some((m) => m.seq === highlightSeq)) void store.loadAround(highlightSeq);
    } else {
      void store.catchUp();
    }
    void store.refreshPins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, highlightSeq]);

  // 重连后补缺口
  useImResync(() => {
    if (!store.getSnapshot().hasMoreAfter) void store.catchUp();
    void store.refreshPins();
  });

  // 未读分隔线：只在打开时算一次
  useEffect(() => {
    if (unreadFrozen.current || !snapshot.loaded || !conversation) return;
    unreadFrozen.current = true;
    const lastRead = (conversation as ImConversationDetail & { last_read_seq?: number }).last_read_seq;
    setUnreadAfterSeq(
      unreadBoundary(snapshot.messages, {
        lastReadSeq: typeof lastRead === "number" ? lastRead : null,
        unreadCount: conversation.unread_count,
        viewerId,
      }),
    );
  }, [snapshot.loaded, snapshot.messages, conversation, viewerId]);

  // 看到底部就 POST /read（节流 1 秒）
  const reportRead = useCallback(
    (seq: number) => {
      if (!active || searchOpen) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const state = readState.current;
      if (seq <= state.last) return;
      state.pending = Math.max(state.pending, seq);
      if (state.timer) return;
      const wait = Math.max(0, 1000 - (Date.now() - state.at));
      state.timer = setTimeout(() => {
        state.timer = null;
        if (state.pending <= state.last) return;
        const target = state.pending;
        state.last = target;
        state.at = Date.now();
        void messagesApi.markRead(conversationId, target).catch(() => {
          state.last = 0;
        });
      }, wait);
    },
    [conversationId, active, searchOpen],
  );
  useEffect(() => {
    if (active && !searchOpen) return;
    const state = readState.current;
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
  }, [active, searchOpen]);
  useEffect(
    () => () => {
      const state = readState.current;
      if (state.timer) clearTimeout(state.timer);
    },
    [],
  );

  // 通话系统消息（calls-v2 §3.4）的 meta：卡片要用的名字 / 头像，以及「这通已结束」的时长与参与者。
  const callMetas = useMemo(() => snapshot.messages.map((m) => callMetaOf(m)), [snapshot.messages]);
  const endedMetaOf = useEndedCallIndex(callMetas);

  const referencedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const meta of callMetas) for (const id of callMetaUserIds(meta)) ids.add(id);
    for (const m of snapshot.messages) {
      if (m.sender_id) ids.add(m.sender_id);
      for (const id of m.mentions) ids.add(id);
      if (m.quote?.sender_id) ids.add(m.quote.sender_id);
      for (const id of m.thread?.participant_ids ?? []) ids.add(id);
      for (const id of Object.keys(m.mention_reads ?? {})) ids.add(id);
    }
    for (const p of snapshot.pins) if (p.sender_id) ids.add(p.sender_id);
    return Array.from(ids);
  }, [snapshot.messages, snapshot.pins, callMetas]);
  const profiles = useProfileMap(conversation, referencedIds);

  const isAdmin = conversation?.my_role === "owner" || conversation?.my_role === "admin";

  // ── Select mode + the Forward / Copy menu ──
  const enterSelection = useCallback((ids: Iterable<string>, page: ForwardCopyPage) => {
    selectionGeneration.current += 1;
    setSearchOpen(false);
    setSelectingAll(false);
    setWholeConversation(false);
    setSelectedMessageIds(new Set(ids));
    setMenuPage(page);
    setSelectionMode(true);
  }, []);
  const exitSelection = useCallback(() => {
    selectionGeneration.current += 1;
    setWholeConversation(false);
    setSelectionMode(false);
    setSelectingAll(false);
    setSelectedMessageIds(new Set());
    setMenuPage("actions");
  }, []);
  const visibleSelection = useMemo(() => wholeConversation ? new Set(selectableIds(snapshot.messages)) : selectedMessageIds,
    [wholeConversation, snapshot.messages, selectedMessageIds]);
  const selectedInOrder = useMemo(() => orderedSelection(snapshot.messages, visibleSelection), [snapshot.messages, visibleSelection]);
  const allSelected = wholeConversation || everythingSelected(snapshot.messages, selectedMessageIds, snapshot.hasMoreBefore || snapshot.hasMoreAfter);
  const toggleAll = useCallback(() => {
    selectionGeneration.current += 1;
    setWholeConversation(!allSelected);
    setSelectedMessageIds(new Set());
  }, [allSelected]);
  const resolveSelection = async (limit = Infinity): Promise<ImMessage[]> => {
    if (!wholeConversation) return selectedInOrder.slice(limit === Infinity ? 0 : -limit);
    const generation = selectionGeneration.current;
    setSelectingAll(true);
    try {
      const messages = await loadSelectionHistory((params) => messagesApi.listMessages(conversationId, params), limit);
      if (generation !== selectionGeneration.current) throw new Error("Selection changed");
      return messages;
    } finally {
      if (generation === selectionGeneration.current) setSelectingAll(false);
    }
  };
  const selectionRequestNonce = selectionRequest?.nonce;
  useEffect(() => {
    if (!selectionRequest) return;
    enterSelection(selectionRequest.ids, "actions");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionRequestNonce]);
  const nameOf = useCallback(
    (id: string | null) => {
      if (!id) return "leo";
      const profile = profiles[id];
      if (!profile) return tt("已退出的成员");
      return visiblePersonName(profile, {
        showNickname: conversation?.kind !== "dm" && conversation?.show_member_nicknames !== false,
      });
    },
    [profiles, tt, conversation?.kind, conversation?.show_member_nicknames],
  );

  const typing = useTypingUsers({ conversationId, threadRootId: null, viewerId });
  const peerId = conversation?.kind === "dm" ? (conversation.peer?.user_id ?? null) : null;
  const presence = usePresence(peerId ? [peerId] : []);

  const jumpToMessage = useCallback(
    (messageId: string, seq?: number) => {
      const known = store.find(messageId);
      if (known) {
        setScrollTarget({ id: messageId, nonce: Date.now() });
        return;
      }
      if (seq) {
        void store.loadAround(seq).then(() => setScrollTarget({ id: messageId, nonce: Date.now() }));
      }
    },
    [store],
  );

  const handlers = useMessageHandlers({
    store,
    conversationId,
    onQuote: setQuote,
    // The right-click menu: "Forward" = select mode with this message and the Forward page open; "Select multiple" =
    // select mode with this message.
    onForward: (message) => enterSelection([message.id], "forward"),
    onMultiSelect: (message) => enterSelection([message.id], "actions"),
    onEdit: (message) => {
      setQuote(null);
      setEditing(message);
    },
    onReport: setReporting,
    onOpenProfile: setProfileId,
    onJumpToMessage: (messageId) => jumpToMessage(messageId),
  });

  const lastOwn = useMemo(
    () => [...snapshot.messages].reverse().find((m) => m.sender_id === viewerId && m.kind === "text" && !m.recalled_at && m.seq > 0) ?? null,
    [snapshot.messages, viewerId],
  );

  const title = conversation ? conversationDisplayTitle(conversation) : "";
  const dissolved = Boolean(conversation?.dissolved) || removed === "dissolved";
  const notMember = (conversation !== null && conversation.my_role === null && conversation.kind !== "dm") || removed !== null;
  const policy = workSendPolicy(conversation, [...snapshot.messages, ...snapshot.pending.map((p) => ({ ...p.message, status: p.status }))], viewerId);
  const disabledReason = blocked ? tt("你们之间有拉黑关系，不能发送消息") : dissolved ? tt("这个群已解散，历史消息只读。") : notMember ? tt("你已不在这个会话里。") : undefined;
  const peerPresence = peerId ? presence[peerId] : undefined;
  const showCallButton = Boolean(conversation) && conversation?.kind !== "talent" && !dissolved && !notMember && !blocked;

  const callChat = useMemo<CallChatContextValue>(
    () => ({
      viewerId,
      conversationId,
      conversationKind: conversation?.kind ?? null,
      conversationTitle: title,
      profileOf: (userId) => (userId ? profiles[userId] : undefined),
      nameOf: (userId) => {
        const profile = userId ? profiles[userId] : undefined;
        if (!profile) return "";
        return visiblePersonName(profile, {
          showNickname: conversation?.kind !== "dm" && conversation?.show_member_nicknames !== false,
        });
      },
      endedMetaOf,
      canJoin: showCallButton && !policy?.awaiting_reply,
    }),
    [viewerId, conversationId, conversation?.kind, conversation?.show_member_nicknames, title, profiles, endedMetaOf, showCallButton, policy?.awaiting_reply],
  );

  // Keep the conversation in the same page-level loading state until both the
  // conversation header and its first message page have settled. Rendering the
  // header/composer first left a blank shell on every switch, followed by a
  // second spinner inside MessageList; the Projects-style skeleton is the one
  // loading surface for the whole conversation instead.
  if (!conversation || !snapshot.loaded) {
    return (
      <div className="relative h-full" data-conversation-loading="">
        <RoutePageSkeleton variant="list" label={tt("正在加载…")} />
        {snapshot.error ? <p role="status" data-load-retrying className="absolute inset-x-0 bottom-3 px-3 text-center text-[12px] text-stone-500">{tt("消息暂时无法加载，正在自动重试…")}</p> : null}
      </div>
    );
  }

  const cardOpeners: MessageCardOpeners | undefined = onOpenTask || onOpenQuote ? { onOpenTask, onOpenQuote } : undefined;
  const nameOfMessage = (message: ImMessage) => (message.sender_kind === "leo" ? "leo" : nameOf(message.sender_id));

  return (
    <div className="relative flex h-full min-h-0" data-conversation-view={conversationId} data-conversation-surface={surface}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-1 px-3 py-2" data-conversation-header="">
          {onBack ? (
            <BackButton onClick={onBack} label={tt("返回")} />
          ) : null}
          {searchOpen ? (
            // Search is part of this one header row: "<chat name> / Search messages"; the first crumb closes search.
            <div className="flex min-w-0 flex-1 items-center px-1" data-conversation-search-trail="">
              <Breadcrumb
                className="text-[13px]"
                items={[{ label: title, onClick: () => setSearchOpen(false) }, { label: tt("搜索消息") }]}
              />
            </div>
          ) : titleSlot !== undefined ? <div className="min-w-0 flex-1 px-1" data-conversation-title-slot="">{titleSlot}</div> : (
            <div className="flex min-w-0 flex-1 items-center gap-1.5 px-1">
              {peerPresence ? (
                <span
                  className={
                    "h-1.5 w-1.5 shrink-0 rounded-full " +
                    (peerPresence === "online" ? "bg-emerald-500" : peerPresence === "away" ? "bg-stone-400" : "bg-stone-300")
                  }
                  title={peerPresence === "online" ? tt("在线") : peerPresence === "away" ? tt("离开") : tt("离线")}
                />
              ) : null}
              <h2 className="min-w-0 truncate text-[13px] font-medium text-stone-700">{title}</h2>
              {conversation.has_external ? (
                <span className="shrink-0 text-[11px] text-stone-400">{tt("含外部成员")}</span>
              ) : null}
              {conversation.kind !== "dm" ? (
                <span className="shrink-0 text-[12px] text-stone-400" data-conversation-members="">{tt(conversation.member_count === 1 ? "1 位成员" : "{n} 位成员", { n: conversation.member_count })}</span>
              ) : null}
            </div>
          )}
          {headerActions}
          <button
            type="button"
            className={`${CONVERSATION_HEADER_ICON_CLASS} ${searchOpen ? "bg-stone-100 text-stone-800" : ""}`}
            data-conversation-search=""
            onClick={() => {
              if (!searchOpen) exitSelection();
              setSearchOpen((open) => !open);
            }}
            aria-label={tt("搜索消息")}
            title={tt("搜索消息")}
            aria-pressed={searchOpen}
          >
            <HeaderIcon name="search" />
          </button>
          <ForwardCopyMenu
            conversationId={conversationId}
            title={title}
            open={selectionMode}
            page={menuPage}
            onToggle={() => {
              if (selectionMode) exitSelection();
              else { enterSelection(selectableIds(snapshot.messages), "actions"); setWholeConversation(true); }
            }}
            onClose={exitSelection}
            onPage={setMenuPage}
            selectedCount={wholeConversation && (snapshot.hasMoreBefore || snapshot.hasMoreAfter) ? null : selectedInOrder.length}
            allSelected={allSelected}
            selectingAll={selectingAll}
            onToggleAll={toggleAll}
            copyText={async () => {
              const generation = selectionGeneration.current;
              const messages = await resolveSelection();
              const missing = [...new Set(messages.map((message) => message.sender_id).filter((id): id is string => Boolean(id && !profiles[id])))];
              const extra: typeof profiles = {};
              for (let i = 0; i < missing.length; i += 100) {
                for (const profile of await messagesApi.profiles(missing.slice(i, i + 100))) extra[profile.user_id] = profile;
              }
              if (generation !== selectionGeneration.current) throw new Error("Selection changed");
              return { text: selectionText(messages, (message) => {
                const profile = message.sender_id ? extra[message.sender_id] : undefined;
                return profile ? visiblePersonName(profile, { showNickname: conversation?.kind !== "dm" && conversation?.show_member_nicknames !== false }) : nameOfMessage(message);
              }), count: messages.length };
            }}
            resolveMessageIds={async (limit) => (await resolveSelection(limit)).map((message) => message.id)}
            messageIds={selectedInOrder.map((message) => message.id)}
            ignoreOutsideSelector={SELECT_ROW_SELECTOR}
          />
          {onOpenInfo ? (
            <button type="button" className={CONVERSATION_HEADER_ICON_CLASS} data-conversation-info="" onClick={onOpenInfo} aria-label={tt("详情")} title={tt("详情")}>
              <HeaderIcon name="info" />
            </button>
          ) : null}
          {showCallButton ? (
            <CallButton conversationId={conversationId} title={title} kind={conversation.kind} disabled={policy?.awaiting_reply} />
          ) : null}
        </header>
        <WorkConversationHeader conversation={conversation} onBlocked={() => setBlocked(true)} />
        <PinnedBar
          pins={snapshot.pins}
          nameOf={nameOf}
          onJump={(message) => jumpToMessage(message.id, message.seq)}
          onUnpin={(message) => void store.togglePin(message.id, true)}
        />
        {searchOpen ? (
          <SearchView
            conversationId={conversationId}
            onOpenResult={(_id, seq) => {
              setSearchOpen(false);
              openMessages({ conversationId, seq });
            }}
          />
        ) : (
          <CallChatProvider value={callChat}>
            <MessageList
              store={store}
              active={active && !searchOpen}
              snapshot={snapshot}
              profiles={profiles}
              conversation={conversation}
              viewerId={viewerId}
              isAdmin={Boolean(isAdmin)}
              unreadAfterSeq={unreadAfterSeq}
              highlightSeq={highlightSeq}
              handlers={handlers}
              selectionMode={selectionMode}
              selectedMessageIds={visibleSelection}
              onToggleSelected={(message) => {
                selectionGeneration.current += 1;
                setWholeConversation(false);
                setSelectingAll(false);
                setSelectedMessageIds((current) => {
                  const next = new Set(wholeConversation ? visibleSelection : current);
                  if (next.has(message.id)) next.delete(message.id);
                  else next.add(message.id);
                  return next;
                });
              }}
              onReachBottom={reportRead}
              scrollToMessageId={scrollTarget}
              messageMarks={messageMarks}
              cardOpeners={cardOpeners}
            />
            <TypingLine names={typing.map((id) => nameOf(id))} />
          </CallChatProvider>
        )}
        <div className="shrink-0" hidden={searchOpen} data-conversation-composer>
          {snapshot.pending.some((item) => item.status === "failed" && item.error === "reply_limit") ? (
            <p role="status" data-reply-limit className="px-3 pt-2 text-[12px] text-stone-500">{tt("对方回复前，每周最多发送 3 条消息")}</p>
          ) : null}
          <Composer
            store={store}
            conversationId={conversationId}
            conversation={conversation}
            viewerId={viewerId}
            layout={layout}
            quote={quote}
            quoteLabel={quote ? nameOf(quote.sender_id) : undefined}
            onClearQuote={() => setQuote(null)}
            editing={editing}
            onCancelEdit={() => setEditing(null)}
            onEditLast={lastOwn ? () => setEditing(lastOwn) : undefined}
            disabled={Boolean(disabledReason)}
            disabledReason={disabledReason}
            workPolicy={policy}
            attachTaskCard={attachTaskCard}
          />
        </div>
      </div>
      {reporting ? (
        <ReportDialog
          target={{ kind: "message", id: reporting.id, label: nameOf(reporting.sender_id) }}
          onClose={() => setReporting(null)}
        />
      ) : null}
      {profileId ? (
        <ProfileCard
          userId={profileId}
          conversationId={conversationId}
          onClose={() => setProfileId(null)}
          onOpenConversation={(id) => {
            setProfileId(null);
            openMessages({ conversationId: id });
          }}
        />
      ) : null}
    </div>
  );
}
