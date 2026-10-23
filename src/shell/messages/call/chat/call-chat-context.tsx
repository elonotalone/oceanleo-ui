"use client";

// 会话视图给通话卡片的上下文：谁是我、会话类型与标题、名字 / 头像表、已加载的结束消息。
// CallMessageCard 的 props 按合同只有 `{ message }`，其余经这里拿；没有 Provider 时退回保守默认（名字写「成员」、不知道结束详情）。
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { ImConversationKind, ImProfile } from "../../../../lib/im/types";
import type { CallCardMeta } from "./call-meta";

export interface CallChatContextValue {
  viewerId: string | null;
  conversationId: string | null;
  conversationKind: ImConversationKind | null;
  conversationTitle: string;
  profileOf(userId: string | null | undefined): ImProfile | undefined;
  /** 显示名（群昵称规则同消息列表）；不认识的人给空串，由卡片写兜底文字。 */
  nameOf(userId: string | null | undefined): string;
  /** 当前已加载消息里这通通话的 `call_ended` meta（开始卡片变「已结束」时取时长与参与者）。 */
  endedMetaOf(callId: string): CallCardMeta | undefined;
  /**
   * 现在能不能从卡片加入：交易会话、已解散、不是成员、刚收到移出事件（V02 D5）时为 false，
   * 进行中的卡片照样显示人数，但不给「加入通话」。
   */
  canJoin: boolean;
}

const CallChatContext = createContext<CallChatContextValue | null>(null);

export function CallChatProvider({ value, children }: { value: CallChatContextValue; children: ReactNode }) {
  return <CallChatContext.Provider value={value}>{children}</CallChatContext.Provider>;
}

const FALLBACK: CallChatContextValue = {
  viewerId: null,
  conversationId: null,
  conversationKind: null,
  conversationTitle: "",
  profileOf: () => undefined,
  nameOf: () => "",
  endedMetaOf: () => undefined,
  canJoin: true,
};

export function useCallChatContext(): CallChatContextValue {
  return useContext(CallChatContext) ?? FALLBACK;
}

/** 会话视图用：把已加载消息里的 `call_ended` 按 call_id 收成表。 */
export function useEndedCallIndex(metas: Array<CallCardMeta | null>): (callId: string) => CallCardMeta | undefined {
  return useMemo(() => {
    const map = new Map<string, CallCardMeta>();
    for (const meta of metas) {
      if (meta && meta.kind === "call_ended") map.set(meta.callId, meta);
    }
    return (callId: string) => map.get(callId);
  }, [metas]);
}
