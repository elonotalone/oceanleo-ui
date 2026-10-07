"use client";

// LeoChat 整页的聊天栏：宽屏左列表右会话；窄屏一次只显示一边。列表和小窗共用 Inbox。
import { useEffect, useState, useSyncExternalStore, type ReactElement } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { DealConversationView } from "../bay/deal/DealConversationView";
import { ConversationView } from "../messages/conversation/ConversationView";
import { ConversationInfoPanel } from "../messages/groups/ConversationInfoPanel";
import { NewConversationDialog } from "../messages/groups/NewConversationDialog";
import { Inbox } from "../messages/Inbox";
import { imStore } from "../messages/realtime/hooks";

export interface ChatsSectionProps {
  conversationId: string | null;
  highlightSeq: number | null;
  onOpen: (conversationId: string, seq?: number | null) => void;
  onClose: () => void;
}

function subscribeWide(onStoreChange: () => void): () => void {
  const mq = window.matchMedia("(min-width: 768px)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function useWide(): boolean {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia("(min-width: 768px)").matches, () => true);
}

export function ChatsSection({ conversationId, highlightSeq, onOpen, onClose }: ChatsSectionProps): ReactElement {
  const tt = useUI();
  const wide = useWide();
  const [newOpen, setNewOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    setInfoOpen(false);
  }, [conversationId]);

  useEffect(() => {
    const store = imStore();
    const sync = () => {
      const foreground = conversationId && !conversationId.startsWith("talent:") && !document.hidden ? conversationId : null;
      store.setForegroundConversation(foreground);
      if (foreground) store.clearConversationUnread(foreground);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      store.setForegroundConversation(null);
    };
  }, [conversationId]);

  const showList = wide || !conversationId;
  const showThread = wide || Boolean(conversationId);
  const talent = conversationId ? conversationId.startsWith("talent:") : false;

  let thread: ReactElement | null = null;
  if (conversationId) {
    const conversation = talent ? (
      <DealConversationView
        key={conversationId}
        threadId={conversationId.replace(/^talent:/, "")}
        layout={wide ? "full" : "mobile"}
        onBack={onClose}
      />
    ) : (
      <ConversationView
        key={conversationId}
        conversationId={conversationId}
        layout={wide ? "full" : "mobile"}
        onBack={onClose}
        onOpenInfo={() => setInfoOpen(true)}
        highlightSeq={highlightSeq}
        onUnavailable={onClose}
      />
    );
    thread =
      infoOpen && !talent ? (
        <div className="flex min-h-0 flex-1">
          {wide ? <div className="flex min-w-0 flex-1 flex-col">{conversation}</div> : null}
          <div
            className={`flex min-h-0 flex-col ${
              wide ? "w-[320px] shrink-0 border-l border-black/10 dark:border-white/10" : "flex-1"
            }`}
          >
            <ConversationInfoPanel
              conversationId={conversationId}
              onClose={() => setInfoOpen(false)}
              onOpenConversation={(id) => {
                setInfoOpen(false);
                onOpen(id);
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">{conversation}</div>
      );
  }

  return (
    <div
      data-leochat-chats
      className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm"
    >
      {showList ? (
        <div
          className={
            wide
              ? "flex min-h-0 w-[340px] shrink-0 flex-col border-r border-black/10 dark:border-white/10"
              : "flex min-h-0 min-w-0 flex-1 flex-col"
          }
        >
          <Inbox
            activeConversationId={conversationId}
            onOpenConversation={(id, seq) => onOpen(id, seq ?? null)}
            onNew={() => setNewOpen(true)}
          />
          <NewConversationDialog
            open={newOpen}
            onClose={() => setNewOpen(false)}
            onCreated={(id) => {
              setNewOpen(false);
              onOpen(id);
            }}
          />
        </div>
      ) : null}
      {showThread ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {thread ?? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-[13px] text-neutral-400">{tt("选一个聊天开始。")}</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
