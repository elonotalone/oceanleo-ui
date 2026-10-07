"use client";

import { useUI } from "../../i18n/ui/useUI";

export type LeoChatTabId = "inbox" | "people";

export interface LeoChatTabsProps {
  active: LeoChatTabId;
  onSelect: (tab: LeoChatTabId) => void;
  badges?: Partial<Record<LeoChatTabId, number>>;
}

const TABS: ReadonlyArray<{ id: LeoChatTabId; label: string }> = [
  { id: "inbox", label: "聊天" },
  { id: "people", label: "联系人" },
];

/** 小窗顶栏中间的栏目切换：聊天 / 联系人，一条分段滑块，各带各的数字。 */
export function LeoChatTabs({ active, onSelect, badges }: LeoChatTabsProps) {
  const tt = useUI();
  return (
    <div role="tablist" aria-label="LeoChat" data-im-tabs data-im-no-drag className="inline-flex items-center">
      {TABS.map((tab) => {
        const badge = badges?.[tab.id] ?? 0;
        const label = tt(tab.label);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-view={tab.id}
            aria-selected={active === tab.id}
            onClick={() => onSelect(tab.id)}
            className="inline-flex items-center gap-1.5"
          >
            <span className="min-w-0 truncate">{label}</span>
            {badge > 0 ? (
              <span data-im-tab-badge aria-label={tt("{n} 条未读", { n: badge })}>
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
