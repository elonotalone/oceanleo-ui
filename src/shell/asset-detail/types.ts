// 2026-11-03 build wave: frozen contract shared by W2-L5A (resolve), W2-L5B (layout), W2-L5C (actions),
// W3-L5D (LeoBay routes), W4-SIDEBAR (right sidebar entry) and W3-HOMECARDS. Change only through the parent.
// One detail UI for My Library, LeoBay and the home/task right sidebar; only the action set differs.
import type { WorkspaceLibraryEntry } from "../workspace-library-model";

/** Stable identity of anything that can be opened in the shared asset detail. Same-shaped UUIDs never mix. */
export type AssetRef =
  | { kind: "platform"; id: string }
  | { kind: "template"; id: string }
  | { kind: "listing"; id: string }
  | { kind: "artifact"; artifactId: string; revisionId?: string };

export type AssetSurface = "library" | "bay" | "home" | "task";

export type AssetPurchaseState = "none" | "pending" | "settled" | "refunded";

export interface AssetCommerce {
  /** null = no price data from the server (never default it to free). */
  priceFen: number | null;
  currency: "CNY" | "USD";
  free: boolean;
  purchaseState: AssetPurchaseState;
  /** Seller listing id when the item is a marketplace listing. */
  listingId?: string;
}

export interface AssetRights {
  canView: boolean;
  canDownload: boolean;
  canDownloadSource: boolean;
  canEdit: boolean;
  canUseInTask: boolean;
  canAddToLibrary: boolean;
}

export interface AssetLicense {
  code?: string;
  url?: string;
  commercialOk?: boolean;
  modifyOk?: boolean;
  attribution?: string;
}

/** Pure data; callbacks are bound by the shared action layer (W2-L5C), never carried here. */
export interface AssetActionContext {
  surface: AssetSurface;
  ref: AssetRef;
  /** True when the signed-in user owns the item (their Library row or a settled purchase). */
  owned: boolean;
  commerce?: AssetCommerce;
  rights: AssetRights;
  license?: AssetLicense;
  author?: { name: string; id?: string };
  /** ISO time from the server row; absent only when the server truly has none. */
  createdAt?: string;
}

export interface ResolvedAssetDetail {
  entry: WorkspaceLibraryEntry;
  actionContext: AssetActionContext;
}

export type ResolveAssetDetail = (ref: AssetRef, options?: { signal?: AbortSignal; surface?: AssetSurface }) => Promise<ResolvedAssetDetail>;
