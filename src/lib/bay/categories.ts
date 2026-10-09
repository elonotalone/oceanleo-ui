// Bay 类目：交付类目 = 33 个功能站 + other（slug = 站 key）。全项目只认网关返回的这一份，前端不另抄。
// site_defaults 里功能站默认就是它自己；aitools / asset 为 other；门户 oceanleo 为 null。
import { bayGet } from "./http";
import type { BayCategoriesResponse, BayCategory } from "./types";

const TTL_MS = 10 * 60 * 1000;
let cached: Promise<BayCategoriesResponse> | null = null;
let cachedAt = 0;

function asCategory(value: unknown): BayCategory | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<BayCategory>;
  if (typeof row.slug !== "string" || !row.slug) return null;
  return {
    ...(row as BayCategory),
    parent_slug: typeof row.parent_slug === "string" ? row.parent_slug : null,
    name_zh: typeof row.name_zh === "string" ? row.name_zh : row.slug,
    name_en: typeof row.name_en === "string" ? row.name_en : row.slug,
    position: typeof row.position === "number" ? row.position : 0,
    published: row.published !== false,
    catalog_kind: row.catalog_kind === "delivery" || row.catalog_kind === "consult" ? row.catalog_kind : null,
    regulated_domain: typeof row.regulated_domain === "string" ? row.regulated_domain : null,
    main_site: typeof row.main_site === "string" ? row.main_site : null,
  };
}

export function normalizeBayCategories(raw: unknown): BayCategoriesResponse {
  const body = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof BayCategoriesResponse, unknown>>;
  const items = Array.isArray(body.items) ? body.items.map(asCategory).filter((row): row is BayCategory => !!row) : [];
  const flat = Array.isArray(body.flat_items)
    ? body.flat_items.map(asCategory).filter((row): row is BayCategory => !!row)
    : items;
  const defaults: Record<string, string | null> = {};
  if (body.site_defaults && typeof body.site_defaults === "object") {
    for (const [site, slug] of Object.entries(body.site_defaults as Record<string, unknown>)) {
      defaults[site] = typeof slug === "string" && slug ? slug : null;
    }
  }
  return { items, flat_items: flat, total: typeof body.total === "number" ? body.total : flat.length, site_defaults: defaults };
}

/** 取类目（匿名可调）；10 分钟内复用同一份，失败不缓存。 */
export function fetchBayCategories(opts?: { force?: boolean }): Promise<BayCategoriesResponse> {
  const now = Date.now();
  if (!opts?.force && cached && now - cachedAt < TTL_MS) return cached;
  cachedAt = now;
  const pending = bayGet<unknown>("/v1/talent/categories", { anonymous: true }).then(normalizeBayCategories);
  cached = pending;
  pending.catch(() => {
    if (cached === pending) cached = null;
  });
  return pending;
}

/** 顶上那排卡片：33 个功能站 + other，按 position 排。 */
export function deliveryCategories(data: BayCategoriesResponse | null | undefined): BayCategory[] {
  if (!data) return [];
  const rows = data.flat_items.length ? data.flat_items : data.items;
  return rows
    .filter((row) => row.catalog_kind === "delivery" && row.published && !row.parent_slug)
    .sort((a, b) => a.position - b.position);
}

/** 站 → 默认类目（读接口的 `site_defaults`）；门户与没登记的站为 null。 */
export function siteDefaultCategory(data: BayCategoriesResponse | null | undefined, siteKey: string): string | null {
  const key = typeof siteKey === "string" ? siteKey.trim().toLowerCase() : "";
  if (!data || !key || key === "oceanleo") return null;
  const slug = data.site_defaults[key];
  return typeof slug === "string" && slug ? slug : null;
}

/** 异步版：先取（带缓存的）类目再查 `site_defaults`；取不到返回 null。 */
export async function defaultCategoryForSite(siteKey: string): Promise<string | null> {
  try {
    return siteDefaultCategory(await fetchBayCategories(), siteKey);
  } catch {
    return null;
  }
}

/** 测试与登出后用：丢掉缓存。 */
export function resetBayCategoriesCache(): void {
  cached = null;
  cachedAt = 0;
}
