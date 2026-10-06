"use client";

// 工作回放卡：标题、时长、「播放」= W05 `openWorkReplay`。
import { useUI } from "../../../i18n/ui/useUI";
import type { ImCard } from "../../../lib/im/types";
import { openWorkReplay } from "../../replay/work/open-work-replay";

export function ReplayCardView({ card }: { card: ImCard }) {
  const tt = useUI();
  return (
    <div
      data-card="replay"
      className="flex max-w-[340px] items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3"
    >
      <span
        aria-hidden="true"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-neutral-400">{tt("工作回放")}</span>
        <span className="block truncate text-[13.5px] font-medium text-neutral-900">{card.title}</span>
        {card.subtitle ? <span className="block truncate text-[12px] text-neutral-500">{card.subtitle}</span> : null}
      </span>
      <button
        type="button"
        onClick={() => openWorkReplay(card.id)}
        className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-[12.5px] text-white hover:bg-neutral-700"
      >
        {tt("播放")}
      </button>
    </div>
  );
}
