import { GATEWAY_BASE } from "../../../lib/auth/config";
import type { BayAsset, BayAssetLicense } from "./library-client";

export interface BayAssetLicenseFull extends BayAssetLicense {
  notice_required?: boolean;
  share_alike?: boolean;
  redistribute_ok?: boolean;
}

export interface BayAssetFull extends BayAsset {
  file_size?: number | null;
  oss_key?: string;
  tags?: string[];
  redistribute_ok?: boolean;
  supply_tier?: string;
  download_url?: string;
  license: BayAssetLicenseFull;
}

export interface BayAssetDetailResult {
  id: string;
  source: string;
  files?: { format: string; url: string }[];
  raw?: Record<string, unknown>;
}

async function getJson<T>(path: string): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${GATEWAY_BASE}${path}`, { cache: "no-store", credentials: "include" });
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

/** 对齐原站 `/v1/assets/detail`：给 Poly Haven 等实时件补可下载文件列表。 */
export function assetDetail(id: string): Promise<BayAssetDetailResult> {
  return getJson<BayAssetDetailResult>(`/v1/assets/detail?id=${encodeURIComponent(id)}`);
}

export function downloadHref(asset: Pick<BayAssetFull, "id" | "source" | "full_url">): string {
  if (asset.id.startsWith("library:")) {
    return asset.full_url;
  }
  if (asset.source === "polyhaven") {
    return `${GATEWAY_BASE}/v1/assets/download?id=${encodeURIComponent(asset.id)}`;
  }
  return asset.full_url;
}

export function pptPageCount(asset: Pick<BayAssetFull, "tags">): number {
  for (const tag of asset.tags || []) {
    const match = /^pages:(\d+)$/.exec(tag);
    if (match) return Math.min(60, Math.max(1, Number(match[1])));
  }
  return 0;
}

export function pptPageUrls(asset: Pick<BayAssetFull, "tags" | "full_url">): string[] {
  const count = pptPageCount(asset);
  const base = asset.full_url.replace(/\/deck\.pptx$/, "");
  if (!count || base === asset.full_url) return [];
  return Array.from({ length: count }, (_, i) => `${base}/p${String(i + 1).padStart(2, "0")}.webp`);
}

export function asBayAssetFull(asset: BayAsset): BayAssetFull {
  return asset as BayAssetFull;
}
