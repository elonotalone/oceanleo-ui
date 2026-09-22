"use client";

// ============================================================================
// @oceanleo/ui — leo 面板底部输入（合同 §2.1：输入框 + 发送）
// ----------------------------------------------------------------------------
//   · Enter 发送、Shift+Enter 换行；
//   · 中文输入法候选态（isComposing / keyCode 229）按 Enter 不发送；
//   · busy 时禁用；面板打开时焦点进输入框。
// 发送后的乐观追加 / 记录替换由父级（useLeoTranscript）负责，这里只管输入。
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";

export function LeoPanelComposer({
  busy,
  visible,
  onSend,
}: {
  /** 有一轮对话或 board 动词在跑。 */
  busy: boolean;
  /** 面板打开中（打开那一帧焦点进输入框）。 */
  visible: boolean;
  onSend: (text: string) => void;
}) {
  const tt = useUI();
  const [text, setText] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // 面板打开 → 焦点进输入框（P6）。
  useEffect(() => {
    if (visible) areaRef.current?.focus();
  }, [visible]);

  // 自动增高（封顶 4 行左右后内部滚动）。
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [text]);

  const send = () => {
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    onSend(value);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    const native = e.nativeEvent as KeyboardEvent;
    // 中文输入法候选态：Enter 是选字，不是发送。
    if (native.isComposing || native.keyCode === 229) return;
    e.preventDefault();
    send();
  };

  return (
    <div className="border-t border-slate-100 px-3 py-3">
      <div className="flex items-end gap-2">
        <textarea
          ref={areaRef}
          data-leo-composer
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          spellCheck={false}
          placeholder={tt("跟 leo 说")}
          className="v-scroll max-h-24 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-xs leading-relaxed outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus:border-slate-400"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !text.trim()}
          className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {busy ? "…" : tt("发送")}
        </button>
      </div>
    </div>
  );
}
