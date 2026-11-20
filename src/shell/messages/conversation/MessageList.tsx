"use client";

// 消息流：按时间往下走，往上滚加载更早的；新消息来时贴底，离底部远就显示「N 条新消息」；
// 时间分隔（与任务页共用 chat-time-separators）、未读分隔线、同一人 5 分钟内合并头像；`highlightSeq` 滚到那条并闪一下。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import type { ImConversationDetail, ImMessage, ImProfile } from "../../../lib/im/types";
import { MessageItem, type MessageCardOpeners, type MessageItemHandlers } from "./MessageItem";
import { dmReadState } from "./ReadReceipt";
import { useImEvent } from "../realtime/hooks";
import { buildRows, type ConversationSnapshot, type ConversationStore } from "./conversation-store";
import { ChatTimeSeparator } from "../../ChatTimeSeparator";
import { OlderHistoryTop, useOlderHistory } from "../../history/older-history";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
const NEAR_BOTTOM_PX = 80;
const LOAD_NEWER_PX = 160;
const FLASH_MS = 1800;

export interface MessageListProps {
  store: ConversationStore;
  active?: boolean;
  snapshot: ConversationSnapshot;
  profiles: Record<string, ImProfile | undefined>;
  conversation: ImConversationDetail | null;
  viewerId: string | null;
  isAdmin: boolean;
  unreadAfterSeq: number | null;
  highlightSeq?: number | null;
  handlers: MessageItemHandlers;
  /** 滚到底（看到最新一条）时调用，参数是当时最新的 seq。 */
  onReachBottom?: (seq: number) => void;
  /** 滚到某条 id 的请求（引用跳转、置顶跳转）。 */
  scrollToMessageId?: { id: string; nonce: number } | null;
  selectionMode?: boolean;
  selectedMessageIds?: ReadonlySet<string>;
  onToggleSelected?: (message: ImMessage) => void;
  /** One short line under a message, by message id (a task: "Given to …"). */
  messageMarks?: Readonly<Record<string, string>>;
  /** Passed to task / quote cards when the host handles opening them itself. */
  cardOpeners?: MessageCardOpeners;
}

export function MessageList(props: MessageListProps) {
  const {
    store,
    active = true,
    snapshot,
    profiles,
    conversation,
    viewerId,
    isAdmin,
    unreadAfterSeq,
    highlightSeq,
    handlers,
    onReachBottom,
    scrollToMessageId,
    selectionMode = false,
    selectedMessageIds = new Set<string>(),
    onToggleSelected,
    messageMarks,
    cardOpeners,
  } = props;
  const tt = useUI();
  const locale = useLocale();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);
  const initializedRef = useRef(false);
  const prevRef = useRef({ firstId: "", lastId: "", count: 0, pending: 0 });
  const [newCount, setNewCount] = useState(0);
  const [flashSeq, setFlashSeq] = useState<number | null>(null);
  const flashedRef = useRef<number | null>(null);

  const rows = useMemo(
    () =>
      buildRows(snapshot.messages, snapshot.pending, {
        unreadAfterSeq,
        viewerId,
      }),
    [snapshot.messages, snapshot.pending, unreadAfterSeq, viewerId],
  );

  const lastOwnSeq = useMemo(() => {
    let seq = 0;
    for (const message of snapshot.messages) if (message.sender_id === viewerId) seq = Math.max(seq, message.seq);
    return seq;
  }, [snapshot.messages, viewerId]);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    setNewCount(0);
  }, []);

  const scrollToSeq = useCallback((seq: number): boolean => {
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-seq="${seq}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    return true;
  }, []);

  // 内容变化后的滚动策略：首次到底（或到高亮）；上方加载进来保持位置；底部新增则贴底或计数。
  useIsoLayoutEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;
    const prev = prevRef.current;
    const messages = snapshot.messages;
    const first = messages[0]?.id ?? "";
    const last = messages[messages.length - 1]?.id ?? "";

    if (!initializedRef.current) {
      if (messages.length === 0 && !snapshot.loaded) return;
      initializedRef.current = true;
      if (highlightSeq && scrollToSeq(highlightSeq)) {
        atBottomRef.current = false;
      } else {
        scrollToBottom();
      }
    } else if (last !== prev.lastId || snapshot.pending.length > prev.pending) {
      const prepended = first && prev.firstId && first !== prev.firstId && messages.length > prev.count;
      const appendedMine = snapshot.pending.length > prev.pending || messages[messages.length - 1]?.sender_id === viewerId;
      // A simultaneous prepend keeps the reading anchor; older rows never count as new messages.
      if (!prepended && (atBottomRef.current || appendedMine)) {
        scrollToBottom();
      } else if (last !== prev.lastId && !atBottomRef.current) {
        const previousLastIndex = messages.findIndex((message) => message.id === prev.lastId);
        const added = previousLastIndex >= 0 ? messages.length - previousLastIndex - 1 : Math.max(1, messages.length - prev.count);
        setNewCount((value) => value + added);
      }
    }
    prevRef.current = {
      firstId: first,
      lastId: last,
      count: messages.length,
      pending: snapshot.pending.length,
    };
  }, [active, snapshot.messages, snapshot.pending, snapshot.loaded, highlightSeq, scrollToSeq, scrollToBottom, viewerId]);

  const loadOlder = useCallback(() => store.loadBefore(), [store]);
  const history = useOlderHistory({
    scrollRef: containerRef,
    hasMore: snapshot.hasMoreBefore,
    loadOlder,
    firstKey: snapshot.messages[0]?.id ?? null,
    itemSelector: "[data-history-key]",
    disabled: !active || !snapshot.loaded || snapshot.messages.length === 0,
  });

  // highlightSeq：滚过去并闪一下（每个 seq 只闪一次）
  useEffect(() => {
    if (!highlightSeq || flashedRef.current === highlightSeq) return;
    if (!snapshot.messages.some((m) => m.seq === highlightSeq)) return;
    if (scrollToSeq(highlightSeq)) {
      flashedRef.current = highlightSeq;
      atBottomRef.current = false;
      setFlashSeq(highlightSeq);
      const handle = setTimeout(() => setFlashSeq(null), FLASH_MS);
      return () => clearTimeout(handle);
    }
    return undefined;
  }, [highlightSeq, snapshot.messages, scrollToSeq]);

  // 引用 / 置顶跳转
  useEffect(() => {
    if (!scrollToMessageId) return;
    const target = snapshot.messages.find((m) => m.id === scrollToMessageId.id);
    if (!target) return;
    if (scrollToSeq(target.seq)) {
      setFlashSeq(target.seq);
      const handle = setTimeout(() => setFlashSeq(null), FLASH_MS);
      return () => clearTimeout(handle);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToMessageId?.nonce]);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distance < NEAR_BOTTOM_PX;
    atBottomRef.current = atBottom;
    if (distance < LOAD_NEWER_PX) void store.loadAfter();
    if (atBottom && !store.getSnapshot().hasMoreAfter) {
      setNewCount(0);
      const seq = store.getSnapshot().lastSeq;
      if (seq > 0) onReachBottom?.(seq);
    }
  }, [store, onReachBottom]);

  // 首屏就在底部时也要报一次已读
  useEffect(() => {
    if (!active || !snapshot.loaded || !atBottomRef.current || snapshot.hasMoreAfter) return;
    if (snapshot.lastSeq > 0) onReachBottom?.(snapshot.lastSeq);
  }, [active, snapshot.loaded, snapshot.lastSeq, snapshot.hasMoreAfter, onReachBottom]);

  const isDm = conversation?.kind === "dm";

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={containerRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain pb-2 [overflow-anchor:none]" data-message-list="">
        {/* The task page's column: centred, at most 52rem (agent-conversation-layout.ts). */}
        <div className="mx-auto w-full max-w-[52rem] px-3" data-message-column="">
        <OlderHistoryTop hasMore={snapshot.hasMoreBefore} spinnerVisible={history.spinnerVisible} sentinelRef={history.sentinelRef} />
        {snapshot.loaded && snapshot.messages.length === 0 && snapshot.pending.length === 0 ? (
          <div className="px-6 py-16 text-center text-[13px] text-stone-400">
            {snapshot.error ? tt("消息加载失败，请稍后重试。") : tt("还没有消息，说点什么吧。")}
          </div>
        ) : null}
        {rows.map((row) => {
          if (row.type === "time") return <ChatTimeSeparator key={row.key} at={row.at} locale={locale} />;
          if (row.type === "unread") {
            return (
              <div key={row.key} className="flex items-center gap-3 px-1.5 pb-1 pt-3 text-[12px] leading-none text-stone-400" data-unread-divider="">
                <span aria-hidden="true" className="h-px flex-1 bg-stone-200" />
                <span className="shrink-0">{tt("以下为未读消息")}</span>
                <span aria-hidden="true" className="h-px flex-1 bg-stone-200" />
              </div>
            );
          }
          const { message, pending } = row;
          return (
            <div key={row.key} data-history-key={message.id}>
              <MessageItem
                message={message}
                pending={pending}
                grouped={row.grouped}
                viewerId={viewerId}
                profiles={profiles}
                conversation={conversation}
                isAdmin={isAdmin}
                streamingText={snapshot.streaming[message.id]}
                notice={snapshot.notices[message.id]}
                dmRead={isDm && !pending ? dmReadState(message, lastOwnSeq, snapshot.peerLastReadSeq) : null}
                highlighted={flashSeq !== null && message.seq === flashSeq}
                handlers={handlers}
                selectionMode={selectionMode}
                selected={selectedMessageIds.has(message.id)}
                onToggleSelected={onToggleSelected}
                mark={messageMarks?.[message.id]}
                cardOpeners={cardOpeners}
              />
            </div>
          );
        })}
        {snapshot.hasMoreAfter ? (
          <div className="py-2 text-center text-[12px] text-stone-400">{tt("正在加载更新的消息…")}</div>
        ) : null}
        </div>
      </div>
      {newCount > 0 || snapshot.hasMoreAfter ? (
        <button
          type="button"
          onClick={() => {
            if (snapshot.hasMoreAfter) void store.loadLatest().then(scrollToBottom);
            else scrollToBottom();
          }}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-stone-900 px-3 py-1 text-[12px] text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-800 active:scale-95"
          data-new-messages=""
        >
          {newCount > 0 ? tt("{n} 条新消息", { n: newCount }) : tt("回到最新消息")}
        </button>
      ) : null}
    </div>
  );
}

/** 把实时事件接进某个 store（会话主线或线程各一个）。 */
export function useStoreEvents(store: ConversationStore): void {
  useImEvent("message.created", (event) => store.applyEvent(event));
  useImEvent("message.updated", (event) => store.applyEvent(event));
  useImEvent("leo.delta", (event) => store.applyEvent(event));
  useImEvent("leo.notice", (event) => store.applyEvent(event));
  useImEvent("pin.changed", (event) => store.applyEvent(event));
  useImEvent("read.updated", (event) => store.applyEvent(event));
}
