"use client";

import type { ReactElement } from "react";
import type { BayAsset } from "./library-client";
import type { BayOfficialAsset } from "./catalog/official-catalog";
import { bayAssetToLibraryEntry } from "./library-entry-adapter";
import { WorkspaceCard, WorkspaceListRow } from "../../workspace-library-view";

export interface BayAssetCardProps {
  asset: BayAsset;
  view?: "grid" | "list";
  onOpen: (asset: BayAsset) => void;
}

/** Catalog projections retain their real ACL, revision, facets and preview data. */
export function BayAssetCard({ asset, onOpen, view = "grid" }: BayAssetCardProps): ReactElement {
  const entry = (asset as Partial<BayOfficialAsset>).entry || bayAssetToLibraryEntry(asset);
  return <div data-bay-asset-card={asset.id} data-shelf-kind={asset.shelfKind || "origin"}>
    {view === "list"
      ? <WorkspaceListRow entry={entry} onOpen={() => onOpen(asset)} />
      : <WorkspaceCard entry={entry} accent="#78716c" onOpen={() => onOpen(asset)} />}
  </div>;
}
