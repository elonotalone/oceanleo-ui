"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { openLeoAssistant } from "./LeoAssistant";

// ============================================================================
// @oceanleo/ui — 标准 OceanLeo 输入框（单一事实源）
// ----------------------------------------------------------------------------
// 操作员 2026-06-17 定稿：所有 *.oceanleo.com 站的输入框统一长这样（对照主站
// 「给 OceanLeo 布置一个任务...」截图）：圆角卡片 + 自增高 textarea + 左下控制区
// + 右下圆形发送键。
//
// 与主站的唯一差异：主站左下角是「对话 / Agent / 设计」三件套；其余站没有这些，
// 取而代之——当输入框是「与 AI 生成有关」时，左下角放一个「leo 建议」按钮。
//
// 因此本组件参数化两点：
//   - leftSlot：左下角自定义控制区。主站传它放「对话/Agent/设计」；其余站留空。
//   - leoSuggest：true 时在左下角渲染「leo 建议」按钮。点击 →
//     ① 把当前输入内容标记为 leo 助手的目标输入框（设 data-ai-assistant-target）
//     ② openLeoAssistant() 打开 leo 助手浮窗（它会捕捉本框内容并给建议）。
//
// 规则：普通（与 AI 生成无关）输入框不要传 leoSuggest；只有「有 AI 生成功能」的
// 输入框才传 leoSuggest，从而出现「leo 建议」按钮。
// ============================================================================

export interface LeoComposerProps {
  value: string;
  onChange: (value: string) => void;
  /** 点击发送键 / 回车（无 shift）时触发；不传则不显示发送键 */
  onSubmit?: () => void;
  placeholder?: string;
  /** 提交中：发送键转圈 + 禁用 */
  loading?: boolean;
  /** 是否显示「leo 建议」按钮（仅与 AI 生成有关的输入框传 true） */
  leoSuggest?: boolean;
  /** 左下角自定义控制区（主站放 对话/Agent/设计；普通站留空） */
  leftSlot?: ReactNode;
  /**
   * 左下角「leo 建议」旁边的额外控件（doctrine v7：skill prompt 开源入口移进输入框）。
   * 放在 leftSlot / leo 建议 之后、同一行内。
   */
  inlineSlot?: ReactNode;
  rows?: number;
  /** textarea 自增高上限（px），默认 280 */
  maxHeight?: number;
  /** 透传给最外层卡片的额外 class */
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function LeoComposer({
  value,
  onChange,
  onSubmit,
  placeholder = "给 OceanLeo 布置一个任务...",
  loading = false,
  leoSuggest = false,
  leftSlot,
  inlineSlot,
  rows = 2,
  maxHeight = 280,
  className = "",
  autoFocus = false,
  disabled = false,
}: LeoComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const autogrow = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
  }, [maxHeight]);

  useEffect(() => {
    autogrow();
  }, [value, autogrow]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const canSend = Boolean(value.trim()) && !loading && !disabled;

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      onSubmit &&
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing
    ) {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  }

  function handleLeoSuggest() {
    // 让 leo 助手把本框当作目标输入框（即便用户没点进去）。
    ref.current?.setAttribute("data-ai-assistant-target", "");
    ref.current?.focus();
    openLeoAssistant();
  }

  return (
    <div
      className={`rounded-2xl border border-neutral-200 bg-white shadow-sm transition-all duration-200 focus-within:border-neutral-300 focus-within:shadow-md ${className}`}
    >
      <textarea
        ref={ref}
        // leo 助手据此自动锁定本框为它的目标输入框。
        data-ai-assistant-target={leoSuggest ? "" : undefined}
        className="w-full resize-none rounded-t-2xl border-0 bg-transparent px-5 pb-2 pt-5 text-[15px] leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-400"
        rows={rows}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onInput={autogrow}
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
      />
      <div className="flex items-center justify-between px-4 pb-3.5">
        <div className="flex flex-wrap items-center gap-2">
          {leftSlot}
          {leoSuggest && (
            <button
              type="button"
              onClick={handleLeoSuggest}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] text-neutral-600 transition-all duration-200 hover:bg-neutral-100 active:scale-95"
              title="让 leo 帮你补充 / 整理这段内容"
            >
              <Sparkle />
              leo 建议
            </button>
          )}
          {inlineSlot}
        </div>
        {onSubmit && (
          <button
            type="button"
            onClick={() => canSend && onSubmit()}
            disabled={!canSend}
            aria-label="发送"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-all duration-200 ${
              canSend
                ? "bg-neutral-900 hover:scale-105 hover:bg-neutral-800 active:scale-95"
                : "cursor-not-allowed bg-neutral-300"
            }`}
          >
            {loading ? <span className="v-spinner text-[12px]" /> : <ArrowUp />}
          </button>
        )}
      </div>
    </div>
  );
}

function ArrowUp() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
      <path
        d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z"
        fill="currentColor"
      />
      <path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z" fill="currentColor" opacity="0.6" />
    </svg>
  );
}
