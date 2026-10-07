"use client";

// 消息浮层的表面层：字阶、发丝线、进出场、会话推入。时长/曲线只用 --leo-* token。
// 注入一份 style（与 anchored-popover 同形），不进 globals.css（W01 独占面）。

import type { SVGProps } from "react";

export const MESSAGES_SURFACE_STYLE_ID = "leo-messages-surface";

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

export function ImBackIcon() {
  return (
    <Icon>
      <path d="M15 5l-7 7 7 7" />
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

export const MESSAGES_SURFACE_CSS = `
[data-testid="messages-overlay"] {
  --im-title: 13px;
  --im-body: 14px;
  --im-meta: 12px;
  background: #fff;
  color: #171717;
  box-shadow: 0 18px 50px rgba(15, 15, 15, 0.14), 0 0 0 1px rgba(15, 15, 15, 0.06);
  transform-origin: 0% 100%;
  transition:
    opacity var(--leo-dur-4) var(--leo-ease-decelerate),
    transform var(--leo-dur-4) var(--leo-ease-decelerate);
}
[data-testid="messages-overlay"][data-im-dragging="true"] {
  transition: none;
}
[data-testid="messages-overlay"][data-im-overlay-state="closed"] {
  opacity: 0;
  transform: scale(0.96) translateY(8px);
  pointer-events: none;
  transition-timing-function: var(--leo-ease-accelerate);
}
@starting-style {
  [data-testid="messages-overlay"][data-im-overlay-state="open"] {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
}
html.dark [data-testid="messages-overlay"] {
  background: var(--leo-d-card);
  color: var(--leo-d-fg);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--leo-d-border);
}

[data-testid="messages-overlay"] [data-im-drag-handle] {
  height: 44px;
  border-bottom-color: rgba(15, 15, 15, 0.06);
  user-select: none;
  -webkit-user-select: none;
}
html.dark [data-testid="messages-overlay"] [data-im-drag-handle] {
  border-bottom-color: var(--leo-d-border);
}
[data-im-chrome-btn] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: rgba(15, 15, 15, 0.45);
  background: transparent;
}
[data-im-chrome-btn]:hover {
  background: rgba(15, 15, 15, 0.05);
  color: #171717;
}
html.dark [data-im-chrome-btn] { color: var(--leo-d-muted); }
html.dark [data-im-chrome-btn]:hover { background: var(--leo-d-card-2); color: var(--leo-d-fg); }

[data-im-icon-tabs] {
  border-bottom-color: rgba(15, 15, 15, 0.06);
}
html.dark [data-im-icon-tabs] { border-bottom-color: var(--leo-d-border); }
[data-im-icon-tabs] [role="tab"] {
  color: rgba(15, 15, 15, 0.62);
  border-bottom: none;
}
[data-im-icon-tabs] [role="tab"] svg {
  width: 20px;
  height: 20px;
  stroke-width: 2;
}
[data-im-icon-tabs] [role="tab"][aria-selected="true"] {
  color: #0a0a0a;
  background: transparent;
}
[data-im-icon-tabs] [role="tab"][aria-selected="true"] svg {
  stroke-width: 2.45;
}
[data-im-icon-tabs] [role="tab"]:hover {
  background: rgba(15, 15, 15, 0.04);
  color: #0a0a0a;
}
html.dark [data-im-icon-tabs] [role="tab"] { color: rgba(255, 255, 255, 0.62); }
html.dark [data-im-icon-tabs] [role="tab"][aria-selected="true"],
html.dark [data-im-icon-tabs] [role="tab"]:hover { color: #fff; background: transparent; }

[data-im-view-body] {
  animation: im-view-in var(--leo-dur-3) var(--leo-ease-decelerate) both;
}
@keyframes im-view-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

[data-im-panes] {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
[data-im-pane] {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  transition:
    transform var(--leo-dur-4) var(--leo-ease-standard),
    opacity var(--leo-dur-3) var(--leo-ease-standard);
}
[data-im-pane="list"] { transform: translateX(0); opacity: 1; }
[data-im-pane="list"][data-im-pane-active="false"] {
  transform: translateX(-22%);
  opacity: 0;
  pointer-events: none;
}
[data-im-pane="detail"] {
  transform: translateX(100%);
  opacity: 0;
  pointer-events: none;
}
[data-im-pane="detail"][data-im-pane-active="true"] {
  transform: translateX(0);
  opacity: 1;
  pointer-events: auto;
}

[data-im-filter-row] [role="tab"] {
  background: transparent;
  color: rgba(15, 15, 15, 0.45);
  border-radius: 999px;
  font-size: var(--im-meta);
  font-weight: 500;
  padding: 4px 10px;
}
[data-im-filter-row] [role="tab"][aria-selected="true"] {
  background: rgba(15, 15, 15, 0.06);
  color: #171717;
}
html.dark [data-im-filter-row] [role="tab"] { color: var(--leo-d-muted); }
html.dark [data-im-filter-row] [role="tab"][aria-selected="true"] {
  background: var(--leo-d-card-2);
  color: var(--leo-d-fg);
}

[data-testid="inbox-row"][aria-current="true"] {
  background: rgba(15, 15, 15, 0.045);
}
html.dark [data-testid="inbox-row"][aria-current="true"] {
  background: var(--leo-d-card-2);
}
[data-im-unread] {
  min-width: 8px;
  height: 8px;
  padding: 0;
  background: #171717;
  color: transparent;
  font-size: 0;
  line-height: 0;
}
[data-im-unread][data-im-unread-count] {
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 5px;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.1rem;
}
html.dark [data-im-unread] { background: var(--leo-d-fg); color: transparent; }
html.dark [data-im-unread][data-im-unread-count] { color: var(--leo-d-bg); }

[data-im-composer] {
  border-top-color: rgba(15, 15, 15, 0.06);
  background: transparent;
}
[data-im-composer] textarea {
  border: none;
  background: rgba(15, 15, 15, 0.045);
  border-radius: 14px;
  box-shadow: none;
}
[data-im-composer] textarea:focus {
  border: none;
  outline: none;
  background: rgba(15, 15, 15, 0.06);
}
html.dark [data-im-composer] textarea {
  background: var(--leo-d-card-2);
  color: var(--leo-d-fg);
}
[data-im-send] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: #171717;
  color: #fff;
}
[data-im-send]:disabled {
  opacity: 0.18;
}
html.dark [data-im-send] {
  background: var(--leo-d-fg);
  color: var(--leo-d-bg);
}

[data-message-id][data-im-enter="own"] {
  animation: im-msg-own var(--leo-dur-3) var(--leo-ease-decelerate) both;
}
[data-message-id][data-im-enter="peer"] {
  animation: im-msg-peer var(--leo-dur-3) var(--leo-ease-decelerate) both;
}
@keyframes im-msg-own {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
@keyframes im-msg-peer {
  from { opacity: 0; transform: translateX(-6px); }
  to { opacity: 1; transform: none; }
}
[data-message-id][data-sending] { opacity: 0.55; }
[data-message-id]:hover { background: transparent; }

[data-search-hit] {
  background: transparent;
  color: inherit;
  font-weight: 600;
  padding: 0;
  border-radius: 0;
}

[data-im-privacy-banner] {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 8px 10px 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(15, 15, 15, 0.04);
  font-size: var(--im-meta);
  line-height: 1.45;
  color: rgba(15, 15, 15, 0.55);
}
html.dark [data-im-privacy-banner] {
  background: var(--leo-d-card-2);
  color: var(--leo-d-fg-2);
}

[data-im-record-dot] {
  width: 6px;
  height: 6px;
  border-radius: 99px;
  background: #dc2626;
  animation: im-record-pulse var(--leo-loop-pulse-dot) ease-in-out infinite;
}
@keyframes im-record-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
  [data-testid="messages-overlay"],
  [data-im-pane],
  [data-im-pane="list"][data-im-pane-active="false"],
  [data-im-view-body],
  [data-message-id][data-im-enter="own"],
  [data-message-id][data-im-enter="peer"],
  [data-im-record-dot] {
    animation: none;
    transition: none;
  }
}
`;

export function ensureMessagesSurfaceStyles(doc?: Document): void {
  const target = doc ?? (typeof document === "undefined" ? null : document);
  if (!target) return;
  let style = target.getElementById(MESSAGES_SURFACE_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = target.createElement("style");
    style.id = MESSAGES_SURFACE_STYLE_ID;
    (target.head || target.documentElement).append(style);
  }
  if (style.textContent !== MESSAGES_SURFACE_CSS) style.textContent = MESSAGES_SURFACE_CSS;
}
