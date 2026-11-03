import { artifactIsVisible, type ArtifactContextRef, type ArtifactType } from "../../../artifact-contract";
import { isDurableLibraryItem, type LibraryItem } from "../../../library-data";
import { libraryItemHasExactPrimaryContext, queryMaterialLibrary } from "../../../material-library-controller";
import type { MaterialLibraryLevel } from "../../../material-library-scope";
import { libraryItemMatchesOriginScope } from "../../../material-library-scope";
import type { BayOfficialSource } from "./official-catalog";

export interface BayOfficialScope {
  /** Omit for the existing global template catalog. Typed queries require a site. */
  siteKey?: string;
  context?: ArtifactContextRef;
  /** Omit to combine current app and site, matching both old MaterialLibrary tabs. */
  level?: MaterialLibraryLevel;
}

export interface BayTypedMaterial {
  item: LibraryItem;
  source: Exclude<BayOfficialSource, "template-materials">;
  context: ArtifactContextRef | null;
}

export function bayOfficialSiteKey(scope: BayOfficialScope): string {
  const siteKey = (scope.siteKey || scope.context?.siteKey || "").trim();
  if (scope.siteKey && scope.context && scope.siteKey.trim() !== scope.context.siteKey.trim()) {
    throw new Error("invalid-binding");
  }
  if (scope.level && !siteKey) throw new Error("invalid-binding");
  if ((scope.level === "primary" || scope.context) &&
      (!scope.context?.contextId?.trim() || !scope.context?.appId?.trim() || !siteKey)) {
    throw new Error("invalid-binding");
  }
  return siteKey;
}

/** Uses the old shelf's scope, editor and permission gates, then excludes private rows. */
export async function listBayTypedMaterials(options: BayOfficialScope & {
  artifactType: ArtifactType;
  signal?: AbortSignal;
}): Promise<{ items: BayTypedMaterial[]; unavailableSources: BayOfficialSource[] }> {
  const siteKey = bayOfficialSiteKey(options);
  if (!siteKey) return { items: [], unavailableSources: [] };
  const context = options.context || { contextId: "", siteKey };
  const levels: MaterialLibraryLevel[] = options.level
    ? [options.level]
    : options.context ? ["primary", "site"] : ["site"];
  const pages = await Promise.all(levels.map(async (level) => {
    const source = level === "primary" ? "library-primary" : "library-search";
    const items: BayTypedMaterial[] = [];
    const cursors = new Set<string>();
    let cursor = "";
    do {
      const result = await queryMaterialLibrary({
        level, context, query: "", taxonomy: options.artifactType,
        types: [options.artifactType], role: "template", limit: 100,
        cursor, signal: options.signal,
      });
      if (!result.ok || !result.data) {
        // Anonymous users still get the public site catalog. Never retry unscoped.
        if (level === "primary" && (result.status === 401 || result.status === 403)) {
          return { items: [], unavailableSources: [source] as BayOfficialSource[] };
        }
        throw new Error(result.error || result.code || "invalid-response");
      }
      for (const item of result.data.items) {
        if (!isDurableLibraryItem(item) || item.artifactType !== options.artifactType ||
            item.artifact.owner.visibility !== "public" || !artifactIsVisible(item.artifact)) continue;
        if (level === "primary" && !libraryItemHasExactPrimaryContext(item, context)) continue;
        if (level === "site" && (!item.artifact.roles.includes("template") ||
            !libraryItemMatchesOriginScope(item, { siteKey }))) continue;
        items.push({ item, source, context: level === "primary" ? context : null });
      }
      // Primary has no cursor request parameter; it is a fixed-context collection.
      if (level === "primary") break;
      const next = result.data.nextCursor || "";
      if (!next || next === "0") break;
      if (cursors.has(next) || next === cursor) throw new Error("invalid-response");
      cursors.add(next);
      cursor = next;
    } while (cursor);
    return { items, unavailableSources: [] as BayOfficialSource[] };
  }));
  return {
    items: pages.flatMap((page) => page.items),
    unavailableSources: pages.flatMap((page) => page.unavailableSources),
  };
}
