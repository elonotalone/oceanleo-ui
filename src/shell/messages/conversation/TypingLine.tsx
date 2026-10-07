"use client";

// 「谁正在输入…」。由 ConversationView 用 `typing` 事件喂数据，3 秒无新事件就过期。
import { useEffect, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { useImEvent } from "../realtime/hooks";

export const TYPING_TTL_MS = 4000;

/** 把名字列表拼成一句话的第一步：最多点两个人的名，其余合并成「N 人」。 */
export function typingNames(names: string[]): { shown: string[]; others: number } {
  return { shown: names.slice(0, 2), others: Math.max(0, names.length - 2) };
}

export function TypingLine({ names }: { names: string[] }) {
  const tt = useUI();
  if (names.length === 0) return <div className="h-5" aria-hidden="true" />;
  const { shown, others } = typingNames(names);
  let text: string;
  if (others > 0) text = tt("{names} 等 {n} 人正在输入…", { names: shown.join("、"), n: names.length });
  else if (shown.length === 2) text = tt("{a} 和 {b} 正在输入…", { a: shown[0], b: shown[1] });
  else text = tt("{name} 正在输入…", { name: shown[0] });
  return (
    <div className="flex h-5 items-center gap-1.5 truncate px-4 text-[12px] text-neutral-400" role="status" aria-live="polite">
      <span className="inline-flex gap-0.5" aria-hidden="true">
        <span className="v-typing-dot" />
        <span className="v-typing-dot" />
        <span className="v-typing-dot" />
      </span>
      {text}
    </div>
  );
}

/** 订阅 `typing` 事件：返回此刻正在输入的人（不含自己），4 秒没有新事件就过期。 */
export function useTypingUsers(input: {
  conversationId: string;
  threadRootId: string | null;
  viewerId: string | null;
}): string[] {
  const { conversationId, threadRootId, viewerId } = input;
  const [users, setUsers] = useState<string[]>([]);
  const expiries = useRef(new Map<string, number>());

  const refresh = () => {
    const now = Date.now();
    for (const [id, until] of expiries.current) if (until <= now) expiries.current.delete(id);
    setUsers(Array.from(expiries.current.keys()));
  };

  useImEvent("typing", (event) => {
    if (event.conversation_id !== conversationId) return;
    if ((event.thread_root_id ?? null) !== threadRootId) return;
    if (event.user_id === viewerId) return;
    expiries.current.set(event.user_id, Date.now() + TYPING_TTL_MS);
    refresh();
  });
  // 收到消息的人不再「正在输入」由调用方在消息事件里不处理；靠超时清理
  useEffect(() => {
    expiries.current.clear();
    setUsers([]);
  }, [conversationId, threadRootId]);
  useEffect(() => {
    if (users.length === 0) return;
    const handle = setInterval(refresh, 1000);
    return () => clearInterval(handle);
  }, [users.length]);
  return users;
}
