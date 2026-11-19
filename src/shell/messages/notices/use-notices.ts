"use client";

// 平台通知仓的浏览器接线与 React 钩子。每个标签页一份（模块级单例），所有出现 LeoChat 的地方读的是同一份：
// 小窗、整页、右侧栏、侧栏图标、标签页标题。境内外同一条代码路径，不按域名家族分叉。
import { useEffect, useSyncExternalStore } from "react";
import { listNotifications, markNotificationsRead, notificationBadges } from "../../../api/notifications";
import { useImUnread } from "../realtime/hooks";
import { EMPTY_LEOCHAT_UNREAD, leoChatUnread, type LeoChatUnread } from "./notice-unread";
import { noticesChanged, NOTICES_CHANGED, useNoticeResource } from "./use-notice-resource";
import { createNoticeStore, emptyNoticeState, type NoticeState, type NoticeStore } from "./notice-store";

const stores = new Map<string, NoticeStore>();
let selectedSection: string | undefined;
export function activeNoticeSection(): string | undefined { return selectedSection; }
export function selectNoticeSection(section: string | undefined): void { selectedSection = section; }

/** 本标签页的通知仓。 */
export function noticeStore(section?: string): NoticeStore {
  const key = section ?? "";
  let store = stores.get(key);
  if (!store) {
    store = createNoticeStore({
      list: (limit) => listNotifications(limit, section),
      async markRead(ids) {
        const result = await markNotificationsRead(ids, section);
        noticesChanged();
        return result;
      },
      now: () => Date.now(),
      setTimer(fn, ms) {
        const handle = setTimeout(fn, ms) as unknown;
        // 浏览器里是数字；Node（测试、SSR）里 unref，免得 60 秒的轮询计时器拖住进程退出。
        if (typeof handle === "object" && handle !== null && "unref" in handle) (handle as { unref(): void }).unref();
        return handle;
      },
      clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      isHidden: () => typeof document !== "undefined" && (document.hidden || navigator.onLine === false),
      onVisible(handler) {
        if (typeof document === "undefined") return () => {};
        const listener = () => {
          if (!document.hidden) handler();
        };
        document.addEventListener("visibilitychange", listener);
        window.addEventListener("online", listener);
        window.addEventListener("focus", listener);
        window.addEventListener(NOTICES_CHANGED, listener);
        return () => {
          document.removeEventListener("visibilitychange", listener);
          window.removeEventListener("online", listener);
          window.removeEventListener("focus", listener);
          window.removeEventListener(NOTICES_CHANGED, listener);
        };
      },
    });
    stores.set(key, store);
  }
  return store;
}

const SERVER_STATE: NoticeState = emptyNoticeState();

/**
 * 通知状态。`enabled` = 已登录（与 LeoChat 同一个开关）：开着就登记一个轮询使用方，
 * 没开（登出）就清空，下一位账号看不到上一位的通知。
 */
export function useNoticeState(enabled: boolean, section?: string): NoticeState {
  const store = noticeStore(section);
  const state = useSyncExternalStore(store.subscribe, store.getState, () => SERVER_STATE);
  useEffect(() => {
    if (!enabled) {
      for (const cached of stores.values()) cached.reset();
      selectedSection = undefined;
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
      for (const cached of stores.values()) cached.reset();
      selectedSection = undefined;
      return undefined;
    }
    return store.acquire();
  }, [enabled]);
}

/** Independent message and notification counts; message requests are included by /v1/badges. */
export function useLeoChatUnread(enabled: boolean): LeoChatUnread {
  const im = useImUnread();
  const notices = useNoticeState(enabled);
  const badges = useNoticeResource(enabled, notificationBadges);
  if (!enabled) return EMPTY_LEOCHAT_UNREAD;
  return leoChatUnread(
    { total: badges?.data?.sections.chat ?? im?.total, requests: im?.requests },
    badges?.data?.sections.notices ?? notices.unread,
  );
}
