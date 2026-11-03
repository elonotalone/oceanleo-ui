import type { AssetRef } from "./asset-detail/types";

export const HOME_ASSET_SECTION_IDS = ["video", "image", "website", "essay"] as const;
export type HomeAssetSectionId = (typeof HOME_ASSET_SECTION_IDS)[number];
export type HomeAssetRef = Extract<AssetRef, { kind: "platform" | "template" }>;

/** GET /v1/home/assets: preview belongs to the same public asset as ref. */
export interface HomeAssetCard {
  ref: HomeAssetRef;
  title: string;
  summary?: string;
  promptText?: string;
  preview: { key?: string; url?: string; mime?: string; width?: number; height?: number };
}

export interface HomeAssetSection {
  id: HomeAssetSectionId;
  items: HomeAssetCard[];
}

export interface HomeAssetsResponse {
  sections: HomeAssetSection[];
}

export function homeAssetCardKey(ref: HomeAssetRef): string {
  return `${ref.kind}:${ref.id}`;
}

/** Always render every section; preserve the server's curated item ordering. */
export function homeAssetSections(sections: readonly HomeAssetSection[]): HomeAssetSection[] {
  return HOME_ASSET_SECTION_IDS.map((id) => ({
    id,
    items: sections.filter((section) => section.id === id).flatMap((section) => section.items),
  }));
}
