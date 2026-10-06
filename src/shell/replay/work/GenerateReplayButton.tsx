"use client";

// 编辑器动作栏上的「生成回放」（W11 挂，契约 §8.2）：选范围——今天 / 最近 7 天 / 自定义，生成后打开播放层。
import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { useImEnabled } from "../../../lib/im/client";
import type { ImEditorKind } from "../../../lib/im/types";
import { createWorkReplay } from "./replay-work-api";
import { openWorkReplay } from "./open-work-replay";

export interface GenerateReplayButtonProps {
  resource: { kind: "artifact"; id: string; title: string; editorKind: ImEditorKind };
}

export type ReplayRangeChoice = "today" | "week" | "custom";

/** 范围选择 → 起止时间（ISO）。自定义要两个都填且起点早于终点，否则返回 null。 */
export function replayRangeFor(
  choice: ReplayRangeChoice,
  now: Date,
  custom?: { from: string; to: string },
): { range_from: string; range_to: string } | null {
  if (choice === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { range_from: start.toISOString(), range_to: now.toISOString() };
  }
  if (choice === "week") {
    return { range_from: new Date(now.getTime() - 7 * 86_400_000).toISOString(), range_to: now.toISOString() };
  }
  if (!custom?.from || !custom.to) return null;
  const from = new Date(custom.from);
  const to = new Date(custom.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) return null;
  return { range_from: from.toISOString(), range_to: to.toISOString() };
}

export function GenerateReplayButton({ resource }: GenerateReplayButtonProps) {
  const tt = useUI();
  const enabled = useImEnabled();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<ReplayRangeChoice>("today");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) return null;

  const generate = async () => {
    const range = replayRangeFor(choice, new Date(), custom);
    if (!range) {
      setError(tt("请选好开始和结束时间，开始要早于结束。"));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await createWorkReplay({
      scope: "personal",
      sources: [{ key: `artifact:${resource.id}` }],
      title: resource.title ? tt("{title}的工作回放", { title: resource.title }) : undefined,
      ...range,
    });
    setBusy(false);
    if (result.ok && result.data) {
      setOpen(false);
      openWorkReplay(result.data.replay.id);
    } else if (result.status === 422) {
      setError(tt("这段时间里这个作品没有可以回放的记录。"));
    } else if (result.status === 429) {
      setError(tt("今天生成的回放已经到上限了，明天再试。"));
    } else {
      setError(tt("没有生成成功，请再试一次。"));
    }
  };

  return (
    <span className="relative inline-block">
      <button
        type="button"
        data-generate-replay
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg px-2.5 py-1 text-[13px] text-stone-600 hover:bg-stone-100"
      >
        {tt("生成回放")}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label={tt("生成回放")}
          data-generate-replay-panel
          className="absolute right-0 top-full z-50 mt-1 w-64 space-y-2 rounded-xl border border-stone-200 bg-white p-3 text-[13px] shadow-lg"
        >
          <p className="text-stone-500">{tt("从平时的编辑记录里生成一段快进回放，不需要提前录制。")}</p>
          {(["today", "week", "custom"] as const).map((key) => (
            <label key={key} className="flex items-center gap-2 text-neutral-900">
              <input type="radio" name="replay-range" data-replay-range={key} checked={choice === key} onChange={() => setChoice(key)} />
              {key === "today" ? tt("今天") : key === "week" ? tt("最近 7 天") : tt("自定义")}
            </label>
          ))}
          {choice === "custom" ? (
            <div className="space-y-1">
              <input
                type="datetime-local"
                data-replay-custom-from
                value={custom.from}
                onChange={(event) => setCustom((value) => ({ ...value, from: event.target.value }))}
                className="w-full rounded-lg border border-stone-300 px-2 py-1"
              />
              <input
                type="datetime-local"
                data-replay-custom-to
                value={custom.to}
                onChange={(event) => setCustom((value) => ({ ...value, to: event.target.value }))}
                className="w-full rounded-lg border border-stone-300 px-2 py-1"
              />
            </div>
          ) : null}
          {error ? <p className="text-[12px] text-rose-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1 text-stone-500 hover:bg-stone-100">
              {tt("取消")}
            </button>
            <button
              type="button"
              disabled={busy}
              data-replay-generate
              onClick={() => void generate()}
              className="rounded-lg bg-neutral-900 px-3 py-1 text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {busy ? tt("正在生成…") : tt("生成")}
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}
