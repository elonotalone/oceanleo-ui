// W08 · 聊天里的通话：入口按钮、会话列表标记、聊天卡片（合同 §3.9 导出名，签名不许改）。
export { CallButton, type CallButtonProps } from "./CallButton";
export { InboxCallBadge, type InboxCallBadgeProps } from "./InboxCallBadge";
export { CallMessageCard, type CallMessageCardProps } from "./CallMessageCard";
export type { ActiveCallSummary } from "./conversation-calls";

// 会话视图 / 列表 / 系统行接线用的附加导出（不在合同 §3.9 的四个名字里，属于 W08 自己的面）。
export { CallChatProvider, useEndedCallIndex, type CallChatContextValue } from "./call-chat-context";
export { callMetaOf, callMetaUserIds, type CallCardMeta } from "./call-meta";
export { CALL_DOCK_FOCUS_EVENT, requestDockFocus } from "./call-entry";
export { useActiveCallSummary } from "./use-conversation-call";
