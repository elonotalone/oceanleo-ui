"use client";

import { useMemo } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { CollectionCardGrid } from "../../collection-chrome";
import { CollectionItemList } from "../../collection-items";
import { BayFilterSelect } from "../shell/BayFilterSelect";
import { BayAssetCard } from "./BayAssetCard";
import { bayAssetToLibraryEntry } from "./library-entry-adapter";
import type { BayAsset } from "./library-client";
import type { BayOfficialAsset } from "./catalog/official-catalog";
import {
  materialCatalogCards, materialCatalogCardMatches, materialCatalogEntries,
  materialCatalogFacetOptions, materialCatalogVariantChips,
} from "../../material-catalog-group";
import {
  materialFacetRecords, MATERIAL_INDUSTRY_SUB_LABELS, MATERIAL_INDUSTRY_ORDER,
  MATERIAL_SHAPE_LABELS, MATERIAL_SHAPE_ORDER, MATERIAL_SKIN_LABELS, MATERIAL_SKIN_ORDER,
  type MaterialFacetSelection,
} from "../../material-library-facets";

export interface BayWebsiteSelection extends MaterialFacetSelection {
  variants: Readonly<Record<string, string>>;
}
export function bayWebsiteSelection(search: string): BayWebsiteSelection {
  const params = new URLSearchParams(search);
  let variants: Record<string, string> = {};
  try {
    const parsed = JSON.parse(params.get("websiteVersions") || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) variants = Object.fromEntries(Object.entries(parsed).filter((pair): pair is [string, string] => typeof pair[1] === "string"));
  } catch { /* A malformed preference never prevents catalog browsing. */ }
  return {
    industry: params.get("websiteIndustry") || "", sub: params.get("websiteSub") || "",
    shape: params.get("websiteShape") || "", skin: params.get("websiteSkin") || "", variants,
  };
}

/** Uses the existing material grouping contract: versions are rows, never skins. */
export function bayWebsiteCatalog(assets: readonly BayAsset[], selection: BayWebsiteSelection) {
  const byEntry = new Map(assets.map((asset) => [(asset as Partial<BayOfficialAsset>).entry?.id || `bay:${asset.id}`, asset]));
  const entries = assets.map((asset) => (asset as Partial<BayOfficialAsset>).entry || bayAssetToLibraryEntry(asset));
  const cards = materialCatalogCards(materialFacetRecords(entries));
  const industryCards = selection.industry ? cards.filter((card) => card.cover.facets.industry === selection.industry) : cards;
  const subjectCards = selection.sub ? industryCards.filter((card) => card.cover.facets.sub === selection.sub) : industryCards;
  const visible = cards.filter((card) => materialCatalogCardMatches(card, selection));
  const choice = { skin: selection.skin, perCard: selection.variants };
  const shown = materialCatalogEntries(visible, choice);
  return {
    industries: materialCatalogFacetOptions(cards, "industry", MATERIAL_INDUSTRY_SUB_LABELS, MATERIAL_INDUSTRY_ORDER),
    subs: materialCatalogFacetOptions(industryCards, "sub", MATERIAL_INDUSTRY_SUB_LABELS),
    shapes: materialCatalogFacetOptions(subjectCards, "shape", MATERIAL_SHAPE_LABELS, MATERIAL_SHAPE_ORDER),
    skins: materialCatalogFacetOptions(subjectCards, "skin", MATERIAL_SKIN_LABELS, MATERIAL_SKIN_ORDER),
    items: visible.map((card, index) => ({
      card, asset: byEntry.get(shown[index].id)!, entry: shown[index], chips: materialCatalogVariantChips(card, choice),
    })),
  };
}

export function BayWebsiteFilters({ assets, selection, onChange }: {
  assets: readonly BayAsset[]; selection: BayWebsiteSelection; onChange: (next: BayWebsiteSelection) => void;
}) {
  const tt = useUI();
  const shelf = useMemo(() => bayWebsiteCatalog(assets, selection), [assets, selection]);
  const fields = [
    ["industry", "行业", "全部行业", shelf.industries],
    ["sub", "子类", "全部子类", selection.industry ? shelf.subs : []],
    ["shape", "页数", "全部页数", shelf.shapes],
    ["skin", "外观", "全部外观", shelf.skins],
  ] as const;
  return <>{fields.map(([key, label, allLabel, options]) => options.length ? <BayFilterSelect key={key}
    name={`website-${key}`} label={tt(label)} allLabel={tt(allLabel)} value={selection[key]}
    options={options.map((option) => ({ ...option, label: tt(option.label) }))}
    onChange={(value) => onChange({ ...selection, [key]: value, ...(key === "industry" ? { sub: "" } : {}) })} /> : null)}</>;
}

export function BayWebsiteCatalog({ assets, selection, onChange, onOpen, view = "grid" }: {
  assets: readonly BayAsset[]; selection: BayWebsiteSelection; onChange: (next: BayWebsiteSelection) => void;
  onOpen: (asset: BayAsset) => void; view?: "grid" | "list";
}) {
  const tt = useUI();
  const shelf = useMemo(() => bayWebsiteCatalog(assets, selection), [assets, selection]);
  const Items = view === "list" ? CollectionItemList : CollectionCardGrid;
  return <Items data-bay-website-catalog>{shelf.items.map(({ card, asset, chips }) => <div key={card.key} data-bay-website-group={card.groupKey || undefined}>
    <BayAssetCard asset={asset} onOpen={onOpen} view={view} />
    {chips.length > 0 && <div className="mt-1 flex flex-wrap items-center gap-1" role="group" aria-label={tt("换一个版本")}>
      <span className="mr-0.5 text-[10px] text-stone-500">{tt("版本")}</span>
      {chips.map((chip) => <button key={chip.key} type="button" aria-pressed={chip.selected}
        aria-label={tt("看第 {n} 个版本，共 {total} 个", { n: chip.ordinal, total: chips.length })}
        className={`min-h-6 min-w-6 rounded-md border px-1.5 text-[10px] ${chip.selected ? "border-stone-800 bg-stone-800 text-white" : "border-stone-200 text-stone-600"}`}
        onClick={() => onChange({ ...selection, variants: { ...selection.variants, [card.groupKey]: chip.key } })}>{chip.ordinal}</button>)}
    </div>}
  </div>)}</Items>;
}
