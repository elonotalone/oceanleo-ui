"use client";

import type { ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import { PlaygroundDetail, type PlaygroundBoardCtx } from "./Playground";
import { WorkspaceDetail, type WorkspaceSiteItem } from "./WorkspaceMasterDetail";

/** 工作台页里的两堆。缺省与其它值都是「我的」。 */
export type WorkspacePile = "all" | "mine";

export function parseWorkspacePile(value: unknown): WorkspacePile {
  return value === "all" ? "all" : "mine";
}

function WorkspacePileSwitch({
  pile,
  onPileChange,
}: {
  pile: WorkspacePile;
  onPileChange: (pile: WorkspacePile) => void;
}) {
  const tt = useUI();
  const tabs: { id: WorkspacePile; label: string }[] = [
    { id: "all", label: tt("全部") },
    { id: "mine", label: tt("我的") },
  ];
  return (
    <div
      role="tablist"
      aria-label={tt("工作台")}
      data-workspace-pile={pile}
      className="inline-flex rounded-xl bg-neutral-100 p-1"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={pile === tab.id}
          data-workspace-pile-tab={tab.id}
          onClick={() => onPileChange(tab.id)}
          className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
            pile === tab.id
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 门户工作台单一入口：页顶「工作台」旁开关「全部 | 我的」。
 * 全部 = 货架（PlaygroundDetail）；我的 = 已加入（WorkspaceDetail）。
 * 各站自己的 /workspace 不要挂这个组件，以免灌进全家桶货架。
 */
export function WorkspaceDesk({
  pile,
  onPileChange,
  siteOrigin,
  accent,
  renderBoard,
  renderSites,
  onRequestLogin,
  homeSiteId,
  sites,
}: {
  pile: WorkspacePile;
  onPileChange: (pile: WorkspacePile) => void;
  siteOrigin: Record<string, string>;
  accent?: string;
  renderBoard?: (ctx: PlaygroundBoardCtx) => ReactNode;
  renderSites?: (chrome: {
    toolbarLeading?: ReactNode;
    belowToolbar?: ReactNode;
  }) => ReactNode;
  onRequestLogin?: () => void;
  homeSiteId?: string;
  sites?: WorkspaceSiteItem[];
}) {
  const resolved = parseWorkspacePile(pile);
  const pileSwitch = (
    <WorkspacePileSwitch pile={resolved} onPileChange={onPileChange} />
  );
  if (resolved === "all") {
    return (
      <PlaygroundDetail
        siteOrigin={siteOrigin}
        accent={accent}
        renderBoard={renderBoard}
        renderSites={renderSites}
        onRequestLogin={onRequestLogin}
        pileSwitch={pileSwitch}
      />
    );
  }
  return (
    <WorkspaceDetail
      siteOrigin={siteOrigin}
      accent={accent}
      homeSiteId={homeSiteId}
      sites={sites}
      renderBoard={renderBoard}
      renderSites={renderSites}
      pileSwitch={pileSwitch}
      onShowAll={() => onPileChange("all")}
      addAgentHref="/workspace?pile=all"
    />
  );
}
