export type CapabilitySelection = Record<string, Record<string, string[]>>;
export type ModelTierId = "lite" | "pro" | "max";
export type ModelTierSelection = Record<ModelTierId, CapabilitySelection>;

function canonicalSelection(selection: CapabilitySelection): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(selection || {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, capabilities]) => [
          category,
          Object.fromEntries(
            Object.entries(capabilities || {})
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([capability, keys]) => [
                capability,
                [...new Set(keys || [])].sort(),
              ]),
          ),
        ]),
    ),
  );
}

export function modelTierForSelection(
  selection: CapabilitySelection,
  tiers: ModelTierSelection,
): ModelTierId | "custom" {
  const current = canonicalSelection(selection);
  for (const tier of ["lite", "pro", "max"] as const) {
    if (current === canonicalSelection(tiers[tier] || {})) return tier;
  }
  return "custom";
}
