"use client";

// 会话：消息流、输入框、线程。B1 版：拉 /messages 按 seq 显示文字，能发文字。
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { messagesApi } from "../../../lib/im/messages-api";
import { getConversationStore } from "./conversation-store";
import { Composer } from "../composer/Composer";

export interface ConversationViewProps {
  conversationId: string;
  layout: "docked" | "full" | "mobile";
  onBack?: () => void;
  onOpenInfo?: () => void;
  highlightSeq?: number | null;
}

export function ConversationView({ conversationId }: ConversationViewProps) {
  const store = useMemo(
    () => getConversationStore({ api: messagesApi, conversationId, viewerId: "me" }),
    [conversationId],
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    void store.catchUp();
  }, [store]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        {snapshot.messages.map((message) => (
          <div key={message.id} className="whitespace-pre-wrap text-sm text-neutral-800">
            {message.body}
          </div>
        ))}
        {snapshot.pending.map((entry) => (
          <div key={entry.clientId} className="whitespace-pre-wrap text-sm text-neutral-400">
            {entry.message.body}
          </div>
        ))}
      </div>
      <Composer store={store} />
    </div>
  );
}
