"use client";

// 侧栏「消息」的图标 + 未读角标。不用 SVG 渐变引用：View Transition 会复制 DOM，
// 和其它侧栏图标一样用实色填充，切页时才不会空白一拍。
import { type ReactNode } from "react";
import { useImUnread } from "./realtime/hooks";
import { formatBadge } from "./realtime/store";

function BubbleIcon({ className = "h-4 w-4" }: { className?: string }): ReactNode {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.4a.6.6 0 0 1-1-.47V16h-.3A2.5 2.5 0 0 1 4 13.5z" />
      <path d="M8.5 9.5h7M8.5 12.5h4.5" />
    </svg>
  );
}

export function MessagesNavIcon({ className }: { className?: string }) {
  const unread = useImUnread();
  const total = unread?.total ?? 0;
  const mentions = unread?.mentions ?? 0;
  const label = formatBadge(total);
  return (
    <span className="relative inline-flex">
      <BubbleIcon className={className} />
      {label ? (
        <span
          data-testid="messages-nav-badge"
          data-mentions={mentions > 0 ? "true" : "false"}
          className={`absolute -right-2 -top-1.5 min-w-[1rem] rounded-full px-1 text-center text-[10px] font-semibold leading-4 ${
            mentions > 0 ? "bg-red-500 text-white" : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          }`}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
