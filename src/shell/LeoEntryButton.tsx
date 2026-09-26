"use client";

import { useId, type MouseEvent, type ReactElement } from "react";
import {
  openLeoAssistant,
  useLeoEnabled,
  type LeoContext,
} from "./LeoAssistant";
import { useUI } from "../i18n/ui/useUI";

export type { LeoContext };

// ============================================================================
// @oceanleo/ui — ✦ leo 入口按钮（全站唯一样子，合同 I5 / W5B）
// ----------------------------------------------------------------------------
// leo 的入口只有这一个样子：输入框左下角的 ✦ leo 按钮。首页输入框、任务页
// 对话框输入框、Shell 页对话框输入框——三处都渲染本组件，任何页面都没有
// 悬浮气泡。点击 → openLeoAssistant({ toggle, source:"input", anchor, context })：
// 面板从按钮上方弹出（底边在输入框上方 8px，右对齐按钮），永不盖住发送键。
//
// tone：按钮所在的输入框是浅色卡片用 "light"（深色文字），Shell 对话框那种
// 深色底用 "dark"（浅色文字）。
// ============================================================================

export function LeoEntryButton({
  tone,
  context,
  className = "",
}: {
  tone: "light" | "dark";
  context: LeoContext;
  className?: string;
}): ReactElement | null {
  const tt = useUI();
  // leo 总开关（/general 可关，默认开）：关闭时三处输入框都不渲染这颗按钮。
  const enabled = useLeoEnabled();
  // useId 在 SSR 与首次水合时同值，也让同页各按钮的 SVG 渐变引用互不冲突。
  const gradientId = `leo-entry-g-${useId()}`;

  if (!enabled) return null;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    const button = event.currentTarget;
    // 既有约定（面板读「宿主输入框」草稿）：标记离按钮最近的那个输入框并聚焦。
    const hostRoot = button.closest("form, [data-oceanleo-leo-entry-root]");
    const input = hostRoot?.querySelector<HTMLElement>(
      "textarea, [contenteditable='true']",
    );
    if (input) {
      input.setAttribute("data-ai-assistant-target", "");
      input.focus();
    }
    openLeoAssistant({
      toggle: true,
      source: "input",
      anchor: button.getBoundingClientRect(),
      context,
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-oceanleo-leo-entry=""
      aria-label="leo"
      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] transition-all duration-[var(--leo-dur-3)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] active:scale-95 ${
        tone === "dark"
          ? "text-neutral-300 hover:bg-neutral-800"
          : "text-neutral-600 hover:bg-neutral-100"
      } ${className}`}
      title={tt("让 leo 帮你处理这段内容（扩充 / 精简 / 总结 / 解释 / 翻译…）")}
    >
      <Sparkle gradientId={gradientId} />
      leo
    </button>
  );
}

function Sparkle({ gradientId }: { gradientId: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="24" y2="24">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      <path
        d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z"
        fill={`url(#${gradientId})`}
        opacity="0.65"
      />
    </svg>
  );
}
