"use client";

import type { ReactNode } from "react";
import { PlaygroundDetail, type PlaygroundBoardCtx } from "./Playground";
import type { CollectionViewOption } from "./collection-chrome";
import type { WorkspaceSiteItem } from "./WorkspaceMasterDetail";

/** 工作台货架筛选。缺省与其它值都是「全部」；`mine` 只表示仅看收藏。 */
export type WorkspacePile = "all" | "mine";

export function parseWorkspacePile(value: unknown): WorkspacePile {
  return value === "mine" ? "mine" : "all";
}

/**
 * 门户工作台单一入口：永远渲染货架（PlaygroundDetail）。
 * `?pile=mine` / favoritesOnly 只打开「仅看收藏」，不再切到 WorkspaceDetail。
 * 各站自己的 /workspace 不要挂这个组件，以免灌进全家桶货架。
 */
export function WorkspaceDesk({
  pile,
  onPileChange,
  accent,
  renderBoard,
  renderSites,
  onRequestLogin,
  favoritesOnly,
}: {
  pile: WorkspacePile;
  onPileChange: (pile: WorkspacePile) => void;
  /**
   * @deprecated Ignored. Sub-site hosts are gone (2026-11-21); site workspaces are same-origin
   * `/workspace/<siteKey>`. Kept optional only so the portal desk still typechecks until it stops passing it.
   */
  siteOrigin?: Record<string, string>;
  accent?: string;
  renderBoard?: (ctx: PlaygroundBoardCtx) => ReactNode;
  renderSites?: (chrome: {
    toolbarLeading?: ReactNode;
    belowToolbar?: ReactNode;
    viewOptions?: CollectionViewOption[];
  }) => ReactNode;
  onRequestLogin?: () => void;
  /** @deprecated Ignored (never forwarded). */
  homeSiteId?: string;
  /** @deprecated Ignored (never forwarded). */
  sites?: WorkspaceSiteItem[];
  favoritesOnly?: boolean;
}) {
  const resolved = parseWorkspacePile(pile);
  const onlyFav = resolved === "mine" || Boolean(favoritesOnly);
  return (
    <PlaygroundDetail
      accent={accent}
      renderBoard={renderBoard}
      renderSites={renderSites}
      onRequestLogin={onRequestLogin}
      favoritesOnly={onlyFav}
      onFavoritesOnlyChange={(next) => onPileChange(next ? "mine" : "all")}
    />
  );
}
