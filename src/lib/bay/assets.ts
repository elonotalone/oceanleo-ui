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
  facts?: BayListingFacts | null;
  preview?: BayListingPreview | null;
  description?: string;
  sellerUpdateAvailable?: boolean;
  folder_id?: string | null;
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

export function getBayAssetEntitlement(listingId: string): Promise<BayEntitlement> {
  return bayGet<BayEntitlement>(`/v1/bay/assets/${encodeURIComponent(listingId)}/entitlement`);
}


/** The server resolves identities and rights; callers never infer ownership from the shelf. */
export interface BayResolvedAsset {
  asset?: BayAsset | BayDigitalAsset;
  artifactRef?: Extract<AssetRef, { kind: "artifact" }>;
  actionContext: AssetActionContext;
  facts?: BayListingFacts;
  preview?: BayListingPreview;
  description?: string;
  sellerUpdateAvailable?: boolean;
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

export interface BayListingFacts {
  kind: string | null;
  bytes: number | null;
  fileCount: number | null;
  pages: number | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  formats: string[] | null;
  license: string | null;
  version: string | number | null;
  updatedAt: string | null;
}

export interface BayListingPreview {
  kind?: string;
  tree?: { path: string; type?: "file" | "dir"; size?: number }[];
  readme?: string | null;
  images?: (string | { path?: string; url?: string })[];
  url?: string | null;
  thumbnailUrl?: string | null;
  item?: import("../../shell/library-data").LibraryItem | null;
}

export interface BayEntitlement {
  entitled: boolean;
  purchase: BayDigitalPurchase | null;
  revisionId?: string | null;
  latestRevisionId?: string | null;
  updateAvailable?: boolean;
  libraryIdentity?: { kind: "artifact" | "folder"; id: string } | null;
  editedCopies?: { id: string; title?: string; kind?: "artifact" | "folder" }[];
}

export interface BayLibraryDelivery {
  libraryIdentity: { kind: "artifact" | "folder"; id: string };
  artifactRef?: Extract<AssetRef, { kind: "artifact" }>;
  folder?: { id: string; title?: string };
  downloadUrl?: string | null;
}

export function getBayListing(id: string, signal?: AbortSignal): Promise<{ asset: BayDigitalAsset }> {
  return bayGet<BayResolvedAsset>(`/v1/bay/assets/resolve?${new URLSearchParams({ kind: "listing", id })}`, { anonymous: true, signal }).then((body) => {
    if (!body.asset) throw new Error("这件商品不存在或已经下架");
    return { asset: { ...body.asset, facts: body.facts, preview: body.preview, description: body.description,
      sellerUpdateAvailable: body.sellerUpdateAvailable ?? (body.asset as BayDigitalAsset).sellerUpdateAvailable } as BayDigitalAsset };
  });
}

export function draftBayListing(work: { kind: "artifact" | "folder"; id: string }): Promise<{ title: string; summary: string; description: string; facts: BayListingFacts; preview: BayListingPreview }> {
  return bayPost("/v1/bay/assets/draft", { digital_work: work });
}

export function updateBayPurchase(id: string): Promise<BayEntitlement> {
  return bayPost(`/v1/bay/assets/${encodeURIComponent(id)}/update`, {});
}

export function publishBayVersion(id: string): Promise<{ asset: BayDigitalAsset }> {
  return bayPost(`/v1/bay/assets/${encodeURIComponent(id)}/version`, {});
}

export function copyBayPurchase(id: string): Promise<BayLibraryDelivery> {
  return bayPost(`/v1/bay/assets/${encodeURIComponent(id)}/copy`, {});
}

export function openBayPurchase(id: string): Promise<BayLibraryDelivery> {
  return bayGet(`/v1/bay/assets/${encodeURIComponent(id)}/open`);
}
