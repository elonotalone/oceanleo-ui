"use client";

// 交易会话的输入框：文字走 talent 现有接口。Enter 发送、Shift+Enter 换行（输入法组字时 Enter 不发送）。
// 报价、合同、付款等复杂动作与上传附件，给「在 talent 打开」的链接。

import { useState, type KeyboardEvent } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { TALENT_BODY_LIMIT } from "./talent-api";

export interface TalentComposerProps {
  disabled?: boolean;
  /** 发送；抛错时输入框内容保留，错误在上方显示。 */
  onSend: (body: string) => Promise<void>;
  openUrl?: string | null;
  error?: string | null;
}

export function TalentComposer({ disabled = false, onSend, openUrl = null, error = null }: TalentComposerProps) {
  const tt = useUI();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const text = value.trim();
    if (!text || busy || disabled) return;
    setBusy(true);
    try {
      await onSend(text);
      setValue("");
    } catch {
      // 错误由上层显示，内容保留以便重发
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  }

  return (
    <div data-talent-composer className="border-t border-neutral-200/80 px-3 py-2">
      {error && (
        <p role="alert" data-composer-error className="pb-1 text-[12px] text-red-600">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          rows={1}
          maxLength={TALENT_BODY_LIMIT}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={tt("写点什么…")}
          aria-label={tt("消息内容")}
          data-composer-input
          className="max-h-32 min-h-[36px] flex-1 resize-none rounded-xl bg-black/[0.04] px-3 py-2 text-[14px] text-neutral-900 focus:outline-none dark:bg-white/[0.06]"
        />
        <button
          type="button"
          disabled={disabled || busy || !value.trim()}
          data-action="send"
          onClick={() => void submit()}
          className="px-2 py-1.5 text-[13px] font-semibold text-neutral-900 disabled:opacity-30"
        >
          {tt("发送")}
        </button>
      </div>
      {openUrl && (
        <p className="pt-1.5 text-[11.5px] text-neutral-500">
          {tt("发报价、传文件、签合同和付款，请")}
          <a href={openUrl} target="_blank" rel="noopener noreferrer" data-composer-open className="font-medium text-neutral-800 underline-offset-2 hover:underline">
            {tt("在 talent 打开")}
          </a>
        </p>
      )}
    </div>
  );
}
