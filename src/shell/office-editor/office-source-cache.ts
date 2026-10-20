import {
  officePackageKindForItem,
  officeRenditionPurposes,
  validateOfficePackageBytes,
  type OfficePackageKind,
} from "../doc-editors/office-file";
import { isArtifactSourceTreeUrl } from "../artifact-contract";
import type { LibraryItem } from "../library-data";
import { loadOfficeBytes, type OfficeSourceLoadResult } from "./office-byte-store";

export { officeSourceCacheKey } from "./office-source-identity";
export {
  OFFICE_SOURCE_CACHE_LIMIT,
  OFFICE_SOURCE_CACHE_MAX_BYTES,
  configureOfficeSourceCacheForTests,
  resetOfficeSourceCacheForTests,
  officeSourceCacheStats,
  peekOfficeSource,
  type OfficeSourceCacheEntry,
  type OfficeSourceLoadResult,
  type OfficeSourceCacheHooks,
} from "./office-byte-store";

export function sourceHintForItem(item: LibraryItem): { url: string; revision: string } {
  const renditions = item.artifact?.renditions;
  const purpose = officeRenditionPurposes(item).find((name) => {
    const url = renditions?.[name]?.url;
    return typeof url === "string" && url.length > 0 && !isArtifactSourceTreeUrl(url);
  });
  const hinted = (purpose && renditions?.[purpose]?.url) || item.url || "";
  const url = hinted && !isArtifactSourceTreeUrl(hinted) ? hinted : "";
  return { url, revision: item.revisionId || item.artifact?.revisionId || "" };
}

export function loadOfficeSource(
  url: string,
  revision: string,
  item?: LibraryItem | null,
  options: { signal?: AbortSignal; maxBytes?: number; kind?: OfficePackageKind } = {},
): Promise<OfficeSourceLoadResult> {
  const kind = options.kind || (item ? officePackageKindForItem(item) : null);
  return loadOfficeBytes(url, revision, item, {
    ...options,
    kind,
    validate: kind ? (bytes, contentType) => validateOfficePackageBytes(bytes, kind, contentType) : undefined,
  });
}

export function prefetchOfficeSource(item: LibraryItem): Promise<OfficeSourceLoadResult | null> {
  if (!officePackageKindForItem(item)) return Promise.resolve(null);
  const { url, revision } = sourceHintForItem(item);
  return url ? loadOfficeSource(url, revision, item) : Promise.resolve(null);
}
