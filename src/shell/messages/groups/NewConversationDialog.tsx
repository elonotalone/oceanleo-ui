"use client";

// 新建私聊 / 群组。占位，由 W10 实现（work-chat 契约 §8.2）；导出名与 props 不改，只可加可选 props。

export interface NewConversationDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
  presetMemberIds?: string[];
}

export function NewConversationDialog(_props: NewConversationDialogProps) {
  return null;
}
