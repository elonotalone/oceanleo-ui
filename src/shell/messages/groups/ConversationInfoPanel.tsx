"use client";

// 会话信息：群资料、成员与角色、邀请链接、我的通知设置、退出 / 解散。占位，由 W10 实现（work-chat 契约 §8.2）。

export interface ConversationInfoPanelProps {
  conversationId: string;
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
}

export function ConversationInfoPanel(_props: ConversationInfoPanelProps) {
  return null;
}
