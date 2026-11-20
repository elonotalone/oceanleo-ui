"use client";

import { useUI } from "../../i18n/ui/useUI";
import { Segmented } from "../../ui";

export type LeoChatTabId = "inbox" | "people";

export interface LeoChatTabsProps {
  active: LeoChatTabId;
  onSelect: (tab: LeoChatTabId) => void;
  badges?: Partial<Record<LeoChatTabId, number>>;
}

const TABS: ReadonlyArray<{ id: LeoChatTabId; label: string }> = [
  { id: "inbox", label: "消息" },
  { id: "people", label: "联系人" },
];

/** 消息 / 联系人：任务页同一套分段控件（`ui` 的 Segmented），各带各的未读数。小窗顶栏里按下它不会拖动窗口。 */
export function LeoChatTabs({ active, onSelect, badges }: LeoChatTabsProps) {
  const tt = useUI();
  return (
    <div data-im-no-drag data-leochat-tabs className="inline-flex">
      <Segmented
        size="sm"
        ariaLabel="LeoChat"
        value={active}
        onChange={onSelect}
        options={TABS.map((tab) => {
          const badge = badges?.[tab.id] ?? 0;
          return { id: tab.id, label: tab.label, badge, badgeLabel: badge > 0 ? tt("{n} 条未读", { n: badge }) : undefined };
        })}
      />
    </div>
  );
}
