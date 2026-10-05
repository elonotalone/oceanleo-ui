// 标签页在后台时的桌面通知。占位，由 W03 实现（work-chat 契约 §8.2）；导出名与参数不改。

export interface DesktopNotificationInput {
  title: string;
  body: string;
  conversationId: string;
  icon?: string | null;
}

export function maybeShowDesktopNotification(_input: DesktopNotificationInput): void {}
