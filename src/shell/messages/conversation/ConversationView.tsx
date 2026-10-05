"use client";

// 会话：消息流、输入框、线程。占位，由 W09 实现（work-chat 契约 §8.2）；导出名与 props 不改，只可加可选 props。

export interface ConversationViewProps {
  conversationId: string;
  layout: "docked" | "full" | "mobile";
  onBack?: () => void;
  onOpenInfo?: () => void;
  highlightSeq?: number | null;
}

export function ConversationView(_props: ConversationViewProps) {
  return null;
}
