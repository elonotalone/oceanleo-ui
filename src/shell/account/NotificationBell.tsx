"use client";

// 站内通知铃铛。父 agent 负责把它挂进门户布局，这里只负责组件本身。
//
// 存在的理由很具体：项目邀请此前是静默的——数据库里躺着一行 pending，没有任何人被告知。
// 熟人之间还能在微信上补一句，真人协作站里两个陌生人之间，没人告诉就等于没发生。
// 只轮询未读数（60 秒一次），下拉打开时才拉列表：铃铛常驻在布局里，不能每分钟拉 50 行。
//
// 2026-09-21：面板必须 portal 到 document.body 并用 position:fixed 往上弹。侧栏是
// h-screen overflow-hidden，原先 absolute top-10 往下弹会整块掉出可视区。

import { useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { currentDomainProfile } from "../../contracts/domain-family";

import {
  listNotifications,
  markNotificationsRead,
  notificationUnreadCount,
  type NotificationItem,
} from "../../api/notifications";
import { AnchoredFixedPopover } from "./AnchoredFixedPopover";

function IconBell({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9ZM10 21h4" /></svg>;
}

const COUNT_POLL_MS = 60000;

function messageTime(value: string | null | undefined): string {
  if (!value) return "";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "";
  const now = new Date();
  return at.toDateString() === now.toDateString()
    ? at.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : at.toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function NotificationBell({ className = "" }: { className?: string }) {
  const tt = useUI();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const refreshCount = useCallback(async () => {
    const result = await notificationUnreadCount();
    if (result.ok && result.data) setUnread(result.data.unread_count);
  }, []);

  useEffect(() => {
    void refreshCount();
    const timer = setInterval(() => void refreshCount(), COUNT_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshCount]);

  const closePanel = useCallback((reason: "escape" | "outside") => {
    setOpen(false);
    if (reason === "escape") buttonRef.current?.focus();
  }, []);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setLoading(true);
    const result = await listNotifications(20);
    setLoading(false);
    if (result.ok && result.data) {
      setItems(result.data.items);
      setUnread(result.data.unread_count);
    }
  };

  const openItem = async (item: NotificationItem) => {
    setOpen(false);
    if (!item.read_at) {
      await markNotificationsRead([item.id]);
      setUnread((current) => Math.max(0, current - 1));
    }
    if (item.link) window.location.href = item.link.startsWith("/") ? `${currentDomainProfile().portalOrigin}${item.link}` : item.link;
  };

  const readAll = async () => {
    const result = await markNotificationsRead();
    if (!result.ok) return;
    setUnread(result.data?.unread_count ?? 0);
    setItems((current) =>
      current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })),
    );
  };

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => void toggle()}
        aria-label={tt("通知")}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800"
      >
        <IconBell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      <AnchoredFixedPopover
        open={open}
        anchorRef={buttonRef}
        onClose={closePanel}
        width={320}
        className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
      >
        <div data-oceanleo-notification-panel>
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
            <span className="text-[13px] font-medium text-neutral-800">{tt("通知")}</span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void readAll()}
                className="text-[11px] text-neutral-500 transition hover:text-neutral-800"
              >
                {tt("全部标记已读")}
              </button>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-6 text-center text-[12px] text-neutral-400">{tt("加载中…")}</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-neutral-400">
                {tt("还没有通知")}
              </p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openItem(item)}
                  className={`block w-full border-b border-neutral-50 px-3 py-2.5 text-left transition hover:bg-neutral-50 ${
                    item.read_at ? "" : "bg-blue-50/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-[13px] text-neutral-800">
                      {item.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-neutral-400">
                      {messageTime(item.created_at)}
                    </span>
                  </div>
                  {item.body ? (
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-neutral-500">
                      {item.body}
                    </p>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      </AnchoredFixedPopover>
    </div>
  );
}

export default NotificationBell;
