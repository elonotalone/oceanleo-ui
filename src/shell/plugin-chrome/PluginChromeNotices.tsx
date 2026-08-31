"use client";

// 统一降级条。改造前有四种写法：陈列馆的 gallery-error、网站的琥珀 banner、
// 视频画布的 degraded banner、WorkbenchErrorBoundary。宿主能力是分阶段注入的，
// 降级条会长期存在，所以必须只有一种长相。

import type { PluginChromeNotice } from "./types";

const TONE_CLASS: Record<PluginChromeNotice["tone"], string> = {
  info: "border-[var(--pchrome-line)] bg-[var(--pchrome-muted)] text-[var(--pchrome-ink-mid)]",
  warn: "border-[var(--pchrome-warn-line)] bg-[var(--pchrome-warn-soft)] text-[var(--pchrome-warn)]",
  error:
    "border-[var(--pchrome-danger-line)] bg-[var(--pchrome-danger-soft)] text-[var(--pchrome-danger)]",
};

export function PluginChromeNotices({
  notices,
}: {
  notices: readonly PluginChromeNotice[];
}) {
  if (!notices.length) return null;
  return (
    <div
      data-plugin-chrome-notices
      className="flex shrink-0 flex-col gap-px border-b border-[var(--pchrome-line)]"
    >
      {notices.map((notice) => (
        <div
          key={notice.id}
          role={notice.tone === "error" ? "alert" : "status"}
          data-plugin-chrome-notice={notice.id}
          data-tone={notice.tone}
          className={`flex items-baseline gap-2 border-l-2 px-3 py-1.5 text-[11px] leading-4 ${TONE_CLASS[notice.tone]}`}
        >
          <span className="font-semibold">{notice.message}</span>
          {notice.detail && (
            <span className="min-w-0 flex-1 truncate opacity-80">
              {notice.detail}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
