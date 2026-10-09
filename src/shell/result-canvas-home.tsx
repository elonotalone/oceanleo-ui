"use client";

import type { ReactElement, ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import { useImEnabled } from "../lib/im/client";
import type { WorkspacePanelId, WorkspaceSlotId } from "./workspace-actions";
import { WORKSPACE_SLOT_LABELS } from "./result-canvas-view";
import { BayIcon } from "./bay/shell/bay-icons";
import { useImUnread } from "./messages/realtime/hooks";

const CARD_CLASS =
  "flex min-w-0 flex-col items-start gap-1.5 rounded-xl border border-stone-200 bg-white p-3 text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-stone-300 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300";

const SLOT_DESC: Record<WorkspaceSlotId, string> = {
  template: "看这个应用怎么用，从示例开始",
  preview: "这次对话里生成的内容",
  materials: "平台精选的模板和素材",
  mine: "你保存和上传的文件",
  browser: "看 AI 在浏览器里的操作",
};

function LineIcon({ children }: { children: ReactNode }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function slotIcon(id: WorkspaceSlotId): ReactElement {
  switch (id) {
    case "template":
      return (
        <LineIcon>
          <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.5.4.9 1 1 1.7h5.2c.1-.7.5-1.3 1-1.7A6 6 0 0 0 12 3z" />
        </LineIcon>
      );
    case "preview":
      return (
        <LineIcon>
          <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3zM18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
        </LineIcon>
      );
    case "materials":
      return (
        <LineIcon>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </LineIcon>
      );
    case "mine":
      return (
        <LineIcon>
          <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2.5h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9.5z" />
        </LineIcon>
      );
    case "browser":
      return (
        <LineIcon>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" />
        </LineIcon>
      );
  }
}

function WorkspaceCard({
  id,
  title,
  description,
  icon,
  count,
  onClick,
}: {
  id: string;
  title: string;
  description: string;
  icon: ReactElement;
  count: number;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      data-workspace-card={id}
      onClick={onClick}
      className={CARD_CLASS}
    >
      <span className="flex w-full min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="grid shrink-0 place-items-center rounded-lg bg-stone-100 p-1.5 text-stone-600"
        >
          {icon}
        </span>
        <span
          data-workspace-card-title
          className="min-w-0 flex-1 truncate text-[13px] font-semibold text-stone-900"
        >
          {title}
        </span>
        {count > 0 ? (
          <span
            data-workspace-card-badge
            className="shrink-0 rounded-full bg-stone-900 px-1.5 text-[10px] font-semibold leading-4 text-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </span>
      <span
        data-workspace-card-desc
        className="text-[12px] leading-relaxed text-stone-500"
      >
        {description}
      </span>
    </button>
  );
}

export interface WorkspaceHomeProps {
  slots: readonly WorkspaceSlotId[];
  panels: { bay: boolean; leochat: boolean };
  onOpenSlot: (slot: WorkspaceSlotId) => void;
  onOpenPanel: (panel: WorkspacePanelId) => void;
  previewCount?: number;
}

export function WorkspaceHome(props: WorkspaceHomeProps): ReactElement {
  const tt = useUI();
  const imOn = useImEnabled();
  const unread = useImUnread();
  const chatCount = imOn ? unread?.total ?? 0 : 0;
  const previewCount = props.previewCount ?? 0;
  return (
    <nav
      data-workspace-home-cards
      aria-label={tt("工作区")}
      className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] content-start gap-3 p-3"
    >
      {props.slots.map((id) => (
        <WorkspaceCard
          key={id}
          id={id}
          title={tt(WORKSPACE_SLOT_LABELS[id])}
          description={tt(SLOT_DESC[id])}
          icon={slotIcon(id)}
          count={id === "preview" ? previewCount : 0}
          onClick={() => props.onOpenSlot(id)}
        />
      ))}
      {props.panels.bay ? (
        <WorkspaceCard
          id="bay"
          title="LeoBay"
          description={tt("找真人做事：逛服务、发需求")}
          icon={<BayIcon className="h-4 w-4" strokeWidth={1.8} />}
          count={0}
          onClick={() => props.onOpenPanel("bay")}
        />
      ) : null}
      {props.panels.leochat ? (
        <WorkspaceCard
          id="leochat"
          title="LeoChat"
          description={tt("和联系人、卖家聊天")}
          icon={
            <LineIcon>
              <path d="M12 4c4.7 0 8.5 3.2 8.5 7.2s-3.8 7.2-8.5 7.2c-.9 0-1.8-.1-2.6-.4L5 19.6l1-3.4C4.4 14.9 3.5 13.1 3.5 11.2 3.5 7.2 7.3 4 12 4z" />
            </LineIcon>
          }
          count={chatCount}
          onClick={() => props.onOpenPanel("leochat")}
        />
      ) : null}
    </nav>
  );
}

export interface WorkspaceViewHeaderProps {
  title: string;
  onBack: () => void;
}

export function WorkspaceViewHeader(
  props: WorkspaceViewHeaderProps,
): ReactElement {
  const tt = useUI();
  return (
    <div
      data-workspace-view-header
      className="flex w-full min-w-0 items-center gap-1"
    >
      <button
        type="button"
        data-workspace-back
        onClick={props.onBack}
        aria-label={tt("回到卡片")}
        title={tt("返回")}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] font-medium text-stone-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
        {tt("返回")}
      </button>
      <span
        data-workspace-view-title
        className="min-w-0 truncate text-[12px] font-semibold text-stone-700"
      >
        {props.title}
      </span>
    </div>
  );
}
