"use client";

// 消息浮层设置页里的提醒设置（桌面通知、推送、邮件、提示音、隐身）。
// B1 最小实现：先让导出名可挂载；完整面板随后覆盖（work-chat 契约 §8.2，导出名不改）。

export function NotifySettingsPanel() {
  return <section data-im-notify-settings="" />;
}
