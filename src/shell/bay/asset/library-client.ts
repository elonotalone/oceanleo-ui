import { GATEWAY_BASE } from "../../../lib/auth/config";
import { bayGet } from "../../../lib/bay/http";
import type { AssetActionContext } from "../../asset-detail/types";

export type BayAssetType =
  | "image"
  | "poster"
  | "vector"
  | "video"
  | "audio"
  | "3d"
  | "ppt"
  | "document"
  | "pdf"
  | "grid"
  | "website"
  | "game";

export type BayAssetOrigin = "first-party" | "external";

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
  mime_type?: string;
  created_at?: string | null;
  updated_at?: string | null;
  price_fen?: number | null;
  currency?: string;
  purchase_state?: "none" | "pending" | "settled" | "refunded";
  free?: boolean;
  action_context?: AssetActionContext;
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



export async function fetchBayAssetById(id: string, options?: { signal?: AbortSignal }): Promise<BayAsset> {
  const raw = (id || "").trim();
  if (!raw) throw new Error("素材没读出来，请稍后再试。");
  const assetId = raw.includes(":") ? raw : `library:${raw}`;
  return bayGet<BayAsset>(`/v1/assets/detail?id=${encodeURIComponent(assetId)}`, { anonymous: true, signal: options?.signal });
}


export function bayAssetDownloadHref(id: string): string {
  return `${GATEWAY_BASE}/v1/assets/download?id=${encodeURIComponent(id)}`;
}
