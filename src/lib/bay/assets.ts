import { bayGet, bayPost } from "./http";
import type { AssetActionContext, AssetRef } from "../../shell/asset-detail/types";
import type { BayAsset } from "../../shell/bay/asset/library-client";

export interface BayDigitalAsset {
  id: string;
  listing_id: string;
  title: string;
  summary: string;
  cover_url: string | null;
  seller_id: string;
  price_fen: number | null;
  currency: string;
  license: string | null;
  created_at: string | null;
  purchase_site: string | null;
  artifact_id: string | null;
  revision_id: string | null;
  purchase_state: "none" | "not_purchased" | "pending" | "settled" | "refunded" | "cancelled";
  purchase_count: number;
  type?: string;
  thumb_url?: string;
  preview_url?: string;
  full_url?: string;
  mime_type?: string;
  format?: string;
  width?: number | null;
  height?: number | null;
  author?: string;
  action_context?: AssetActionContext;
}

export interface BayDigitalPurchase {
  id: string;
  listing_id: string;
  artifact_id: string | null;
  revision_id: string | null;
  price_fen: number;
  currency: string;
  purchase_site: string;
  status: string;
  created_at: string | null;
  entitled?: boolean;
}

export function listBayAssets(params: { site?: string; q?: string; limit?: number } = {}): Promise<{ items: BayDigitalAsset[] }> {
  const query = new URLSearchParams();
  if (params.site) query.set("site", params.site);
  if (params.q) query.set("q", params.q);
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query}` : "";
  return bayGet<{ items: BayDigitalAsset[] }>(`/v1/bay/assets${suffix}`, { anonymous: true });
}

export function listFeaturedBayAssets(site?: string, limit?: number): Promise<{ items: BayDigitalAsset[] }> {
  const query = new URLSearchParams();
  if (site) query.set("site", site);
  if (limit) query.set("limit", String(limit));
  const suffix = query.toString() ? `?${query}` : "";
  return bayGet<{ items: BayDigitalAsset[] }>(`/v1/bay/assets/featured${suffix}`, { anonymous: true });
}

export function purchaseBayAsset(listingId: string, input: { purchase_site?: string; idempotency_key?: string } = {}): Promise<{ purchase: BayDigitalPurchase }> {
  return bayPost<{ purchase: BayDigitalPurchase }>(`/v1/bay/assets/${encodeURIComponent(listingId)}/purchase`, {
    purchase_site: input.purchase_site || "home",
    idempotency_key: input.idempotency_key || "",
  });
}

export function getBayAssetEntitlement(listingId: string): Promise<{ entitled: boolean; purchase: BayDigitalPurchase | null }> {
  return bayGet<{ entitled: boolean; purchase: BayDigitalPurchase | null }>(`/v1/bay/assets/${encodeURIComponent(listingId)}/entitlement`);
}


/** The server resolves identities and rights; callers never infer ownership from the shelf. */
export interface BayResolvedAsset {
  asset?: BayAsset | BayDigitalAsset;
  artifactRef?: Extract<AssetRef, { kind: "artifact" }>;
  actionContext: AssetActionContext;
}

export function resolveBayAsset(ref: AssetRef, options?: { signal?: AbortSignal }): Promise<BayResolvedAsset> {
  const query = new URLSearchParams({ kind: ref.kind, id: ref.kind === "artifact" ? ref.artifactId : ref.id });
  if (ref.kind === "artifact" && ref.revisionId) query.set("revision_id", ref.revisionId);
  return bayGet<BayResolvedAsset>(`/v1/bay/assets/resolve?${query}`, { anonymous: true, signal: options?.signal });
}

export interface BayAssetClaim extends BayResolvedAsset {
  ref?: Extract<AssetRef, { kind: "platform" }>;
  libraryIdentity: Extract<AssetRef, { kind: "platform" | "listing" }>;
  collectionAssetId?: string;
  claim?: { id: string; status: "settled"; created_at?: string };
  purchase?: BayDigitalPurchase;
}

/** Platform identity is intentionally separate from a paid seller listing id. */
export function claimBayAsset(ref: Extract<AssetRef, { kind: "platform" | "listing" }>): Promise<BayAssetClaim> {
  return bayPost<BayAssetClaim>("/v1/bay/assets/claim", { ref });
}
