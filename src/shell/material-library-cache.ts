/**
 * 素材库检索的**请求形状 + 内存缓存 + 同键去重**。
 *
 * 从 `material-library-controller.ts` 里搬出来的原因与 D3 的
 * `material-library-dedupe.ts` 一样：那个模块已经顶到 800 行硬顶，本轮 W8 还要在
 * 它里面接可玩条目的放行与分页。这一层是自洽的一块（请求键、新鲜度、失效），
 * 搬出来之后控制器只剩取数与投影。
 *
 * 既有 import 路径不变：控制器把这里的每个符号原样 re-export。
 */

import {
  artifactContextKey,
  type ArtifactContextRef,
  type ArtifactType,
} from "./artifact-contract";
import type {
  ArtifactApiResult,
  ArtifactSearchResult,
} from "./artifact-client";
import { isDurableLibraryItem } from "./library-data";
import {
  materialScopeTypes,
  materialTypesCsv,
  type MaterialLibraryLevel,
} from "./material-library-scope";

/**
 * Public material shelves only surface editable advanced-feature templates.
 * Owned/promoted catalog rows use the `template` role; view-only reference
 * rehosts are excluded so every visible card can open an advanced editor.
 */
export const MATERIAL_LIBRARY_TEMPLATE_ROLE = "template";

export interface MaterialLibraryQueryInput {
  level: MaterialLibraryLevel;
  context: ArtifactContextRef;
  query: string;
  taxonomy: ArtifactType | "";
  /** Multi-select chips (合同 §0.6); overrides `taxonomy` when non-empty. */
  types?: readonly ArtifactType[];
  /**
   * Library role filter. Defaults to `template` (素材货架).
   * Playable explore probes pass `generated_output` — promoted games are not
   * templates, and revision.roles is immutable after create.
   */
  role?: string;
  cursor?: string | null;
  /**
   * 单页条数。不传就是素材货架一直用的 60，形状不变；可玩探针要用满
   * `EXPLORE_PLAYABLE_PAGE_LIMIT`（100 款游戏一页 60 条装不下）。
   * 实际取值仍受 `artifact-client.ts` 的 `ARTIFACT_LIBRARY_MAX_LIMIT` 硬顶约束。
   */
  limit?: number;
  signal?: AbortSignal;
  forceRefresh?: boolean;
}

/** 默认页宽；改这个常量会动到 36 个消费者的素材货架，别顺手调。 */
export const MATERIAL_LIBRARY_DEFAULT_PAGE_LIMIT = 60;

export function materialLibraryPageLimit(
  input: MaterialLibraryQueryInput,
): number {
  const requested = Number(input.limit);
  return Number.isFinite(requested) && requested > 0
    ? Math.trunc(requested)
    : MATERIAL_LIBRARY_DEFAULT_PAGE_LIMIT;
}

export interface MaterialLibraryCacheSnapshot {
  data: ArtifactSearchResult;
  status?: number;
  freshness: "fresh" | "stale";
}

interface MaterialLibraryCacheEntry {
  data: ArtifactSearchResult;
  status?: number;
  storedAt: number;
  freshUntil: number;
  usableUntil: number;
}

const MATERIAL_LIBRARY_FRESH_MS = 15_000;
const MATERIAL_LIBRARY_STALE_MS = 2 * 60_000;
const MATERIAL_LIBRARY_UNKNOWN_URL_MS = 30_000;
const MATERIAL_LIBRARY_URL_EXPIRY_SKEW_MS = 60_000;
const materialLibraryCache = new Map<string, MaterialLibraryCacheEntry>();

/** In-flight 请求的同键去重表；控制器直接读写它。 */
export const materialLibraryPending = new Map<
  string,
  Promise<ArtifactApiResult<ArtifactSearchResult>>
>();

let cacheGeneration = 0;

/**
 * 缓存代次。取数途中被 `invalidateMaterialLibraryCache` 打断时，回来的那一页
 * 不许再写进缓存——代次对不上就丢掉。
 */
export function materialLibraryCacheGeneration(): number {
  return cacheGeneration;
}

export function materialLibraryRequestKey(
  input: MaterialLibraryQueryInput,
): string {
  const types = materialScopeTypes(input);
  const role = String(input.role ?? "").trim() || MATERIAL_LIBRARY_TEMPLATE_ROLE;
  const limit = materialLibraryPageLimit(input);
  return JSON.stringify({
    level: input.level,
    context:
      input.level === "primary"
        ? artifactContextKey(input.context)
        : `site:${String(input.context?.siteKey ?? "").trim()}`,
    query: input.level === "primary" ? "" : input.query.trim(),
    taxonomy: input.taxonomy,
    // Omitted for legacy single-type callers so their cache key is unchanged.
    types: types.length > 1 ? materialTypesCsv(types) : undefined,
    // Omitted when default so existing material-shelf cache keys stay stable.
    role: role === MATERIAL_LIBRARY_TEMPLATE_ROLE ? undefined : role,
    cursor: input.cursor || "",
    // 同上：页宽必须进 key（60 条那一页不能当 100 条那一页的缓存命中），
    // 但默认值不写进去，既有货架的 key 一个字节不变。
    limit: limit === MATERIAL_LIBRARY_DEFAULT_PAGE_LIMIT ? undefined : limit,
  });
}

function materialLibraryCacheUsableUntil(
  data: ArtifactSearchResult,
  storedAt: number,
): number {
  let usableUntil = storedAt + MATERIAL_LIBRARY_STALE_MS;
  for (const item of data.items) {
    if (!isDurableLibraryItem(item)) continue;
    for (const rendition of Object.values(item.artifact.renditions)) {
      if (!rendition?.url) continue;
      if (!rendition.expiresAt) {
        usableUntil = Math.min(
          usableUntil,
          storedAt + MATERIAL_LIBRARY_UNKNOWN_URL_MS,
        );
        continue;
      }
      const expiresAt = Date.parse(rendition.expiresAt);
      if (Number.isFinite(expiresAt)) {
        usableUntil = Math.min(
          usableUntil,
          expiresAt - MATERIAL_LIBRARY_URL_EXPIRY_SKEW_MS,
        );
      }
    }
  }
  return usableUntil;
}

export function rememberMaterialLibraryResult(
  key: string,
  result: ArtifactApiResult<ArtifactSearchResult>,
  storedAt = Date.now(),
): void {
  if (!result.ok || !result.data) return;
  const usableUntil = materialLibraryCacheUsableUntil(result.data, storedAt);
  if (usableUntil <= storedAt) {
    materialLibraryCache.delete(key);
    return;
  }
  // Memory-only normalized metadata: response bodies/private bytes are never
  // retained, and signed URLs are discarded before their refresh skew.
  materialLibraryCache.set(key, {
    data: result.data,
    status: result.status,
    storedAt,
    freshUntil: Math.min(usableUntil, storedAt + MATERIAL_LIBRARY_FRESH_MS),
    usableUntil,
  });
}

export function readMaterialLibraryCache(
  input: MaterialLibraryQueryInput,
  now = Date.now(),
): MaterialLibraryCacheSnapshot | null {
  const key = materialLibraryRequestKey(input);
  const cached = materialLibraryCache.get(key);
  if (!cached) return null;
  if (now >= cached.usableUntil) {
    materialLibraryCache.delete(key);
    return null;
  }
  return {
    data: cached.data,
    status: cached.status,
    freshness: now < cached.freshUntil ? "fresh" : "stale",
  };
}

export function invalidateMaterialLibraryCache(
  input?: MaterialLibraryQueryInput,
): void {
  cacheGeneration += 1;
  if (input) {
    const key = materialLibraryRequestKey(input);
    materialLibraryCache.delete(key);
    materialLibraryPending.delete(key);
    return;
  }
  materialLibraryCache.clear();
  materialLibraryPending.clear();
}
