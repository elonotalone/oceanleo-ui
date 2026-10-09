import { GATEWAY_BASE } from "../../../lib/auth/config";

export type BayAssetType =
  | "image"
  | "vector"
  | "sticker"
  | "video"
  | "audio"
  | "music"
  | "3d"
  | "font"
  | "ppt"
  | "document"
  | "chart"
  | "prompt"
  | "website";

export type BayAssetOrigin = "first-party" | "external";
export type BayAssetZone = "owned" | "stocked" | "live";

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
}

export const BAY_ASSET_TYPE_ORDER: readonly BayAssetType[] = [
  "image",
  "prompt",
  "chart",
  "vector",
  "sticker",
  "ppt",
  "document",
  "website",
  "video",
  "3d",
  "audio",
  "font",
];

export const BAY_ASSET_TYPE_LABELS: Record<BayAssetType, string> = {
  image: "图片",
  vector: "矢量图",
  sticker: "贴纸",
  video: "视频",
  audio: "音频",
  music: "音乐",
  "3d": "3D 模型",
  font: "字体",
  ppt: "PPT 模板",
  document: "文档",
  chart: "图表",
  prompt: "Prompt 示例",
  website: "网站",
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
  poster: { type: "image", room: "poster" },
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
  type: BayAssetType;
  origin?: BayAssetOrigin;
  category?: string;
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
  if (params.origin) qs.set("origin", params.origin);
  if (params.category) qs.set("category", params.category);
  const lib = await getJson<{
    items?: BayAsset[];
    page?: number;
    page_size?: number;
    total?: number;
  }>(`/v1/assets/library/search?${qs.toString()}`);
  const raw = Array.isArray(lib.items) ? lib.items : [];
  const items = params.origin
    ? raw.filter((item) => item.origin === params.origin)
    : raw;
  const total = typeof lib.total === "number" ? lib.total : undefined;
  return {
    items,
    page,
    has_more:
      typeof total === "number"
        ? page * (params.pageSize || 24) < total
        : items.length >= (params.pageSize || 24),
    total,
  };
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
