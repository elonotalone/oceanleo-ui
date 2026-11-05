"use client";

import { useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { writeClipboardText } from "../share/share-clipboard";
import { toolPayloadText } from "../../native-agent-core/index";
import { toolRawValue, type ToolCard } from "../../native-agent-core/index";

/** Gateway-filtered tool values, shared by the dialog and task timeline. */
export function ToolPayloadView({ value, label }: { value: unknown; label: string }) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const text = toolPayloadText(value);
  return (
    <div data-tool-payload="" className="min-w-0" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="text-[11px] text-stone-500 dark:text-stone-400"
      >
        {label} · {open ? tt("收起") : tt("展开")}
      </button>
      {open ? (
        <div>
          <button
            type="button"
            aria-label={copied === text ? tt("工具内容已复制") : tt("复制工具内容")}
            className="text-[11px] text-stone-500 dark:text-stone-400"
            onClick={() => {
              void writeClipboardText(text).then((ok: boolean) => setCopied(ok ? text : null));
            }}
          >
            {copied === text ? tt("已复制") : tt("复制")}
          </button>
          <pre className="max-h-80 cursor-text select-text overflow-auto whitespace-pre-wrap break-all rounded-md bg-stone-50 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-stone-600 dark:bg-stone-900 dark:text-stone-300">
            {text}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export function ToolRawFolds({ tool }: { tool: Pick<ToolCard, "rawInput" | "rawOutput"> }) {
  const tt = useUI();
  const input = toolRawValue(tool, "input");
  const output = toolRawValue(tool, "output");
  return (
    <>
      {input !== undefined ? <ToolPayloadView value={input} label={tt("参数")} /> : null}
      {output !== undefined ? <ToolPayloadView value={output} label={tt("结果")} /> : null}
    </>
  );
}
