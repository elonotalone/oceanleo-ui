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

/** LeoChat 的标志：一块渐变圆角方块里的对话气泡。顶栏、放大后的空白处用。 */
export function LeoChatMark({ large = false }: { large?: boolean }) {
  return (
    <span data-leochat-mark={large ? "large" : "small"} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4.5c4.4 0 8 2.9 8 6.6s-3.6 6.6-8 6.6c-.9 0-1.7-.1-2.5-.3L5.6 19l.9-3.1C5 14.7 4 13 4 11.1 4 7.4 7.6 4.5 12 4.5z" />
        <path d="M9 11.1h.01M12 11.1h.01M15 11.1h.01" strokeWidth={2.6} />
      </svg>
    </span>
  );
}

export const MESSAGES_SURFACE_CSS = `
:root {
  --im-accent: #5b5bf6;
  --im-accent-2: #3b82f6;
  --im-accent-soft: rgba(91, 91, 246, 0.10);
  --im-gradient: linear-gradient(135deg, #7c5cff 0%, #5b5bf6 45%, #3b82f6 100%);
}
[data-leochat-mark] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  background: var(--im-gradient);
  color: #fff;
  box-shadow: 0 4px 12px rgba(91, 91, 246, 0.35);
}
[data-leochat-mark] svg { width: 16px; height: 16px; }
[data-leochat-mark="large"] {
  width: 64px;
  height: 64px;
  border-radius: 22px;
  box-shadow: 0 14px 32px rgba(91, 91, 246, 0.35);
}
[data-leochat-mark="large"] svg { width: 34px; height: 34px; }
[data-leochat-badge] {
  background: var(--im-gradient);
  box-shadow: 0 0 0 2px #fff;
}
html.dark [data-leochat-badge] { box-shadow: 0 0 0 2px var(--leo-d-bg); }
[data-leochat-open="true"] { color: var(--im-accent); background: var(--im-accent-soft); }

[data-testid="messages-overlay"] {
  --im-title: 13px;
  --im-body: 14px;
  --im-meta: 12px;
  background: #fff;
  color: #171717;
  box-shadow:
    0 32px 80px rgba(30, 27, 75, 0.22),
    0 8px 24px rgba(30, 27, 75, 0.10),
    0 0 0 1px rgba(30, 27, 75, 0.06);
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
  height: 52px;
  border-bottom-color: rgba(30, 27, 75, 0.07);
  background: linear-gradient(180deg, rgba(91, 91, 246, 0.06) 0%, rgba(91, 91, 246, 0) 100%);
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
  width: 30px;
  height: 30px;
  border-radius: 10px;
  color: rgba(15, 15, 15, 0.5);
  background: transparent;
}
[data-im-chrome-btn]:hover {
  background: rgba(15, 15, 15, 0.05);
  color: #171717;
}
html.dark [data-im-chrome-btn] { color: var(--leo-d-muted); }
html.dark [data-im-chrome-btn]:hover { background: var(--leo-d-card-2); color: var(--leo-d-fg); }

[data-im-tabs] {
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: rgba(30, 27, 75, 0.06);
}
[data-im-tabs] [role="tab"] {
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  color: rgba(15, 15, 15, 0.55);
  transition:
    background var(--leo-dur-2) var(--leo-ease-standard),
    color var(--leo-dur-2) var(--leo-ease-standard),
    box-shadow var(--leo-dur-2) var(--leo-ease-standard);
}
[data-im-tabs] [role="tab"]:hover { color: #171717; }
[data-im-tabs] [role="tab"][aria-selected="true"] {
  background: #fff;
  color: var(--im-accent);
  box-shadow: 0 1px 4px rgba(30, 27, 75, 0.14);
}
[data-im-tab-badge] {
  min-width: 16px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--im-gradient);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}
html.dark [data-im-tabs] { background: var(--leo-d-card-2); }
html.dark [data-im-tabs] [role="tab"] { color: var(--leo-d-muted); }
html.dark [data-im-tabs] [role="tab"][aria-selected="true"] {
  background: var(--leo-d-card);
  color: #a5b4fc;
}

[data-im-side] {
  background: #fafaff;
  border-right-color: rgba(30, 27, 75, 0.07);
}
html.dark [data-im-side] { background: transparent; }
[data-im-empty] { color: #171717; }
html.dark [data-im-empty] { color: var(--leo-d-fg); }

[data-testid="messages-overlay"] [data-leochat-search] {
  border-radius: 999px;
  background: rgba(30, 27, 75, 0.05);
  padding-left: 14px;
}
[data-testid="messages-overlay"] [data-leochat-toolbar] { padding: 10px 10px 2px; gap: 8px; }
[data-testid="messages-overlay"] [data-leochat-plus] {
  border-radius: 999px;
  background: var(--im-gradient);
  color: #fff;
  box-shadow: 0 4px 12px rgba(91, 91, 246, 0.30);
}
[data-testid="messages-overlay"] [data-leochat-plus]:hover { filter: brightness(1.06); }

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
  background: var(--im-accent-soft);
  color: var(--im-accent);
}
html.dark [data-im-filter-row] [role="tab"] { color: var(--leo-d-muted); }
html.dark [data-im-filter-row] [role="tab"][aria-selected="true"] {
  background: var(--leo-d-card-2);
  color: var(--leo-d-fg);
}

[data-testid="inbox-row"] {
  width: calc(100% - 12px);
  margin: 1px 6px;
  border-radius: 14px;
  transition: background var(--leo-dur-2) var(--leo-ease-standard);
}
[data-testid="inbox-row"]:hover { background: rgba(30, 27, 75, 0.045); }
[data-testid="inbox-row"][aria-current="true"] {
  background: var(--im-accent-soft);
  box-shadow: inset 3px 0 0 var(--im-accent);
}
html.dark [data-testid="inbox-row"][aria-current="true"] {
  background: var(--leo-d-card-2);
}
[data-im-unread] {
  min-width: 8px;
  height: 8px;
  padding: 0;
  background: var(--im-gradient);
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
html.dark [data-im-unread] { color: transparent; }
html.dark [data-im-unread][data-im-unread-count] { color: #fff; }

[data-im-composer] {
  border-top-color: rgba(15, 15, 15, 0.06);
  background: transparent;
}
[data-im-composer] textarea {
  border: none;
  background: rgba(30, 27, 75, 0.05);
  border-radius: 18px;
  box-shadow: none;
  transition: box-shadow var(--leo-dur-2) var(--leo-ease-standard), background var(--leo-dur-2) var(--leo-ease-standard);
}
[data-im-composer] textarea:focus {
  border: none;
  outline: none;
  background: #fff;
  box-shadow: 0 0 0 2px var(--im-accent-soft), 0 0 0 1px var(--im-accent);
}
html.dark [data-im-composer] textarea {
  background: var(--leo-d-card-2);
  color: var(--leo-d-fg);
}
[data-im-send] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: var(--im-gradient);
  color: #fff;
  box-shadow: 0 4px 12px rgba(91, 91, 246, 0.30);
}
[data-im-send]:disabled {
  opacity: 0.18;
}
[data-im-send]:disabled { box-shadow: none; }

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
