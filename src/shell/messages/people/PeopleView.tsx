"use client";

// 联系人、请求、邀请链接、拉黑名单。占位，由 W10 实现（work-chat 契约 §8.2）；导出名与 props 不改，只可加可选 props。

export interface PeopleViewProps {
  onOpenConversation: (conversationId: string) => void;
}

export function PeopleView(_props: PeopleViewProps) {
  return null;
}
