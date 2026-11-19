"use client";

// LeoBay 成品货架：种类封面卡 → 分栏货架 → 单种类网格。基础素材仍由原有 API 与插入面板提供。
import { useCallback, useEffect, useRef, useState } from "react";
import { bayEnabledHere, type BayFeedFilter } from "../shell/bay-state";
import { type ArtifactContextRef } from "../../artifact-contract";
import type { WorkspaceLibraryEntry } from "../../workspace-library-model";
import { LiveMaterialSearch } from "./LiveMaterialSearch";
import { BayArtifactDeepLink, bayAssetRefForCard, useBayAssetRoute } from "./BayArtifactDeepLink";
import { BayLicensesView } from "./BayLicensesView";
import type { BayAsset } from "./library-client";
import { useHydratedPageHref } from "../../use-hydrated-page-href";
import { ReadyMaterialCatalog } from "../shell/ReadyMaterialCatalog";

const readSearch = () => typeof window === "undefined" ? "" : window.location.search;

export function BayAssetLibrary({ filter, siteKey, accent, view = "grid", context: providedContext, onEdit, onUseInTask,
  detailInPage = false, licensesOpen = false, onCloseLicenses,
}: {
  filter: BayFeedFilter;
  siteKey: string;
  accent?: string;
  view?: "grid" | "list";
  context?: ArtifactContextRef;
  onEdit?: (entry: WorkspaceLibraryEntry) => Promise<void> | void;
  onUseInTask?: (entry: WorkspaceLibraryEntry) => Promise<void> | void;
  /** /bay lifts the detail outside Browse; embedded hosts retain their own detail. */
  detailInPage?: boolean;
  licensesOpen?: boolean;
  onCloseLicenses?: () => void;
}) {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    const restore = () => setOnline(new URLSearchParams(readSearch()).get("view") === "online");
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const rootRef = useRef<HTMLDivElement>(null);
  const route = useBayAssetRoute(rootRef);
  const pageHref = useHydratedPageHref();
  const appId = providedContext?.appId || (pageHref ? new URL(pageHref).searchParams.get("app") : "") || "";
  const bayOn = bayEnabledHere();
  const openAsset = useCallback((asset: BayAsset) => route.open(bayAssetRefForCard(asset)), [route.open]);

  function chooseSource(next: boolean) {
    setOnline(next);
    const params = new URLSearchParams(readSearch());
    if (next) params.set("view", "online"); else params.delete("view");
    const search = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
  }

  return <div ref={rootRef} data-bay-asset-library className="mt-4 flex min-w-0 min-h-[32rem] flex-1 flex-col">
    <div hidden={Boolean(route.target)} className="min-h-0 min-w-0 flex-1" data-bay-asset-browse>
      <ReadyMaterialCatalog siteKey={siteKey} appId={appId} query={filter.q || ""} view={view} sellers={bayOn}
        online={online} onOnlineChange={chooseSource} onOpen={openAsset}>
        <LiveMaterialSearch initialQuery={filter.q || ""} />
      </ReadyMaterialCatalog>
    </div>
    {!detailInPage ? <BayArtifactDeepLink target={route.target} onBack={route.close} accent={accent} siteKey={siteKey} onEdit={onEdit} onUseInTask={onUseInTask} /> : null}
    {licensesOpen && onCloseLicenses ? <BayLicensesView onClose={onCloseLicenses} /> : null}
  </div>;
}
