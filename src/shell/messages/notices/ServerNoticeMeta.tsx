"use client";

import type { NotificationItem } from "../../../api/notifications";
import { useUI } from "../../../i18n/ui/useUI";
import { SERVER_NOTICE_KIND, serverNoticeCount, serverNoticeIdentity } from "./server-notice";

export function ServerNoticeMeta({ item }: { item: NotificationItem }) {
  const tt = useUI();
  if (item.kind !== SERVER_NOTICE_KIND) return null;
  return (
    <span className="mt-1 block break-words text-[12px] text-black/60 dark:text-white/60" data-server-notice-meta="">
      <span>{serverNoticeIdentity(item)}</span>
      {item.meta?.level === "urgent" ? (
        <span className="ml-2 rounded-md bg-red-500 px-2 py-0.5 text-[11px] font-medium text-white" data-server-notice-urgent="">
          {tt("紧急")}
        </span>
      ) : null}
    </span>
  );
}

export function ServerNoticeCounts({ item }: { item: NotificationItem }) {
  const tt = useUI();
  if (item.kind !== SERVER_NOTICE_KIND) return null;
  const parts = [
    ["repeat", "重复 {n} 次"],
    ["suppressed", "已限流 {n} 条"],
    ["dropped", "本机队列已丢弃 {n} 条"],
  ].flatMap(([key, label]) => {
    const n = serverNoticeCount(item.meta?.[key]);
    return n ? [tt(label, { n })] : [];
  });
  return parts.length ? (
    <span className="mt-1 block text-[11px] text-black/40 dark:text-white/40" data-server-notice-counts="">
      {parts.join(" · ")}
    </span>
  ) : null;
}
