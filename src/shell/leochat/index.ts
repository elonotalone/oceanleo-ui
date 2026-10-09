// LeoChat 能在三处显示：左下角图标开的小窗（MessagesHost）、各站 `/leochat` 整页（LeoChatPage）、
// 对话页右侧栏里的那一块（LeoChatPanel）。一次只显示一处，见 messages/host-state.ts 的 claimSurface。
export { LeoChatButton } from "./LeoChatButton";
export { LeoChatPage } from "./LeoChatPage";
export type { LeoChatPageProps } from "./LeoChatPage";
export { LeoChatPanel } from "./LeoChatPanel";
export type { LeoChatPanelProps, LeoChatPanelRequest } from "./LeoChatPanel";
export { LEOCHAT_PATH } from "./leochat-links";
