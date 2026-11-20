"use client";

// 收件箱行与最上方「通知」行共用的外观（侧栏同一种圆角行）与未读角标。
/** 收件箱行、「通知」行共用：侧栏同一种圆角行，选中是 `bg-stone-200/80` 的底色（没有左侧竖条）。 */
export const INBOX_ROW =
  "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300";
export const INBOX_ROW_IDLE = "hover:bg-stone-200/50";
export const INBOX_ROW_SELECTED = "bg-stone-200/80";

/** 头像右上角的未读数：会话 1 条是一个小圆点（`dotForOne`），多条是数字；「通知」行总是数字。 */
export function UnreadBadge({ count, label, muted = false, dotForOne = true }: { count: string; label: string; muted?: boolean; dotForOne?: boolean }) {
  const dot = dotForOne && count === "1";
  return (
    <span
      data-im-unread=""
      data-im-unread-count={dot ? undefined : count}
      aria-label={label}
      className={`absolute -right-0.5 -top-0.5 flex items-center justify-center rounded-full bg-stone-900 text-white ${
        dot ? "h-2.5 w-2.5" : "h-4 min-w-4 px-1 text-[10px] font-medium leading-none"
      } ${muted ? "opacity-40" : ""}`}
    >
      {dot ? "" : count}
    </span>
  );
}
