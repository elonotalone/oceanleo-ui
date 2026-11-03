import type { ArtifactContextRef, ArtifactType } from "../../../artifact-contract";
import { mergeMaterialEntries } from "../../../material-library-dedupe";
import { parseMaterialFacets, type MaterialFacets } from "../../../material-library-facets";
import type { WorkspaceLibraryEntry } from "../../../workspace-library-model";
import type { BayAsset } from "../library-client";

export type BayOfficialSource = "template-materials" | "library-primary" | "library-search";

/** Catalog rows have no revision. Never invent durable identity for them. */
export interface BayOfficialIdentity {
  source: BayOfficialSource;
  catalogId: string | null;
  artifactId: string;
  revisionId: string | null;
  artifactType: ArtifactType;
  siteKey: string;
  appId: string;
  context: ArtifactContextRef | null;
  entry: WorkspaceLibraryEntry;
}

/** Wave 3 can feed entry directly into the existing detail/facet/group helpers. */
export interface BayOfficialAsset extends BayAsset {
  catalog: BayOfficialIdentity;
  /** All source identities survive a one-card-per-artifact merge. */
  catalogIdentities: BayOfficialIdentity[];
  entry: WorkspaceLibraryEntry;
  facets: MaterialFacets;
}

export function withOfficialCatalog(
  asset: BayAsset,
  catalog: BayOfficialIdentity,
): BayOfficialAsset {
  return {
    ...asset,
    catalog,
    catalogIdentities: [catalog],
    entry: catalog.entry,
    facets: parseMaterialFacets(catalog.entry.keywords),
  };
}

export function mergeBayOfficialAssets(
  groups: readonly (readonly BayOfficialAsset[])[],
  siteKey = "",
): BayOfficialAsset[] {
  const kept = new Map<string, BayOfficialAsset>();
  for (const asset of groups.flat()) {
    const key = asset.catalog.artifactId || asset.id;
    const previous = kept.get(key);
    if (!previous) {
      kept.set(key, asset);
      continue;
    }
    const identities = [...previous.catalogIdentities];
    for (const identity of asset.catalogIdentities) {
      if (!identities.some((other) =>
        other.source === identity.source &&
        other.catalogId === identity.catalogId &&
        other.revisionId === identity.revisionId &&
        other.context?.contextId === identity.context?.contextId &&
        other.appId === identity.appId && other.siteKey === identity.siteKey
      )) identities.push(identity);
    }
    const [entry] = mergeMaterialEntries([[previous.entry], [asset.entry]], { siteKey });
    kept.set(key, { ...previous, catalogIdentities: identities, entry });
  }
  return [...kept.values()];
}
