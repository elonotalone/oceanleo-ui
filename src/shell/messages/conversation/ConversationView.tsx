"use client";

// 会话：消息流、输入框、置顶条、「正在输入」。导出名与 props 不变（契约 §8.2）。
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { ImApiError } from "../../../lib/im/client";
import { conversationDisplayTitle, visiblePersonName } from "../../../lib/im/people-api";
import { messagesApi } from "../../../lib/im/messages-api";
import { fetchConversations } from "../../../lib/im/inbox-api";
import type { ImConversationDetail, ImConversationSummary, ImMessage, ImProfile } from "../../../lib/im/types";
import { ConfirmDialog } from "../../../ui";
import { Composer } from "../composer/Composer";
import { openMessages } from "../host-state";
import { ImBackIcon, ImInfoIcon, ImSearchIcon } from "../messages-surface";
import { SearchView } from "../search/SearchView";
import { ProfileCard } from "../people/ProfileCard";
import { useImEvent, useImResync, usePresence } from "../realtime/hooks";
import { ReportDialog } from "../report/ReportDialog";
import { MessageList, useStoreEvents } from "./MessageList";
import { useMessageHandlers } from "./MessageItem";
import { PinnedBar } from "./PinnedBar";
import { TypingLine, useTypingUsers } from "./TypingLine";
import { getConversationStore, unreadBoundary, type ConversationStore } from "./conversation-store";
import { historyEventTargetsConversation, subscribeHistoryCleared } from "./history-events";
import { MeetingPanel } from "../meeting/MeetingPanel";

export interface ConversationViewProps {
  conversationId: string;
  layout: "docked" | "full" | "mobile";
  onBack?: () => void;
  onOpenInfo?: () => void;
  highlightSeq?: number | null;
  /**
   * 这条会话当前这个人打不开（不存在，或不是成员）。LeoChat 会记住上次停在哪条会话，
   * 换了账号、被移出群之后那条记录就失效了：调用方据此退回列表，而不是停在一块空白上。
   */
  onUnavailable?: () => void;
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
  useImEvent("conversation.updated", (event) => {
    if (event.conversation.id === conversationId) load();
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

export function ConversationView({ conversationId, layout, onBack, onOpenInfo, highlightSeq = null, onUnavailable }: ConversationViewProps) {
  const tt = useUI();
  const viewerId = useViewerId();
  const conversation = useConversationDetail(conversationId, onUnavailable);

  const store = useMemo(
    () => (viewerId ? getConversationStore({ api: messagesApi, conversationId, viewerId }) : null),
    [conversationId, viewerId],
  );
  if (!store) {
    return <div className="flex h-full items-center justify-center text-[13px] text-neutral-400">{tt("正在加载…")}</div>;
  }
  return (
    <ConversationBody
      key={`${conversationId}:${viewerId}`}
      conversationId={conversationId}
      layout={layout}
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
  const { conversationId, layout, onBack, onOpenInfo, highlightSeq = null, viewerId, conversation, store } = props;
  const tt = useUI();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [quote, setQuote] = useState<ImMessage | null>(null);
  const [editing, setEditing] = useState<ImMessage | null>(null);
  const [forwardMessages, setForwardMessages] = useState<ImMessage[] | null>(null);
  const [forwardTargets, setForwardTargets] = useState<ImConversationSummary[]>([]);
  const [forwardError, setForwardError] = useState("");
  const [forwarding, setForwarding] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [reporting, setReporting] = useState<ImMessage | null>(null);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<{ id: string; nonce: number } | null>(null);
  const [unreadAfterSeq, setUnreadAfterSeq] = useState<number | null>(null);
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

  useEffect(() => {
    if (!forwardMessages) return;
    let alive = true;
    void fetchConversations("all").then((page) => {
      if (alive) setForwardTargets(page.items.filter((item) => item.id !== conversationId));
    }).catch(() => {
      if (alive) setForwardError(tt("暂时无法加载会话列表。"));
    });
    return () => { alive = false; };
  }, [forwardMessages, conversationId, tt]);
  useEffect(() => subscribeHistoryCleared(window, conversationId, reloadHistory), [conversationId, reloadHistory]);
  useImEvent("conversation.updated", (event) => {
    if (historyEventTargetsConversation(event, conversationId)) reloadHistory();
  });
  useImEvent("conversation.removed", (event) => {
    if (historyEventTargetsConversation(event, conversationId)) reloadHistory();
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
    [conversationId],
  );
  useEffect(
    () => () => {
      const state = readState.current;
      if (state.timer) clearTimeout(state.timer);
    },
    [],
  );

  const referencedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of snapshot.messages) {
      if (m.sender_id) ids.add(m.sender_id);
      for (const id of m.mentions) ids.add(id);
      if (m.quote?.sender_id) ids.add(m.quote.sender_id);
      for (const id of m.thread?.participant_ids ?? []) ids.add(id);
      for (const id of Object.keys(m.mention_reads ?? {})) ids.add(id);
    }
    for (const p of snapshot.pins) if (p.sender_id) ids.add(p.sender_id);
    return Array.from(ids);
  }, [snapshot.messages, snapshot.pins]);
  const profiles = useProfileMap(conversation, referencedIds);

  const isAdmin = conversation?.my_role === "owner" || conversation?.my_role === "admin";
  const selectedMessages = snapshot.messages.filter((message) => selectedMessageIds.has(message.id));
  const canDeleteSelection = selectedMessages.length > 0 && (Boolean(isAdmin) || selectedMessages.every((message) => message.sender_kind === "user" && message.sender_id === viewerId));
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
    onForward: (message) => {
      setForwardError("");
      setForwardMessages([message]);
    },
    onMultiSelect: (message) => {
      setSelectionMode(true);
      setSelectedMessageIds(new Set([message.id]));
    },
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
  const dissolved = Boolean(conversation?.dissolved);
  const notMember = conversation !== null && conversation.my_role === null && conversation.kind !== "dm";
  const disabledReason = dissolved ? tt("这个群已解散，历史消息只读。") : notMember ? tt("你已不在这个会话里。") : undefined;
  const peerPresence = peerId ? presence[peerId] : undefined;

  return (
    <div className="relative flex h-full min-h-0" data-conversation-view={conversationId}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-1 border-b border-neutral-200/80 px-2 py-2">
          {onBack ? (
            <button type="button" data-im-chrome-btn onClick={onBack} aria-label={tt("返回")}>
              <ImBackIcon />
            </button>
          ) : null}
          <div className="min-w-0 flex-1 px-1">
            <div className="flex items-center gap-1.5">
              {peerPresence ? (
                <span
                  className={
                    "h-1.5 w-1.5 shrink-0 rounded-full " +
                    (peerPresence === "online" ? "bg-emerald-500" : peerPresence === "away" ? "bg-neutral-400" : "bg-neutral-300")
                  }
                  title={peerPresence === "online" ? tt("在线") : peerPresence === "away" ? tt("离开") : tt("离线")}
                />
              ) : null}
              <h2 className="truncate text-[13px] font-semibold tracking-tight text-neutral-900">{title}</h2>
              {conversation?.has_external ? (
                <span className="shrink-0 text-[11px] text-neutral-400">{tt("含外部成员")}</span>
              ) : null}
            </div>
            {conversation && conversation.kind !== "dm" ? (
              <div className="text-[12px] text-neutral-400">{tt("{n} 位成员", { n: conversation.member_count })}</div>
            ) : null}
          </div>
          <button
            type="button"
            data-im-chrome-btn
            onClick={() => setSearchOpen((open) => !open)}
            aria-label={tt("搜索消息")}
            title={tt("搜索消息")}
            aria-pressed={searchOpen}
          >
            <ImSearchIcon />
          </button>
          {onOpenInfo ? (
            <button type="button" data-im-chrome-btn onClick={onOpenInfo} aria-label={tt("详情")} title={tt("详情")}>
              <ImInfoIcon />
            </button>
          ) : null}
          {conversation && conversation.kind !== "talent" && !dissolved && !notMember ? (
            <button type="button" data-im-chrome-btn onClick={() => setMeetingOpen(true)} aria-label={tt("会议")} title={tt("会议")}>
              <span aria-hidden="true">◉</span>
              <span className="sr-only">{tt("会议")}</span>
            </button>
          ) : null}
        </header>
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
          <>
            <MessageList
              store={store}
              snapshot={snapshot}
              profiles={profiles}
              conversation={conversation}
              viewerId={viewerId}
              isAdmin={Boolean(isAdmin)}
              unreadAfterSeq={unreadAfterSeq}
              highlightSeq={highlightSeq}
              handlers={handlers}
              selectionMode={selectionMode}
              selectedMessageIds={selectedMessageIds}
              onToggleSelected={(message) => setSelectedMessageIds((current) => {
                const next = new Set(current);
                if (next.has(message.id)) next.delete(message.id);
                else next.add(message.id);
                return next;
              })}
              onReachBottom={reportRead}
              scrollToMessageId={scrollTarget}
            />
            <TypingLine names={typing.map((id) => nameOf(id))} />
          </>
        )}
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
        />
      </div>
      {selectionMode ? (
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900" data-message-selection-toolbar="">
          <span className="mr-auto text-sm">{tt("已选择 {n} 条", { n: selectedMessageIds.size })}</span>
          <button type="button" disabled={!selectedMessageIds.size} onClick={() => setForwardMessages(snapshot.messages.filter((message) => selectedMessageIds.has(message.id)))}>{tt("转发")}</button>
          <button type="button" disabled={!canDeleteSelection} onClick={() => setBulkDeleteOpen(true)} className="text-red-600 disabled:opacity-40">{tt("删除")}</button>
          <button type="button" onClick={() => { setSelectionMode(false); setSelectedMessageIds(new Set()); }}>{tt("完成")}</button>
        </div>
      ) : null}
      {bulkDeleteOpen ? (
        <ConfirmDialog
          title={tt("删除所选消息？删除后所有人都看不到内容。")}
          confirmLabel={tt("删除")}
          danger
          onConfirm={() => {
            setBulkDeleteOpen(false);
            for (const message of selectedMessages) void store.recall(message.id);
            setSelectedMessageIds(new Set());
            setSelectionMode(false);
          }}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      ) : null}
      {forwardMessages ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setForwardMessages(null); }}>
          <section role="dialog" aria-modal="true" aria-label={tt("转发到会话")} className="max-h-[80%] w-full max-w-sm overflow-auto rounded-xl bg-white p-4 shadow-xl dark:bg-neutral-900">
            <h3 className="mb-3 text-sm font-semibold">{tt("转发到会话")}</h3>
            {forwardError ? <p className="mb-2 text-sm text-red-600">{forwardError}</p> : null}
            {!forwardTargets.length && !forwardError ? <p className="py-4 text-center text-sm text-neutral-500">{tt("正在加载会话…")}</p> : null}
            {forwardTargets.map((target) => (
              <button key={target.id} type="button" disabled={forwarding} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-white/10" onClick={() => {
                setForwarding(true);
                void Promise.all(forwardMessages.map((message) => messagesApi.sendMessage(target.id, {
                  client_id: crypto.randomUUID(),
                  kind: ["text", "file", "image", "video", "audio", "voice", "artifact", "replay"].includes(message.kind) ? message.kind as "text" : "text",
                  body: message.body,
                  attachments: message.attachments,
                  card: message.card,
                }))).then(() => {
                  setForwardMessages(null);
                  setSelectedMessageIds(new Set());
                  setSelectionMode(false);
                }).catch(() => setForwardError(tt("转发失败，请稍后重试。"))).finally(() => setForwarding(false));
              }}>{conversationDisplayTitle(target)}</button>
            ))}
            <button type="button" className="mt-3 w-full rounded-lg border px-3 py-2 text-sm" onClick={() => setForwardMessages(null)}>{tt("取消")}</button>
          </section>
        </div>
      ) : null}
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
      {meetingOpen && conversation ? (
        <MeetingPanel
          conversationId={conversationId}
          conversationTitle={title}
          myUserId={viewerId}
          myRole={conversation.my_role}
          profiles={profiles}
          onClose={() => setMeetingOpen(false)}
        />
      ) : null}
    </div>
  );
}
