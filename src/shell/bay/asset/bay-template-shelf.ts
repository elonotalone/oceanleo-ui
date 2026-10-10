/**
 * Bay 自有栏：已发布官方成品 ∪ 原件货架；「我的」走 /v1/library/mine。
 *
 * 官方成品点开只用 `workspaceTemplatePreviewHref`。这里不走会 fork 的编辑判定。
 */

import { assetPreviewUrl, assetThumbUrl } from "../../../lib/asset-thumb";
import { listMyArtifacts } from "../../artifact-client";
import type { ArtifactType } from "../../artifact-contract";
import type { LibraryItem } from "../../library-data";
import {
  listTemplateMaterials,
  templateMaterialEntryId,
  type TemplateMaterialListing,
} from "../../material-library-template-source";
import { workspaceTemplatePreviewHref } from "../../site-catalog-controller";
import {
  LIBRARY_ITEM_QUERY_KEY,
  LIBRARY_TAB_QUERY_KEY,
  LIBRARY_TAB_VALUE,
  workspaceAppHref,
} from "../../workspace-route";
import type { BayAsset, BayAssetLicense, BayAssetType } from "./library-client";

export const OFFICIAL_TEMPLATE_CATEGORY = "official-templates";
export const BAY_OFFICIAL_PREVIEW_COUNT = 6;
export const BAY_TEMPLATE_PAGE_SIZE = 30;

const OFFICIAL_LICENSE: BayAssetLicense = {
  code: "OCEANLEO-FIRST-PARTY",
  name: "OceanLeo 官方成品",
  url: "",
  commercial_ok: true,
  modify_ok: true,
  attribution_required: false,
  attribution_text: "",
};

const MINE_LICENSE: BayAssetLicense = {
  code: "OCEANLEO-OWNED",
  name: "我的成品",
  url: "",
  commercial_ok: true,
  modify_ok: true,
  attribution_required: false,
  attribution_text: "",
};

/** Bay 类型 → 官方模板 artifactType。图片不并复合海报；贴纸/字体/Prompt 只走原件。 */
export const BAY_TEMPLATE_ARTIFACT_TYPE: Partial<
  Record<BayAssetType, ArtifactType>
> = {
  website: "website",
  ppt: "deck",
  document: "document",
  poster: "composite_image",
  chart: "chart",
  vector: "vector_image",
  "3d": "model_3d",
  video: "video",
  audio: "audio",
  grid: "grid",
  workflow: "workflow",
  game: "game",
  pdf: "pdf",
};

/** 自有栏还要并上的原件货架 type。海报/游戏没有原件。表格走 sheet，工作流走 video_workflow。 */
export const BAY_OWNED_ORIGIN_TYPE: Partial<Record<BayAssetType, string>> = {
  website: "website",
  ppt: "ppt",
  document: "document",
  image: "image",
  chart: "chart",
  vector: "vector",
  "3d": "3d",
  video: "video",
  audio: "audio",
  music: "audio",
  font: "font",
  sticker: "sticker",
  prompt: "prompt",
  grid: "sheet",
  workflow: "video_workflow",
  pdf: "pdf",
};

const DEFAULT_APP_FOR_BAY_TYPE: Partial<Record<BayAssetType, string>> = {
  website: "website",
  ppt: "ppt",
  document: "document",
  poster: "poster",
  chart: "chart",
  grid: "chart",
  vector: "image",
  image: "image",
  "3d": "3d-model",
  video: "video",
  audio: "audio",
  workflow: "flowchart",
  game: "game",
  pdf: "document",
};

export function templateArtifactTypeForBay(
  type: BayAssetType,
): ArtifactType | null {
  return BAY_TEMPLATE_ARTIFACT_TYPE[type] || null;
}

export function mineArtifactTypeForBay(type: BayAssetType): ArtifactType | null {
  if (type === "image") return "single_file_image";
  return templateArtifactTypeForBay(type);
}

export function originLibraryTypeForBay(type: BayAssetType): string | null {
  return BAY_OWNED_ORIGIN_TYPE[type] || null;
}

export function originShelfOptional(type: BayAssetType): boolean {
  return (
    type === "poster" ||
    type === "game" ||
    type === "grid" ||
    type === "workflow" ||
    type === "pdf"
  );
}

export function officialTemplatePreviewHref(
  appId: string,
  artifactId: string,
): string {
  return workspaceTemplatePreviewHref(appId, artifactId);
}

export function mineArtifactOpenHref(appId: string, artifactId: string): string {
  const id = (appId || "").trim();
  const artifact = (artifactId || "").trim();
  if (!id || !artifact) return "";
  const query = new URLSearchParams();
  query.set(LIBRARY_TAB_QUERY_KEY, LIBRARY_TAB_VALUE);
  query.set(LIBRARY_ITEM_QUERY_KEY, artifact);
  return `${workspaceAppHref(id)}?${query.toString()}`;
}

export function appIdFromContextId(contextId: string): string {
  const raw = (contextId || "").trim();
  const marker = ":app:";
  const at = raw.indexOf(marker);
  if (at < 0) return "";
  const encoded = raw.slice(at + marker.length);
  if (!encoded) return "";
  try {
    return decodeURIComponent(encoded).trim();
  } catch {
    return encoded.trim();
  }
}

function appIdFromLibraryItem(item: LibraryItem): string {
  const bindings = item.artifact?.bindings || [];
  for (const binding of bindings) {
    const parsed = appIdFromContextId(binding.contextId);
    if (parsed) return parsed;
  }
  const meta = item.meta || {};
  return String(meta.app_id || meta.appId || "").trim();
}

export function templateMaterialToBayAsset(
  material: TemplateMaterialListing,
  bayType: BayAssetType,
): BayAsset {
  const preview = assetPreviewUrl(material.previewKey);
  const thumb = assetThumbUrl(material.previewKey) || preview;
  return {
    id: templateMaterialEntryId(material),
    source: "oceanleo",
    type: bayType,
    origin: "first-party",
    title: material.title,
    thumb_url: thumb,
    preview_url: preview,
    full_url: preview,
    width: material.width || null,
    height: material.height || null,
    duration: null,
    author: "OceanLeo",
    source_url: "",
    license: OFFICIAL_LICENSE,
    tags: material.tags,
    category: OFFICIAL_TEMPLATE_CATEGORY,
    openHref: officialTemplatePreviewHref(material.appId, material.artifactId),
    shelfKind: "official",
  };
}

export function libraryItemToBayAsset(
  item: LibraryItem,
  bayType: BayAssetType,
): BayAsset {
  const thumb = item.posterUrl || item.thumbUrl || item.previewUrl || "";
  const preview = item.previewUrl || item.url || thumb;
  const artifactId = item.artifactId || item.id;
  const appId =
    appIdFromLibraryItem(item) || DEFAULT_APP_FOR_BAY_TYPE[bayType] || "";
  return {
    id: item.key || (artifactId ? `artifact:${artifactId}` : item.id),
    source: "oceanleo",
    type: bayType,
    origin: "first-party",
    title: item.title,
    thumb_url: thumb,
    preview_url: preview,
    full_url: item.url || preview,
    width: null,
    height: null,
    duration: null,
    author: "我",
    source_url: "",
    license: MINE_LICENSE,
    openHref: mineArtifactOpenHref(appId, artifactId),
    shelfKind: "mine",
  };
}

export function mergeOwnedAssets(
  templates: readonly BayAsset[],
  originals: readonly BayAsset[],
): BayAsset[] {
  const seen = new Set(templates.map((item) => item.id));
  const merged = [...templates];
  for (const item of originals) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push({ ...item, shelfKind: item.shelfKind || "origin" });
  }
  return merged;
}

function matchesQuery(asset: BayAsset, q: string): boolean {
  if (!q) return true;
  const hay = [asset.title, asset.author, ...(asset.tags || [])]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export async function listBayOfficialTemplates(options: {
  type: BayAssetType;
  q?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}): Promise<{ items: BayAsset[]; total: number; hasMore: boolean }> {
  const artifactType = templateArtifactTypeForBay(options.type);
  if (!artifactType) return { items: [], total: 0, hasMore: false };
  const q = (options.q || "").trim().toLowerCase();
  // Do not pass limit/offset to the catalog. Until the gateway honors
  // artifactType, a server page is a mixed-type window and filtering it
  // looks like an empty shelf. One unpaged fetch is cached; we slice here.
  const result = await listTemplateMaterials({
    artifactType,
    signal: options.signal,
  });
  if (!result.ok) {
    throw new Error(result.error || "官方成品暂时无法加载。");
  }
  const materials = result.data || [];
  let items = materials.map((material) =>
    templateMaterialToBayAsset(material, options.type),
  );
  if (q) items = items.filter((item) => matchesQuery(item, q));
  const total = items.length;
  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit;
  const page = limit != null ? items.slice(offset, offset + limit) : items;
  return {
    items: page,
    total,
    hasMore: limit != null && offset + page.length < total,
  };
}

export async function listBayMineArtifacts(options: {
  type: BayAssetType;
  q?: string;
  offset?: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<{
  items: BayAsset[];
  total: number;
  hasMore: boolean;
  unauthenticated: boolean;
}> {
  const artifactType = mineArtifactTypeForBay(options.type);
  if (!artifactType) {
    return { items: [], total: 0, hasMore: false, unauthenticated: false };
  }
  const result = await listMyArtifacts({
    artifactType,
    offset: options.offset,
    limit: options.limit ?? BAY_TEMPLATE_PAGE_SIZE,
    signal: options.signal,
  });
  if (!result.ok) {
    const unauthenticated =
      result.status === 401 ||
      result.status === 403 ||
      result.code === "unauthorized";
    if (unauthenticated) {
      return { items: [], total: 0, hasMore: false, unauthenticated: true };
    }
    throw new Error(result.error || "我的成品暂时无法加载。");
  }
  const q = (options.q || "").trim().toLowerCase();
  let items = (result.data?.items || []).map((item) =>
    libraryItemToBayAsset(item, options.type),
  );
  if (q) items = items.filter((item) => matchesQuery(item, q));
  const total = result.data?.total ?? items.length;
  const next = result.data?.nextCursor;
  return {
    items,
    total: typeof total === "number" ? total : items.length,
    hasMore: Boolean(next) && next !== "0",
    unauthenticated: false,
  };
}
