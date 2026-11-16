"use client";

import { useLocale } from "next-intl";
import { useUI } from "../../../i18n/ui/useUI";
import { assetPriceText } from "../../asset-detail/asset-price";
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
  const tt = useUI();
  let locale = "en";
  try { locale = useLocale(); } catch { /* Embedded catalogs can render without next-intl. */ }
  const priceFen = asset.shelfKind === "official" ? 0 : asset.price_fen;
  const commerce = asset.action_context?.commerce || (typeof priceFen === "number" ? {
    priceFen, currency: asset.currency === "USD" ? "USD" as const : "CNY" as const, free: priceFen === 0, purchaseState: "none" as const,
  } : undefined);
  const price = assetPriceText({ commerce }, locale, tt);
  const entry = (asset as Partial<BayOfficialAsset>).entry || bayAssetToLibraryEntry(asset);
  return <div data-bay-asset-card={asset.id} data-shelf-kind={asset.shelfKind || "origin"}>
    {view === "list"
      ? <WorkspaceListRow entry={entry} onOpen={() => onOpen(asset)} />
      : <WorkspaceCard entry={entry} accent="#78716c" onOpen={() => onOpen(asset)} />}
    {price && <span data-asset-price className="px-3 text-xs font-medium">{price}</span>}
  </div>;
}
