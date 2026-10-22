// W08 · 聊天里的通话：入口按钮、会话列表标记、聊天卡片（合同 §3.9 导出名，签名不许改）。
// 首个提交是桩；正式实现落在同目录各组件文件里，由这里统一再导出。
import type { ImConversationKind, ImMessage } from "../../../../lib/im/types";

/** 会话列表行上的 `active_call`（合同 §3.2「会话列表」）。 */
export interface ActiveCallSummary {
  call_id: string;
  participant_count: number;
  started_at: string;
}

export interface CallButtonProps {
  conversationId: string;
  title: string;
  kind: ImConversationKind;
  disabled?: boolean;
}

export interface InboxCallBadgeProps {
  conversationId: string;
  activeCall: ActiveCallSummary | null | undefined;
}

export interface CallMessageCardProps {
  message: ImMessage;
}

export function CallButton(_props: CallButtonProps): null {
  return null;
}

export function InboxCallBadge(_props: InboxCallBadgeProps): null {
  return null;
}

export function CallMessageCard(_props: CallMessageCardProps): null {
  return null;
}
