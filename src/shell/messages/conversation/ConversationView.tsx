"use client";

// 会话：消息流、输入框、线程、置顶条、「正在输入」。导出名与 props 不变（契约 §8.2）。
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { messagesApi } from "../../../lib/im/messages-api";
import type { ImConversationDetail, ImMessage, ImProfile } from "../../../lib/im/types";
import { Composer } from "../composer/Composer";
import { openMessages } from "../host-state";
import { ProfileCard } from "../people/ProfileCard";
import { useImEvent, useImResync, usePresence } from "../realtime/hooks";
import { ReportDialog } from "../report/ReportDialog";
import { MessageList, useStoreEvents } from "./MessageList";
import { useMessageHandlers } from "./MessageItem";
import { PinnedBar } from "./PinnedBar";
import { ThreadPanel } from "./ThreadPanel";
import { TypingLine, useTypingUsers } from "./TypingLine";
import { getConversationStore, unreadBoundary, type ConversationStore } from "./conversation-store";

export interface ConversationViewProps {
  conversationId: string;
  layout: "docked" | "full" | "mobile";
  onBack?: () => void;
  onOpenInfo?: () => void;
  highlightSeq?: number | null;
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
function useConversationDetail(conversationId: string): ImConversationDetail | null {
  const [detail, setDetail] = useState<ImConversationDetail | null>(null);
  const load = useCallback(() => {
    void messagesApi
      .getConversation(conversationId)
      .then(setDetail)
      .catch(() => undefined);
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
    for (const member of conversation?.members ?? []) map[member.user_id] = member.profile;
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

export function ConversationView({ conversationId, layout, onBack, onOpenInfo, highlightSeq = null }: ConversationViewProps) {
  const tt = useUI();
  const viewerId = useViewerId();
  const conversation = useConversationDetail(conversationId);

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
  const [threadRoot, setThreadRoot] = useState<ImMessage | null>(null);
  const [reporting, setReporting] = useState<ImMessage | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<{ id: string; nonce: number } | null>(null);
  const [unreadAfterSeq, setUnreadAfterSeq] = useState<number | null>(null);
  const unreadFrozen = useRef(false);
  const readState = useRef({ last: 0, at: 0, pending: 0, timer: null as ReturnType<typeof setTimeout> | null });

  useStoreEvents(store);

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
      for (const r of m.reactions) for (const id of r.user_ids) ids.add(id);
      for (const id of Object.keys(m.mention_reads ?? {})) ids.add(id);
    }
    for (const p of snapshot.pins) if (p.sender_id) ids.add(p.sender_id);
    return Array.from(ids);
  }, [snapshot.messages, snapshot.pins]);
  const profiles = useProfileMap(conversation, referencedIds);

  const isAdmin = conversation?.my_role === "owner" || conversation?.my_role === "admin";
  const nameOf = useCallback(
    (id: string | null) => (id ? (profiles[id]?.display_name ?? tt("已退出的成员")) : "leo"),
    [profiles, tt],
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
    onThread: (message) => setThreadRoot(message),
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

  const title =
    conversation?.kind === "dm"
      ? (conversation.peer?.display_name ?? conversation.title)
      : (conversation?.title ?? "");
  const dissolved = Boolean(conversation?.dissolved);
  const notMember = conversation !== null && conversation.my_role === null && conversation.kind !== "dm";
  const disabledReason = dissolved ? tt("这个群已解散，历史消息只读。") : notMember ? tt("你已不在这个会话里。") : undefined;
  const peerPresence = peerId ? presence[peerId] : undefined;

  return (
    <div className="relative flex h-full min-h-0 bg-white" data-conversation-view={conversationId}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-3 py-2.5">
          {onBack ? (
            <button type="button" onClick={onBack} aria-label={tt("返回")} className="rounded-md px-1.5 py-1 text-neutral-500 hover:bg-neutral-100">
              ‹
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {peerPresence ? (
                <span
                  className={
                    "h-2 w-2 shrink-0 rounded-full " +
                    (peerPresence === "online" ? "bg-emerald-500" : peerPresence === "away" ? "bg-amber-400" : "bg-neutral-300")
                  }
                  title={peerPresence === "online" ? tt("在线") : peerPresence === "away" ? tt("离开") : tt("离线")}
                />
              ) : null}
              <h2 className="truncate text-[14.5px] font-semibold text-neutral-900">{title}</h2>
              {conversation?.has_external ? (
                <span className="shrink-0 rounded bg-neutral-100 px-1 text-[10.5px] text-neutral-500">{tt("含外部成员")}</span>
              ) : null}
            </div>
            {conversation && conversation.kind !== "dm" ? (
              <div className="text-[11.5px] text-neutral-400">{tt("{n} 位成员", { n: conversation.member_count })}</div>
            ) : null}
          </div>
          {onOpenInfo ? (
            <button type="button" onClick={onOpenInfo} className="rounded-md px-2 py-1 text-[12.5px] text-neutral-500 hover:bg-neutral-100">
              {tt("详情")}
            </button>
          ) : null}
        </header>
        <PinnedBar
          pins={snapshot.pins}
          nameOf={nameOf}
          onJump={(message) => jumpToMessage(message.id, message.seq)}
          onUnpin={(message) => void store.togglePin(message.id, true)}
        />
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
          onReachBottom={reportRead}
          scrollToMessageId={scrollTarget}
        />
        <TypingLine names={typing.map((id) => nameOf(id))} />
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
      {threadRoot ? (
        <ThreadPanel
          conversationId={conversationId}
          root={threadRoot}
          conversation={conversation}
          viewerId={viewerId}
          profiles={profiles}
          layout={layout}
          isAdmin={Boolean(isAdmin)}
          disabledReason={disabledReason}
          onClose={() => setThreadRoot(null)}
          onOpenProfile={setProfileId}
          onReport={setReporting}
        />
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
    </div>
  );
}
