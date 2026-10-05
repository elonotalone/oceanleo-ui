"use client";

// 点头像弹出的资料卡：名字、外部标记、私聊 / 加联系人 / 举报 / 拉黑。占位，由 W10 实现（work-chat 契约 §8.2）。

export interface ProfileCardProps {
  userId: string;
  conversationId?: string | null;
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
}

export function ProfileCard(_props: ProfileCardProps) {
  return null;
}
