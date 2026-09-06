"use client";

// 统一提示胶囊。改造前有四种写法：陈列馆的 gallery-error、网站的琥珀 banner、
// 视频画布的 degraded banner、WorkbenchErrorBoundary；规范 v1 时它还是画布顶部的一条通栏。
// 规范 v2 §1：画布区顶部**不允许再画任何通栏**，提示走这里，画在画布左下角的小胶囊里，
// 不遮内容、不占整行。宿主决定落点（`InlineAdvancedWorkbenchShell` 把它 absolute 到
// 舞台左下角，与右下角缩放控件同高）；本组件只画胶囊本身。

import { useUI } from "../../i18n/ui/useUI";
import type { AdvancedEditorNotice } from "../advanced-editor-adapter";
import type { PluginChromeNotice } from "./types";

type NoticeTone = PluginChromeNotice["tone"];

const TONE_CLASS: Record<NoticeTone, string> = {
  info: "border-[var(--pchrome-line,var(--awb-border,#e7e5e4))] bg-[var(--pchrome-surface,var(--awb-popover-bg,#fff))] text-[var(--pchrome-ink-mid,var(--awb-muted,#57534e))]",
  warn: "border-[var(--pchrome-warn-line,color-mix(in_srgb,var(--awb-warn,#d97706)_35%,transparent))] bg-[var(--pchrome-warn-soft,color-mix(in_srgb,var(--awb-warn,#d97706)_10%,var(--awb-popover-bg,#fff)))] text-[var(--pchrome-warn,var(--awb-warn,#d97706))]",
  error:
    "border-[var(--pchrome-danger-line,color-mix(in_srgb,var(--awb-danger,#dc2626)_35%,transparent))] bg-[var(--pchrome-danger-soft,color-mix(in_srgb,var(--awb-danger,#dc2626)_10%,var(--awb-popover-bg,#fff)))] text-[var(--pchrome-danger,var(--awb-danger,#dc2626))]",
};

/** 两种申报形状都收：适配器的 `notices`（text / severity）与 chrome 的 `PluginChromeNotice`（message / tone / detail）。 */
export type PluginChromeNoticeInput = PluginChromeNotice | AdvancedEditorNotice;

function normalize(notice: PluginChromeNoticeInput): {
  id: string;
  tone: NoticeTone;
  message: string;
  detail?: string;
} {
  if ("message" in notice) {
    return {
      id: notice.id,
      tone: notice.tone,
      message: notice.message,
      detail: notice.detail,
    };
  }
  return {
    id: notice.id,
    tone: notice.severity ?? "info",
    message: notice.text,
  };
}

export function PluginChromeNotices({
  notices,
}: {
  notices: readonly PluginChromeNoticeInput[];
}) {
  const tt = useUI();
  if (!notices.length) return null;
  return (
    <div
      data-plugin-chrome-notices
      // 一列胶囊、左对齐、宽度随内容；`pointer-events-none` 让它永远不挡住下面的画布。
      className="pointer-events-none flex max-w-[min(28rem,calc(100%-1.5rem))] flex-col items-start gap-1"
    >
      {notices.map((raw) => {
        const notice = normalize(raw);
        return (
          <div
            key={notice.id}
            role={notice.tone === "error" ? "alert" : "status"}
            data-plugin-chrome-notice={notice.id}
            data-tone={notice.tone}
            className={`pointer-events-auto inline-flex max-w-full items-baseline gap-2 rounded-full border px-3 py-1 text-[11px] leading-4 shadow-sm ${TONE_CLASS[notice.tone]}`}
          >
            <span className="min-w-0 truncate font-semibold">
              {tt(notice.message)}
            </span>
            {notice.detail && (
              <span className="min-w-0 truncate opacity-80">
                {tt(notice.detail)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
