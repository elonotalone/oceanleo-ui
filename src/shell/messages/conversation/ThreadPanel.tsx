"use client";

// 线程：在某条消息下讨论。全屏布局在右侧，停靠 / 手机是覆盖层；有自己的输入框（带 thread_root_id）。
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { messagesApi } from "../../../lib/im/messages-api";
import type { ImConversationDetail, ImMessage, ImProfile } from "../../../lib/im/types";
import { Composer } from "../composer/Composer";
import { ImCloseIcon } from "../messages-surface";
import { useImResync } from "../realtime/hooks";
import { MessageItem, useMessageHandlers } from "./MessageItem";
import { MessageList, useStoreEvents } from "./MessageList";
import { TypingLine, useTypingUsers } from "./TypingLine";
import { getConversationStore } from "./conversation-store";

export interface ThreadPanelProps {
  conversationId: string;
  root: ImMessage;
  conversation: ImConversationDetail | null;
  viewerId: string | null;
  profiles: Record<string, ImProfile | undefined>;
  layout: "docked" | "full" | "mobile";
  isAdmin: boolean;
  disabledReason?: string;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onReport: (message: ImMessage) => void;
}

export function ThreadPanel(props: ThreadPanelProps) {
  const { conversationId, root, conversation, viewerId, profiles, layout, isAdmin, disabledReason, onClose, onOpenProfile, onReport } = props;
  const tt = useUI();
  const store = useMemo(
    () => getConversationStore({ api: messagesApi, conversationId, viewerId: viewerId ?? "", threadRootId: root.id }),
    [conversationId, root.id, viewerId],
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [quote, setQuote] = useState<ImMessage | null>(null);
  const [editing, setEditing] = useState<ImMessage | null>(null);
  const typing = useTypingUsers({ conversationId, threadRootId: root.id, viewerId });
  useStoreEvents(store);
  useImResync(() => void store.loadLatest());

  useEffect(() => {
    void store.loadLatest();
  }, [store]);

  const shownRoot = snapshot.root ?? root;
  const nameOf = (id: string | null) => (id ? (profiles[id]?.display_name ?? tt("已退出的成员")) : "leo");
  const handlers = useMessageHandlers({
    store,
    conversationId,
    onQuote: setQuote,
    onThread: () => undefined,
    onEdit: setEditing,
    onReport,
    onOpenProfile,
    onJumpToMessage: () => undefined,
  });

  const lastOwn = useMemo(
    () => [...snapshot.messages].reverse().find((m) => m.sender_id === viewerId && m.kind === "text" && !m.recalled_at) ?? null,
    [snapshot.messages, viewerId],
  );

  return (
    <aside
      className={
        "flex min-h-0 flex-col " +
        (layout === "full"
          ? "w-[360px] shrink-0 border-l border-neutral-200"
          : "absolute inset-0 z-20")
      }
      aria-label={tt("线程")}
      data-thread-panel=""
    >
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5">
        <h3 className="text-[14px] font-semibold text-neutral-900">{tt("线程")}</h3>
        <button type="button" data-im-chrome-btn onClick={onClose} aria-label={tt("关闭")}>
          <ImCloseIcon />
        </button>
      </header>
      <div className="max-h-[40%] shrink-0 overflow-y-auto border-b border-neutral-100 py-1">
        <MessageItem
          message={shownRoot}
          grouped={false}
          viewerId={viewerId}
          profiles={profiles}
          conversation={conversation}
          isAdmin={isAdmin}
          inThread
          handlers={handlers}
        />
      </div>
      <div className="px-4 py-1.5 text-[11.5px] text-neutral-400">
        {tt("{n} 条回复", { n: snapshot.messages.length })}
      </div>
      <MessageList
        store={store}
        snapshot={snapshot}
        profiles={profiles}
        conversation={conversation}
        viewerId={viewerId}
        isAdmin={isAdmin}
        unreadAfterSeq={null}
        inThread
        handlers={handlers}
      />
      <TypingLine names={typing.map((id) => nameOf(id))} />
      <Composer
        store={store}
        conversationId={conversationId}
        conversation={conversation}
        viewerId={viewerId}
        layout={layout}
        threadRootId={root.id}
        quote={quote}
        quoteLabel={quote ? nameOf(quote.sender_id) : undefined}
        onClearQuote={() => setQuote(null)}
        editing={editing}
        onCancelEdit={() => setEditing(null)}
        onEditLast={lastOwn ? () => setEditing(lastOwn) : undefined}
        placeholder={tt("回复这条消息…")}
        disabled={Boolean(disabledReason)}
        disabledReason={disabledReason}
      />
    </aside>
  );
}
