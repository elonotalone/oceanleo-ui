"use client";

// 打开邀请链接后的确认：成为联系人 / 进群 / 申请入群。占位，由 W10 实现（work-chat 契约 §8.2）。

export interface InviteAcceptDialogProps {
  code: string;
  onClose: () => void;
  onDone: (result: { conversationId: string | null }) => void;
}

export function InviteAcceptDialog(_props: InviteAcceptDialogProps) {
  return null;
}
