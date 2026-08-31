"use client";

// 统一保存徽标。13 件插件共用同一套措辞与配色，切插件时心智不变。

import { useUI } from "../../i18n/ui/useUI";
import type { PluginChromeSaveState } from "./types";

const TONE_CLASS: Record<string, string> = {
  ok: "bg-[var(--pchrome-ok-soft)] text-[var(--pchrome-ok)]",
  warn: "bg-[var(--pchrome-warn-soft)] text-[var(--pchrome-warn)]",
  busy: "bg-[var(--pchrome-accent-soft)] text-[var(--pchrome-accent)]",
  danger: "bg-[var(--pchrome-danger-soft)] text-[var(--pchrome-danger)]",
};

export function PluginChromeStatus({ state }: { state: PluginChromeSaveState }) {
  const tt = useUI();

  let tone = "ok";
  let text = "";
  let title = "";

  switch (state.kind) {
    case "clean":
      text = state.revisionLabel
        ? tt("版本 {label}", { label: state.revisionLabel })
        : tt("无待保存改动");
      break;
    case "dirty":
      tone = "warn";
      text = tt("有未保存改动");
      break;
    case "saving":
      tone = "busy";
      text = tt("保存中…");
      break;
    case "saved":
      text = tt("已保存");
      break;
    case "error":
      tone = "danger";
      text = tt("保存失败");
      title = state.message;
      break;
    case "local-only":
      tone = "warn";
      text = tt("仅存本地");
      title = state.reason;
      break;
  }

  return (
    <span
      data-plugin-chrome-status={state.kind}
      title={title || text}
      aria-live="polite"
      className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold md:inline-flex ${TONE_CLASS[tone]}`}
    >
      {text}
    </span>
  );
}
