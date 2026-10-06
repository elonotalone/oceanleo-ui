// 标签页在后台时的桌面通知（work-chat W03，契约 §8.2；导出名与参数不改）。
//
// 只有「标签页不在前台 + 设置允许 + 浏览器已授权」三者都成立才弹；同一会话共用一个 tag，
// 新的覆盖旧的，不会一屏堆满。点击回到这个标签页并打开那个会话：W08 的 `openMessages`
// 落地前，统一派发 `oceanleo:im-open` 事件（W08 监听），不 import 还不存在的模块。

import {
  DEFAULT_IM_SETTINGS,
  cachedImSettings,
  refreshImSettingsInBackground,
} from "../../../lib/im/notify-api";

export interface DesktopNotificationInput {
  title: string;
  body: string;
  conversationId: string;
  icon?: string | null;
}

/** 点通知（本页的桌面通知或推送 SW 的 `im.open`）后要打开某个会话时派发的 window 事件。 */
export const IM_OPEN_EVENT = "oceanleo:im-open";

export interface ImOpenDetail {
  conversationId: string;
}

export function dispatchImOpen(detail: ImOpenDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ImOpenDetail>(IM_OPEN_EVENT, { detail }));
}

function safeIcon(icon: string | null | undefined): string | undefined {
  return typeof icon === "string" && /^https:\/\//i.test(icon) ? icon : undefined;
}

export function maybeShowDesktopNotification(input: DesktopNotificationInput): void {
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (!document.hidden) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const conversationId = String(input.conversationId || "");
    if (!conversationId) return;

    // 设置读缓存；没取过就按默认值（桌面通知默认开）并在后台取一次，下一条起按真实设置。
    const settings = cachedImSettings() ?? DEFAULT_IM_SETTINGS;
    refreshImSettingsInBackground();
    if (!settings.desktop_notifications) return;

    const notification = new Notification(String(input.title || "OceanLeo").slice(0, 120), {
      body: String(input.body || "").slice(0, 200),
      tag: `im:${conversationId}`,
      icon: safeIcon(input.icon),
    });
    notification.onclick = () => {
      try {
        window.focus();
        notification.close();
      } finally {
        dispatchImOpen({ conversationId });
      }
    };
  } catch {
    /* 桌面通知是锦上添花，任何失败都不能影响收消息 */
  }
}
