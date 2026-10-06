"use client";

// 侧栏「消息」的图标 + 未读角标。图标是自带的内联 SVG（风格同 shell/icons.tsx：柔和渐变底 + currentColor 描边）。
import type { ReactNode } from "react";
import { useImUnread } from "./realtime/hooks";

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
      <defs>
        <linearGradient id="lgi-messages" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.4a.6.6 0 0 1-1-.47V16h-.3A2.5 2.5 0 0 1 4 13.5z" fill="url(#lgi-messages)" fillOpacity="0.22" />
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.4a.6.6 0 0 1-1-.47V16h-.3A2.5 2.5 0 0 1 4 13.5z" />
      <path d="M8.5 9.5h7M8.5 12.5h4.5" />
    </svg>
  );
}

export function formatBadge(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "";
  return count > 99 ? "99+" : String(Math.floor(count));
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
          className={`absolute -right-2 -top-1.5 min-w-[1rem] rounded-full px-1 text-center text-[10px] font-semibold leading-4 text-white ${
            mentions > 0 ? "bg-red-500" : "bg-sky-500"
          }`}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
