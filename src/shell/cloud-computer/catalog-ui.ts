import type { CatalogTier, ComputerCatalog } from "../../lib/cloud-computer-api";

export type CatalogTierFilter = {
  minVcpu?: number | null;
  minMemoryGb?: number | null;
};

export function pickDefaultRegionId(
  catalog: Pick<ComputerCatalog, "regions" | "recommended_region_id">,
): string {
  const recommendedId = (catalog.recommended_region_id || "").trim();
  if (recommendedId && catalog.regions.some((region) => region.id === recommendedId)) {
    return recommendedId;
  }
  const flagged = catalog.regions.find((region) => region.recommended);
  return flagged?.id || catalog.regions[0]?.id || "";
}

export function pickDefaultTierId(tiers: CatalogTier[]): string {
  const recommendedLive = tiers.find((tier) => tier.recommended && tier.available);
  if (recommendedLive) return recommendedLive.id;
  const live = tiers.find((tier) => tier.available);
  return (live || tiers[0])?.id || "";
}

/** Recommended SKUs stay pinned above the rest of the returned list. */
export function orderedTiers(tiers: CatalogTier[]): CatalogTier[] {
  const recommended = tiers.filter((tier) => tier.recommended);
  const rest = tiers.filter((tier) => !tier.recommended);
  return recommended.concat(rest);
}

export function filterTiers(
  tiers: CatalogTier[],
  filter: CatalogTierFilter = {},
): CatalogTier[] {
  const minVcpu =
    filter.minVcpu != null && Number.isFinite(filter.minVcpu) && filter.minVcpu > 0
      ? filter.minVcpu
      : 0;
  const minMemoryGb =
    filter.minMemoryGb != null &&
    Number.isFinite(filter.minMemoryGb) &&
    filter.minMemoryGb > 0
      ? filter.minMemoryGb
      : 0;
  if (!minVcpu && !minMemoryGb) return tiers;
  return tiers.filter(
    (tier) => tier.vcpu >= minVcpu && tier.memory_gb >= minMemoryGb,
  );
}

export function visibleCatalogTiers(
  tiers: CatalogTier[],
  filter: CatalogTierFilter = {},
): CatalogTier[] {
  return orderedTiers(filterTiers(tiers, filter));
}
