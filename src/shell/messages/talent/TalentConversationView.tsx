"use client";

// 收件箱里的 talent 交易会话。占位，由 W07 实现（work-chat 契约 §8.2）；导出名与 props 不改，只可加可选 props。

export interface TalentConversationViewProps {
  conversationId: string;
  layout: "docked" | "full" | "mobile";
  onBack?: () => void;
}

export function TalentConversationView(_props: TalentConversationViewProps) {
  return null;
}
