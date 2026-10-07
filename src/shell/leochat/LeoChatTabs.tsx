"use client";

import { useUI } from "../../i18n/ui/useUI";
import { BayIcon } from "../bay/shell/bay-icons";

export interface LeoChatTabsProps {
  active: "inbox" | "people" | "bay";
  onSelect: (tab: "inbox" | "people" | "bay") => void;
  badges?: Partial<Record<"inbox" | "people" | "bay", number>>;
  /** 这些栏目点了不切换，而是调 onLocked（没登录时聊天、联系人用）。 */
  locked?: ReadonlyArray<"inbox" | "people" | "bay">;
  onLocked?: () => void;
}

const tabSvg = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-[18px] w-[18px]",
  "aria-hidden": true,
};

function TabIcon({ view }: { view: "inbox" | "people" | "bay" }) {
  if (view === "bay") {
    return <BayIcon className="h-[18px] w-[18px]" />;
  }
  if (view === "inbox") {
    return (
      <svg {...tabSvg}>
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.4a.6.6 0 0 1-1-.47V16h-.3A2.5 2.5 0 0 1 4 13.5z" />
        <path d="M8.5 9.5h7M8.5 12.5h4.5" />
      </svg>
    );
  }
  return (
    <svg {...tabSvg}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.9-4.8 5.5-4.8s4.9 1.6 5.5 4.8M16 11.2a3 3 0 1 0 0-6M17.5 14.6c1.8.5 3 1.9 3.5 4.4" />
    </svg>
  );
}

const TABS: ReadonlyArray<{ id: "inbox" | "people" | "bay"; label: string; literal?: boolean }> = [
  { id: "inbox", label: "聊天" },
  { id: "people", label: "联系人" },
  { id: "bay", label: "LeoBay", literal: true },
];

/** 小窗的三个栏目标签：图标 + 文字，各带各的数字。登录后的小窗和没登录的访客小窗用同一个。 */
export function LeoChatTabs({ active, onSelect, badges, locked, onLocked }: LeoChatTabsProps) {
  const tt = useUI();
  return (
    <div role="tablist" aria-label="LeoChat" data-im-icon-tabs className="flex shrink-0 items-center border-b border-black/10 dark:border-white/10">
      {TABS.map((tab) => {
        const badge = badges?.[tab.id] ?? 0;
        const label = tab.literal ? tab.label : tt(tab.label);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-view={tab.id}
            aria-selected={active === tab.id}
            aria-label={label}
            title={label}
            onClick={() => {
              if (locked?.includes(tab.id)) {
                onLocked?.();
                return;
              }
              onSelect(tab.id);
            }}
            className="flex min-w-0 flex-1 items-center justify-center py-3"
          >
            <TabIcon view={tab.id} />
            <span className="min-w-0 truncate">{label}</span>
            {/* 数字跟在文字后面：原来只有图标时它是压在图标右上角的，有了文字再那样摆会盖住字。 */}
            {badge > 0 ? (
              <span className="min-w-[1rem] shrink-0 rounded-full bg-neutral-900 px-1 text-center text-[10px] font-semibold leading-4 text-white dark:bg-white dark:text-neutral-900">
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
