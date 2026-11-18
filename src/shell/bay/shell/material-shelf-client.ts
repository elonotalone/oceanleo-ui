import { bayGet } from "../../../lib/bay/http";
import { normalizeTemplateMaterial } from "../../material-library-template-source";
import { templateMaterialToBayAsset } from "../asset/bay-template-shelf";
import type { BayAsset, BayAssetType } from "../asset/library-client";
import { parseMaterialTaxonomy, type MaterialFilters, type MaterialTaxonomy } from "./material-taxonomy";

export interface MaterialPage {
  items: BayAsset[];
  categoryCounts: Record<string, number>;
  categoryCovers: Record<string, BayAsset>;
  categoryFacets: Record<string, Record<string, string[]>>;
  contentTypePreviews: Record<string, BayAsset[]>;
  nextOfficial: number | null;
  nextSeller: string | null;
  unavailable: boolean;
}
export interface ShelfRequest { shelfType: string; filters: MaterialFilters; q?: string; siteKey: string; appId?: string; limit: number }

export function materialShelfPath(request: ShelfRequest, source: "official" | "seller", cursor?: number | string): string {
  const p = new URLSearchParams({ shelfType: request.shelfType, limit: String(request.limit) });
  const { filters } = request;
  if (request.q) p.set("q", request.q);
  if (filters.category) p.set(source === "official" ? "category" : "materialCategory", filters.category);
  if (filters.contentType) p.set("contentType", filters.contentType);
  if (Object.keys(filters.tags).length) p.set("tags", JSON.stringify(filters.tags));
  if (source === "official") {
    if (request.siteKey && request.siteKey !== "oceanleo") p.set("siteKey", request.siteKey);
    if (request.appId && request.appId !== "default") p.set("appId", request.appId);
    if (filters.format) p.set("artifactType", filters.format);
    if (cursor !== undefined) p.set("offset", String(cursor));
    return `/v1/materials?${p}`;
  }
  if (filters.format) p.set("artifactType", filters.format);
  p.set("kind", "supply"); p.set("listing_kind", "digital");
  if (cursor !== undefined) p.set("cursor", String(cursor));
  return `/v1/talent/bay/feed?${p}`;
}

export async function fetchMaterialTaxonomy(signal: AbortSignal): Promise<MaterialTaxonomy> {
  return parseMaterialTaxonomy(await bayGet("/v1/materials/taxonomy", { anonymous: true, signal }));
}

function counts(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter(([, count]) => typeof count === "number" && Number.isFinite(count) && count >= 0)) as Record<string, number>;
}

/** Detail carriers stay typed independently of the broader shelf grouping. */
export function materialBayType(artifactType: string): BayAssetType | null {
  const types: Record<string, BayAssetType> = { deck: "ppt", single_file_image: "image", vector_image: "image", composite_image: "poster",
    document: "document", pdf: "pdf", grid: "grid", website: "website", app: "website", game: "game", video: "video", model_3d: "3d", audio: "audio" };
  return types[artifactType] || null;
}

function officialAsset(raw: unknown): BayAsset | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const ref = row.assetRef as { kind?: unknown; id?: unknown } | undefined;
  const type = materialBayType(String(row.artifactType || ""));
  if (!type || !ref || typeof ref.id !== "string" || !ref.id) return null;
  if (ref.kind === "template" && row.templateId === ref.id) {
    const material = normalizeTemplateMaterial({ ...row, id: ref.id, tags: row.keywords });
    return material ? templateMaterialToBayAsset(material, type) : null;
  }
  if (ref.kind !== "platform" || row.templateId !== null) return null;
  const preview = typeof row.previewMediaUrl === "string" ? row.previewMediaUrl : "";
  return { id: `library:${ref.id}`, source: "oceanleo", type, title: String(row.title || ""), origin: "first-party",
    thumb_url: preview, preview_url: preview, full_url: "", width: null, height: null, duration: null,
    author: "OceanLeo", source_url: "", shelfKind: "official", price_fen: 0, currency: "CNY",
    license: { code: "", name: "", url: "", commercial_ok: false, modify_ok: false, attribution_required: false, attribution_text: "" },
    tags: Array.isArray(row.keywords) ? row.keywords.filter((word): word is string => typeof word === "string") : [],
  };
}

function sellerAsset(raw: unknown): BayAsset | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id || typeof row.title !== "string") return null;
  const author = row.author as { display_name?: string; handle?: string } | undefined;
  const material = row.material as { artifactType?: string; format?: string } | undefined;
  const type = materialBayType(material?.artifactType || "") || "";
  const price = row.price as { min_fen?: unknown; currency?: string } | undefined;
  return { id: `listing:${row.id}`, source: "seller", type, title: row.title,
    thumb_url: typeof row.cover_url === "string" ? row.cover_url : "", preview_url: "", full_url: "",
    width: null, height: null, duration: null, author: author?.display_name || author?.handle || "", source_url: "",
    price_fen: typeof price?.min_fen === "number" ? price.min_fen : undefined,
    currency: typeof price?.currency === "string" ? price.currency : undefined,
    license: { code: "", name: "", url: "", commercial_ok: false, modify_ok: false, attribution_required: false, attribution_text: "" },
  };
}

export async function fetchMaterialShelf(request: ShelfRequest, options: {
  signal: AbortSignal; sellers: boolean; officialOffset?: number | null; sellerCursor?: string | null;
}): Promise<MaterialPage> {
  const jobs: Promise<{ items?: unknown[]; categoryCounts?: unknown; categoryCovers?: Record<string, unknown>; categoryFacets?: Record<string, Record<string, string[]>>; contentTypePreviews?: Record<string, unknown[]>; nextOffset?: number | null; next_cursor?: string | null } | null>[] = [
    options.officialOffset === null ? Promise.resolve(null) : bayGet(materialShelfPath(request, "official", options.officialOffset), { anonymous: true, signal: options.signal }),
    !options.sellers || options.sellerCursor === null ? Promise.resolve(null) : bayGet(materialShelfPath(request, "seller", options.sellerCursor), { anonymous: true, signal: options.signal }),
  ];
  const results = await Promise.allSettled(jobs);
  options.signal.throwIfAborted();
  const page: MaterialPage = { items: [], categoryCounts: {}, categoryCovers: {}, categoryFacets: {}, contentTypePreviews: {}, nextOfficial: null, nextSeller: null, unavailable: false };
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") { page.unavailable = true; continue; }
    const raw = result.value;
    if (!raw) continue;
    if (!Array.isArray(raw.items)) { page.unavailable = true; continue; }
    page.items.push(...raw.items.map(index === 0 ? officialAsset : sellerAsset).filter((item): item is BayAsset => Boolean(item)));
    for (const [key, count] of Object.entries(counts(raw.categoryCounts))) page.categoryCounts[key] = (page.categoryCounts[key] || 0) + count;
    const project = index === 0 ? officialAsset : sellerAsset;
    for (const [key, value] of Object.entries(raw.categoryCovers || {})) {
      const asset = project(value);
      if (asset) page.categoryCovers[key] ||= asset;
    }
    for (const [category, dimensions] of Object.entries(raw.categoryFacets || {})) {
      const facets = page.categoryFacets[category] ||= {};
      for (const [key, values] of Object.entries(dimensions)) if (Array.isArray(values)) {
        facets[key] = [...new Set([...(facets[key] || []), ...values.filter((value): value is string => typeof value === "string")])];
      }
    }
    for (const [key, values] of Object.entries(raw.contentTypePreviews || {})) {
      if (Array.isArray(values)) (page.contentTypePreviews[key] ||= []).push(...values.map(project).filter((item): item is BayAsset => Boolean(item)));
    }
    if (index === 0) page.nextOfficial = typeof raw.nextOffset === "number" ? raw.nextOffset : null;
    else page.nextSeller = typeof raw.next_cursor === "string" && raw.next_cursor ? raw.next_cursor : null;
  }
  return page;
}
