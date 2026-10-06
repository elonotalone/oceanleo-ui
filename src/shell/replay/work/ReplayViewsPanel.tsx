"use client";

// 「谁看过我」：owner 看这段回放被谁、以什么身份看过（含 Team 管理员查看，契约 §7.1 / §9.12）。
import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { listWorkReplayViews, type ReplayVia, type WorkReplayView } from "./replay-work-api";

export function ReplayViewsPanel({ replayId, onClose }: { replayId: string; onClose: () => void }) {
  const tt = useUI();
  const [state, setState] = useState<{ phase: "loading" } | { phase: "ready"; items: WorkReplayView[] } | { phase: "error" }>({
    phase: "loading",
  });

  useEffect(() => {
    let active = true;
    void listWorkReplayViews(replayId).then((result) => {
      if (!active) return;
      setState(result.ok && result.data ? { phase: "ready", items: result.data.items } : { phase: "error" });
    });
    return () => {
      active = false;
    };
  }, [replayId]);

  const label = (via: ReplayVia): string => {
    switch (via) {
      case "owner":
        return tt("自己");
      case "recipient":
        return tt("收件人");
      case "conversation":
        return tt("会话成员");
      case "admin":
        return tt("Team 管理员");
      default:
        return tt("公开链接");
    }
  };

  return (
    <aside
      data-work-replay-views
      role="dialog"
      aria-label={tt("谁看过")}
      className="absolute right-4 top-14 z-10 w-80 rounded-xl border border-stone-200 bg-white p-3 shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-neutral-900">{tt("谁看过")}</h3>
        <button type="button" onClick={onClose} className="text-[12px] text-stone-500 hover:text-neutral-900">
          {tt("关闭")}
        </button>
      </div>
      {state.phase === "loading" ? <p className="text-[12px] text-stone-400">{tt("正在加载…")}</p> : null}
      {state.phase === "error" ? <p className="text-[12px] text-rose-600">{tt("暂时加载不出来，稍后再试。")}</p> : null}
      {state.phase === "ready" && state.items.length === 0 ? (
        <p className="text-[12px] text-stone-400">{tt("还没有人看过。")}</p>
      ) : null}
      {state.phase === "ready" && state.items.length > 0 ? (
        <ul className="max-h-72 space-y-2 overflow-auto">
          {state.items.map((item, index) => (
            <li key={`${item.viewed_at}-${index}`} data-replay-view={item.via} className="flex items-center gap-2 text-[12px]">
              <span className="min-w-0 flex-1 truncate text-neutral-900">
                {item.viewer?.display_name || tt("匿名访客")}
              </span>
              <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-stone-500">{label(item.via)}</span>
              <span className="shrink-0 text-stone-400">
                {item.viewed_at ? new Date(item.viewed_at).toLocaleString() : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
