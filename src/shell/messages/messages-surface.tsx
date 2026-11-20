"use client";

// LeoChat 共用的线条图标。2026-11-21 起这里不再注入任何样式表：每个节点用任务页那一套 Tailwind 类自己画
// （stone 色、rounded-lg 图标键、深色走全局 html.dark 层），没有私有强调色，也没有属性选择器。

import type { SVGProps } from "react";

const svg = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-4 w-4",
  "aria-hidden": true,
};

function Icon(props: SVGProps<SVGSVGElement>) {
  return <svg {...svg} {...props} />;
}

export function ImCloseIcon() {
  return (
    <Icon>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Icon>
  );
}

export function ImOpenPageIcon() {
  return (
    <Icon>
      <path d="M14 5h5v5M19 5l-8 8M11 6H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-4" />
    </Icon>
  );
}

export function ImExpandIcon() {
  return (
    <Icon>
      <path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5" />
    </Icon>
  );
}

export function ImCollapseIcon() {
  return (
    <Icon>
      <path d="M9 4v5H4M15 4v5h5M4 15h5v5M20 15h-5v5" />
    </Icon>
  );
}

export function ImPlusIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function ImSendIcon() {
  return (
    <Icon>
      <path d="M5 12h12M13 7l5 5-5 5" />
    </Icon>
  );
}

export function ImInfoIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </Icon>
  );
}

export function ImSearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </Icon>
  );
}

export function ImQuoteIcon() {
  return (
    <Icon>
      <path d="M5 18h9a4 4 0 0 0 4-4V7H12v7h4M5 18V7h4" />
    </Icon>
  );
}

export function ImThreadIcon() {
  return (
    <Icon>
      <path d="M6 7h12M6 12h8M6 17h5" />
    </Icon>
  );
}

export function ImMoreIcon() {
  return (
    <Icon>
      <circle cx="6" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function ImEmojiIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 10h.01M15.5 10h.01M8.5 14.5c1 1.4 2.4 2.1 3.5 2.1s2.5-.7 3.5-2.1" />
    </Icon>
  );
}

/** LeoChat 的标志：一块浅石色圆角方块里的对话气泡（与任务页同一套颜色，不另起深色强调色）。顶栏、放大后的空白处用。 */
export function LeoChatMark({ large = false }: { large?: boolean }) {
  return (
    <span
      data-leochat-mark={large ? "large" : "small"}
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center bg-stone-100 text-stone-700 ${
        large ? "h-16 w-16 rounded-2xl [&>svg]:h-8 [&>svg]:w-8" : "h-7 w-7 rounded-lg [&>svg]:h-4 [&>svg]:w-4"
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4.5c4.4 0 8 2.9 8 6.6s-3.6 6.6-8 6.6c-.9 0-1.7-.1-2.5-.3L5.6 19l.9-3.1C5 14.7 4 13 4 11.1 4 7.4 7.6 4.5 12 4.5z" />
        <path d="M9 11.1h.01M12 11.1h.01M15 11.1h.01" strokeWidth={2.6} />
      </svg>
    </span>
  );
}

/** 头部的图标键：与任务页 `HEADER_ICON_BUTTON_CLASS` 同一套（rounded-lg p-1.5、stone、按下微缩）。 */
export const LEOCHAT_ICON_BUTTON =
  "inline-flex shrink-0 items-center justify-center rounded-lg p-1.5 text-stone-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-100 hover:text-stone-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300";
