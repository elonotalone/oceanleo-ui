"use client";

// 项目回放里出现了你的改动与 AI 对话：同意之前它们不会出现；拒绝后这段回放不能分享出去（契约 §9.12）。
import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { ImProfile } from "../../../lib/im/types";
import { decideWorkReplayConsent } from "./replay-work-api";

export interface ReplayConsentPromptProps {
  replayId: string;
  title: string;
  from: Pick<ImProfile, "display_name"> | null;
  onDone: (decision: "accept" | "decline" | "dismiss") => void;
}

export function ReplayConsentPrompt({ replayId, title, from, onDone }: ReplayConsentPromptProps) {
  const tt = useUI();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const decide = async (decision: "accept" | "decline") => {
    setBusy(true);
    setFailed(false);
    const result = await decideWorkReplayConsent(replayId, decision);
    setBusy(false);
    if (result.ok) onDone(decision);
    else setFailed(true);
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={tt("项目回放需要你同意")}
      data-replay-consent={replayId}
      className="fixed inset-0 z-[2147483100] flex items-center justify-center bg-black/30 p-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <h3 className="text-[15px] font-medium text-neutral-900">{tt("项目回放需要你同意")}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-stone-600">
          {tt("{name} 生成了一段项目回放「{title}」，里面会出现你的改动和 AI 对话。同意之前它们不会出现；拒绝后这段回放不能分享出去。", {
            name: from?.display_name || tt("有成员"),
            title: title || tt("工作回放"),
          })}
        </p>
        {failed ? <p className="mt-2 text-[12px] text-rose-600">{tt("没有成功，请再试一次。")}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            data-replay-consent-later
            onClick={() => onDone("dismiss")}
            className="rounded-lg px-3 py-1.5 text-[13px] text-stone-500 hover:bg-stone-100"
          >
            {tt("稍后")}
          </button>
          <button
            type="button"
            disabled={busy}
            data-replay-consent-decline
            onClick={() => void decide("decline")}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-[13px] text-neutral-900 hover:bg-stone-50"
          >
            {tt("拒绝")}
          </button>
          <button
            type="button"
            disabled={busy}
            data-replay-consent-accept
            onClick={() => void decide("accept")}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] text-white hover:bg-neutral-700"
          >
            {tt("同意")}
          </button>
        </div>
      </div>
    </div>
  );
}
