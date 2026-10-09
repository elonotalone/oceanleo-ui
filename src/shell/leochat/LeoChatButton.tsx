"use client";

// 左下角的 LeoChat 图标。LeoChat 还能从左侧边栏整页、对话右侧栏打开；一次只显示一处（host-state.toggleWindow）。
// 境内站与未登录不出现。
import { useEffect } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { useImEnabled } from "../../lib/im/client";
import { attachBayDeepLinks, useBayEnabled } from "../bay/shell/bay-state";
import { hostState, useMessagesHost } from "../messages/host-state";
import { ensureMessagesSurfaceStyles } from "../messages/messages-surface";
import { useImUnread } from "../messages/realtime/hooks";

export function LeoChatGlyph({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 4c4.7 0 8.5 3.2 8.5 7.2s-3.8 7.2-8.5 7.2c-.9 0-1.8-.1-2.6-.4L5 19.6l1-3.4C4.4 14.9 3.5 13.1 3.5 11.2 3.5 7.2 7.3 4 12 4z" />
      <path d="M8.6 11.2h.01M12 11.2h.01M15.4 11.2h.01" strokeWidth={2.4} />
    </svg>
  );
}

export function LeoChatButton({ className = "" }: { className?: string }) {
  const tt = useUI();
  const imOn = useImEnabled();
  const bayOn = useBayEnabled();
  const unread = useImUnread();
  const { open, surface } = useMessagesHost();
  const count = imOn ? unread?.total ?? 0 : 0;

  // 别的页面上的 `?bay=` 深链由 LeoBay 自己接（跳到 /bay），这里顺手挂上监听：每个页面都有这个图标。
  useEffect(() => (bayOn ? attachBayDeepLinks() : undefined), [bayOn]);
  useEffect(() => {
    ensureMessagesSurfaceStyles();
  }, []);

  if (!imOn) return null;

  const label = count > 0 ? tt("LeoChat：{n} 条新消息", { n: count }) : "LeoChat";

  return (
    <div className={`relative ${className}`} data-leochat-button>
      <button
        type="button"
        onClick={() => hostState().toggleWindow()}
        aria-label={label}
        aria-pressed={open}
        title={label}
        data-leochat-open={open ? "true" : "false"}
        data-leochat-surface={open ? surface : "none"}
        className="leo-tap-target relative flex items-center justify-center rounded-lg text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-100 hover:text-neutral-800"
      >
        <LeoChatGlyph />
        {count > 0 ? (
          <span data-leochat-badge className="absolute right-0.5 top-0.5 flex min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-4 text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
    </div>
  );
}
