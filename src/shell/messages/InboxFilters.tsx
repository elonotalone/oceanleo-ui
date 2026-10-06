"use client";

// 收件箱筛选：全部 / 未读 / @我 / 私聊 / 群组 / Team / 项目 / 交易。
import { useUI } from "../../i18n/ui/useUI";
import type { InboxFilter } from "../../lib/im/inbox-api";

export const FILTER_LABELS: ReadonlyArray<{ id: InboxFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "unread", label: "未读" },
  { id: "mentions", label: "@我" },
  { id: "dm", label: "私聊" },
  { id: "group", label: "群组" },
  { id: "team", label: "Team" },
  { id: "project", label: "项目" },
  { id: "talent", label: "交易" },
];

export function InboxFilters({ value, onChange }: { value: string; onChange: (filter: InboxFilter) => void }) {
  const tt = useUI();
  return (
    <div role="tablist" aria-label={tt("筛选会话")} className="flex gap-1 overflow-x-auto px-2 py-2">
      {FILTER_LABELS.map((entry) => {
        const active = entry.id === value;
        return (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-filter={entry.id}
            onClick={() => onChange(entry.id)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs transition-colors ${
              active
                ? "bg-sky-500 text-white"
                : "bg-black/5 text-black/70 hover:bg-black/10 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15"
            }`}
          >
            {tt(entry.label)}
          </button>
        );
      })}
    </div>
  );
}
