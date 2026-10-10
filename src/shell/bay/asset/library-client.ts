import { GATEWAY_BASE } from "../../../lib/auth/config";
import { attachShelfPins, itemMatchesPin } from "./shelf-pins";

export type BayAssetType =
  | "image"
  | "poster"
  | "vector"
  | "sticker"
  | "video"
  | "audio"
  | "music"
  | "3d"
  | "font"
  | "ppt"
  | "document"
  | "pdf"
  | "chart"
  | "grid"
  | "prompt"
  | "website"
  | "workflow"
  | "game";

export type BayAssetOrigin = "first-party" | "external";
export type BayAssetZone = "owned" | "mine" | "stocked" | "live";

export interface BayAssetLicense {
  code: string;
  name: string;
  url: string;
  commercial_ok: boolean;
  modify_ok: boolean;
  attribution_required: boolean;
  attribution_text: string;
}

export interface BayAsset {
  id: string;
  source: string;
  type: string;
  origin?: BayAssetOrigin;
  title: string;
  thumb_url: string;
  preview_url: string;
  full_url: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  format?: string;
  category?: string;
  author: string;
  source_url: string;
  license: BayAssetLicense;
  prompt?: string;
  tags?: string[];
  oss_key?: string;
  file_size?: number | null;
  series_id?: string;
  series_name?: string;
  /**
   * 官方成品 / 我的稿点开走这条只读深链，不打开素材详情弹层。
   * 原件货架件没有这个字段，仍走原来的详情。
   */
  openHref?: string;
  shelfKind?: "official" | "origin" | "mine";
}

export interface BaySeries {
  series_id: string;
  series_name: string;
  type: BayAssetType;
  count: number;
  covers: string[];
}

export const BAY_ASSET_TYPE_ORDER: readonly BayAssetType[] = [
  "image",
  "poster",
  "prompt",
  "chart",
  "grid",
  "vector",
  "sticker",
  "ppt",
  "document",
  "pdf",
  "website",
  "workflow",
  "game",
  "video",
  "3d",
  "audio",
  "font",
];

export const BAY_ASSET_TYPE_LABELS: Record<BayAssetType, string> = {
  image: "图片",
  poster: "海报",
  vector: "矢量图",
  sticker: "贴纸",
  video: "视频",
  audio: "音频",
  music: "音乐",
  "3d": "3D 模型",
  font: "字体",
  ppt: "PPT 模板",
  document: "文档",
  pdf: "PDF",
  chart: "图表",
  grid: "表格",
  prompt: "Prompt 示例",
  website: "网站",
  workflow: "工作流",
  game: "游戏",
};

export const LIVE_SEARCH_TYPES: readonly BayAssetType[] = [
  "image",
  "vector",
  "video",
  "audio",
  "3d",
];

export const SITE_DEFAULT_ASSET_TYPE: Readonly<Record<string, BayAssetType>> = {
  image: "image",
  design: "image",
  logo: "image",
  ecommerce: "image",
  interior: "image",
  video: "video",
  music: "audio",
  threed: "3d",
  ppt: "ppt",
  word: "document",
  law: "document",
  paper: "document",
  resume: "document",
  study: "document",
  edu: "document",
  novel: "document",
  script: "document",
  meeting: "document",
  notebook: "document",
  website: "website",
  excel: "chart",
  converter: "document",
};

export const APP_ASSET_PRESET: Readonly<Record<string, { type: BayAssetType; room?: string }>> = {
  poster: { type: "poster" },
  "longform-poster": { type: "image", room: "poster" },
  "3d-model": { type: "3d" },
  ppt: { type: "ppt" },
  document: { type: "document" },
  image: { type: "image" },
  video: { type: "video" },
  audio: { type: "audio" },
  music: { type: "audio" },
  font: { type: "font" },
  chart: { type: "chart" },
  website: { type: "website" },
  prompt: { type: "prompt" },
  resume: { type: "document", room: "resume" },
  flowchart: { type: "ppt", room: "flowchart" },
  ecommerce: { type: "image", room: "ecommerce" },
};

export function defaultAssetTypeForSite(siteOrCategory: string | null | undefined): BayAssetType {
  const key = typeof siteOrCategory === "string" ? siteOrCategory.trim().toLowerCase() : "";
  return SITE_DEFAULT_ASSET_TYPE[key] ?? "image";
}

export function zoneIsLive(zone: BayAssetZone): boolean {
  return zone === "live";
}

export function zoneOrigin(zone: BayAssetZone): BayAssetOrigin | null {
  if (zone === "owned") return "first-party";
  if (zone === "stocked") return "external";
  return null;
}

export function liveSearchAvailable(type: BayAssetType): boolean {
  return LIVE_SEARCH_TYPES.includes(type);
}

async function getJson<T>(path: string): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${GATEWAY_BASE}${path}`, {
      cache: "no-store",
      credentials: "include",
    });
  } catch {
    throw new Error("素材没读出来，请稍后再试。");
  }
  let data: unknown = null;
  try {
    data = await resp.json();
  } catch {
    /* non-JSON */
  }
  if (!resp.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data
        ? String((data as { detail?: unknown }).detail || "")
        : "";
    throw new Error(detail || `请求失败（HTTP ${resp.status}）`);
  }
  return data as T;
}

export interface BayAssetSearchResult {
  items: BayAsset[];
  page: number;
  has_more: boolean;
  total?: number;
}

export async function searchBayLibrary(params: {
  q?: string;
  type: string;
  origin?: BayAssetOrigin;
  category?: string;
  subtab?: string;
  seriesId?: string;
  page?: number;
  pageSize?: number;
}): Promise<BayAssetSearchResult> {
  const page = params.page || 1;
  const pageSize = params.pageSize || 24;
  const qs = new URLSearchParams({
    q: params.q || "",
    type: params.type,
    license: "commercial",
    page: String(page),
    page_size: String(pageSize),
  });
  if (params.origin) qs.set("origin", params.origin);
  if (params.category) qs.set("category", params.category);
  if (params.subtab) qs.set("subtab", params.subtab);
  if (params.seriesId) qs.set("series_id", params.seriesId);
  const lib = await getJson<{
    items?: BayAsset[];
    page?: number;
    page_size?: number;
    total?: number;
  }>(`/v1/assets/library/search?${qs.toString()}`);
  const raw = Array.isArray(lib.items) ? lib.items : [];
  let items = params.origin
    ? raw.filter((item) => item.origin === params.origin)
    : raw;
  if (params.category) {
    items = await attachShelfPins({
      category: params.category,
      page,
      items,
      searchPinned: async (matcher) => {
        const needle = matcher.titlePrefix || matcher.ossKeyIncludes || "";
        if (!needle) throw new Error("pinned matcher has no searchable prefix");
        const pinQs = new URLSearchParams({
          q: needle,
          type: params.type,
          license: "commercial",
          page: "1",
          page_size: "8",
          category: params.category || "",
        });
        if (params.origin) pinQs.set("origin", params.origin);
        const pinLib = await getJson<{ items?: BayAsset[] }>(
          `/v1/assets/library/search?${pinQs.toString()}`,
        );
        const hit = (pinLib.items || []).find((item) => itemMatchesPin(item, matcher));
        if (!hit) throw new Error("pinned asset not ingested yet");
        if (params.origin && hit.origin && hit.origin !== params.origin) {
          throw new Error("pinned asset origin mismatch");
        }
        return hit;
      },
    });
  }
  const total = typeof lib.total === "number" ? lib.total : undefined;
  return {
    items,
    page,
    has_more:
      typeof total === "number"
        ? page * (lib.page_size || pageSize) < total
        : items.length >= pageSize,
    total,
  };
}

export async function listBayCategories(
  type: string,
  origin?: BayAssetOrigin,
): Promise<{ categories: string[] }> {
  const qs = new URLSearchParams({ type });
  if (origin) qs.set("origin", origin);
  return getJson<{ categories: string[] }>(`/v1/assets/library/categories?${qs.toString()}`);
}

export async function listBaySeries(type?: BayAssetType): Promise<{ series: BaySeries[] }> {
  const qs = type ? `?type=${encodeURIComponent(type)}` : "";
  const data = await getJson<{ series?: BaySeries[] }>(`/v1/assets/library/series${qs}`);
  return { series: Array.isArray(data.series) ? data.series : [] };
}

export async function fetchBayAssetById(id: string): Promise<BayAsset> {
  const raw = (id || "").trim();
  if (!raw) throw new Error("素材没读出来，请稍后再试。");
  const assetId = raw.includes(":") ? raw : `library:${raw}`;
  return getJson<BayAsset>(`/v1/assets/detail?id=${encodeURIComponent(assetId)}`);
}

export async function searchBayLive(params: {
  q?: string;
  type: BayAssetType;
  page?: number;
  pageSize?: number;
}): Promise<BayAssetSearchResult> {
  const page = params.page || 1;
  const qs = new URLSearchParams({
    q: params.q || "",
    type: params.type,
    license: "commercial",
    page: String(page),
    page_size: String(params.pageSize || 24),
  });
  const live = await getJson<{
    items?: BayAsset[];
    has_more?: boolean;
  }>(`/v1/assets/search?${qs.toString()}`);
  const items = Array.isArray(live.items) ? live.items : [];
  return {
    items,
    page,
    has_more: Boolean(live.has_more),
  };
}

export function bayAssetDownloadHref(id: string): string {
  return `${GATEWAY_BASE}/v1/assets/download?id=${encodeURIComponent(id)}`;
}
