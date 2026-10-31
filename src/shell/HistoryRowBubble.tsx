"use client";

// ============================================================================
// 「我的任务」行悬停气泡（Manus 式，2026-10-31）
// ----------------------------------------------------------------------------
// 侧栏任务行只显示一行截断的任务名；悬停（~300 ms）或键盘聚焦时，在行右侧弹出
// 白底细边圆角阴影的浮层：完整任务名（可换行）+ 时间（今天 = 钟点，其余 = 短日期，
// 按页面语言、用户本地时区）。浮层 portal 到 body，不被侧栏的 overflow 裁掉；
// 移开 / 失焦 / 滚动即收。纯展示，不可交互（pointer-events-none）。
// ============================================================================

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { formatHistoryTime } from "./history-model";

export const HISTORY_BUBBLE_DELAY_MS = 300;
const BUBBLE_GAP = 8;
const VIEWPORT_MARGIN = 8;
const BUBBLE_MAX_WIDTH = 320;

function pageLocale(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const lang = document.documentElement.getAttribute("lang") || "";
  if (lang) return lang;
  return typeof navigator !== "undefined" ? navigator.language : undefined;
}

/**
 * Hover/focus state for one row. Spread `rowProps` on the row element, put
 * `describedBy` on its focusable title, and render `bubble` anywhere inside.
 */
export function useHistoryRowBubble({
  title,
  timestamp,
  disabled = false,
}: {
  title: string;
  timestamp: string;
  disabled?: boolean;
}) {
  const id = `history-bubble-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const rowRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef(0);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);

  const hide = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
    setAnchor(null);
  }, []);

  const show = useCallback(() => {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const node = rowRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      setAnchor({ left: rect.right + BUBBLE_GAP, top: rect.top + rect.height / 2 });
    }, HISTORY_BUBBLE_DELAY_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  useEffect(() => {
    if (disabled) hide();
  }, [disabled, hide]);
  // Its position is a snapshot of the row; any scroll makes it stale — just close.
  useEffect(() => {
    if (!anchor) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [anchor, hide]);

  const rowProps = {
    ref: rowRef,
    onMouseEnter: () => {
      if (!disabled) show();
    },
    onMouseLeave: hide,
    onFocus: () => {
      if (!disabled) show();
    },
    onBlur: hide,
  };

  const open = Boolean(anchor) && !disabled;
  const bubble =
    open && anchor && typeof document !== "undefined"
      ? createPortal(
          <HistoryRowBubble id={id} title={title} timestamp={timestamp} left={anchor.left} top={anchor.top} />,
          document.body,
        )
      : null;

  return { rowProps, bubble, describedBy: open ? id : undefined, open };
}

/**
 * The row container of one My Tasks entry. `children` receives the bubble id
 * for `aria-describedby` on the row's focusable title while the bubble shows.
 */
export function HistoryRowFrame({
  title,
  timestamp,
  disabled,
  className,
  children,
}: {
  title: string;
  timestamp: string;
  disabled?: boolean;
  className: string;
  children: (describedBy: string | undefined) => ReactNode;
}) {
  const { rowProps, bubble, describedBy } = useHistoryRowBubble({ title, timestamp, disabled });
  return (
    <div {...rowProps} className={className} data-history-row-frame="">
      {children(describedBy)}
      {bubble}
    </div>
  );
}

export function HistoryRowBubble({
  id,
  title,
  timestamp,
  left,
  top,
}: {
  id: string;
  title: string;
  timestamp: string;
  left: number;
  top: number;
}) {
  const time = formatHistoryTime(timestamp, new Date(), pageLocale());
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0;
  const maxWidth = viewportWidth
    ? Math.max(160, Math.min(BUBBLE_MAX_WIDTH, viewportWidth - left - VIEWPORT_MARGIN))
    : BUBBLE_MAX_WIDTH;
  const style: CSSProperties = { left, top, maxWidth, transform: "translateY(-50%)" };
  return (
    <div
      id={id}
      role="tooltip"
      data-history-bubble=""
      style={style}
      className="pointer-events-none fixed z-[200] flex items-start gap-3 rounded-xl border border-neutral-200/80 bg-white px-3 py-2 text-neutral-800 shadow-[0_8px_32px_rgba(0,0,0,0.14)] dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100"
    >
      <span data-history-bubble-title="" className="min-w-0 whitespace-normal break-words text-[13px] leading-5">
        {title}
      </span>
      {time ? (
        <time
          data-history-bubble-time=""
          dateTime={timestamp}
          className="shrink-0 whitespace-nowrap pt-px text-[12px] leading-5 text-neutral-400"
        >
          {time}
        </time>
      ) : null}
    </div>
  );
}
