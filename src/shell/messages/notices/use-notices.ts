"use client";

// 平台通知仓的浏览器接线与 React 钩子。每个标签页一份（模块级单例），所有出现 LeoChat 的地方读的是同一份：
// 小窗、整页、右侧栏、侧栏图标、标签页标题。境内外同一条代码路径，不按域名家族分叉。
import { useEffect, useSyncExternalStore } from "react";
import { listNotifications, markNotificationsRead } from "../../../api/notifications";
import { useImUnread } from "../realtime/hooks";
import { EMPTY_LEOCHAT_UNREAD, leoChatUnread, type LeoChatUnread } from "./notice-unread";
import { createNoticeStore, emptyNoticeState, type NoticeState, type NoticeStore } from "./notice-store";

let singleton: NoticeStore | null = null;

/** 本标签页的通知仓。 */
export function noticeStore(): NoticeStore {
  if (!singleton) {
    singleton = createNoticeStore({
      list: (limit) => listNotifications(limit),
      markRead: (ids) => markNotificationsRead(ids),
      now: () => Date.now(),
      setTimer(fn, ms) {
        const handle = setTimeout(fn, ms) as unknown;
        // 浏览器里是数字；Node（测试、SSR）里 unref，免得 60 秒的轮询计时器拖住进程退出。
        if (typeof handle === "object" && handle !== null && "unref" in handle) (handle as { unref(): void }).unref();
        return handle;
      },
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      isHidden: () => typeof document !== "undefined" && document.hidden,
      onVisible(handler) {
        if (typeof document === "undefined") return () => {};
        const listener = () => {
          if (!document.hidden) handler();
        };
        document.addEventListener("visibilitychange", listener);
        return () => document.removeEventListener("visibilitychange", listener);
      },
    });
  }
  return singleton;
}

const SERVER_STATE: NoticeState = emptyNoticeState();

/**
 * 通知状态。`enabled` = 已登录（与 LeoChat 同一个开关）：开着就登记一个轮询使用方，
 * 没开（登出）就清空，下一位账号看不到上一位的通知。
 */
export function useNoticeState(enabled: boolean): NoticeState {
  const store = noticeStore();
  const state = useSyncExternalStore(store.subscribe, store.getState, () => SERVER_STATE);
  useEffect(() => {
    if (!enabled) {
      store.reset();
      return undefined;
    }
    return store.acquire();
  }, [enabled, store]);
  return enabled ? state : SERVER_STATE;
}

/** 只为让轮询活着（全局宿主用）：不订阅状态，不引起重渲染。 */
export function useNoticePolling(enabled: boolean): void {
  useEffect(() => {
    const store = noticeStore();
    if (!enabled) {
      store.reset();
      return undefined;
    }
    return store.acquire();
  }, [enabled]);
}

/** 入口角标 / 「聊天」标签 / 联系人标签用的未读（会话 + 通知）。 */
export function useLeoChatUnread(enabled: boolean): LeoChatUnread {
  const im = useImUnread();
  const notices = useNoticeState(enabled);
  if (!enabled) return EMPTY_LEOCHAT_UNREAD;
  return leoChatUnread(im, notices.unread);
}
