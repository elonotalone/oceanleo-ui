/** Catalog projections retain existing detail identity and purchase rights. */

import { assetPreviewUrl, assetThumbUrl } from "../../../lib/asset-thumb";
import {
  templateMaterialEntryId,
  templateMaterialEntry,
  type TemplateMaterialListing,
} from "../../material-library-template-source";
import {
  isFamilyEmbedOverrideHost,
  parseFamilyEmbedOriginEnv,
} from "../../family-embed-origin";
import { workspaceTemplatePreviewHref } from "../../site-catalog-controller";
import type { BayAssetLicense, BayAssetType } from "./library-client";

import { withOfficialCatalog, type BayOfficialAsset } from "./catalog/official-catalog";
export type { BayOfficialAsset, BayOfficialIdentity, BayOfficialSource } from "./catalog/official-catalog";

export const OFFICIAL_TEMPLATE_CATEGORY = "official-templates";

const OFFICIAL_LICENSE: BayAssetLicense = {
  code: "OCEANLEO-FIRST-PARTY",
  name: "OceanLeo 官方成品",
  url: "",
  commercial_ok: true,
  modify_ok: true,
  attribution_required: false,
  attribution_text: "",
};

/**
 * Official cards stay on `workspaceTemplatePreviewHref`.
 * On a LeoDev portal host the same path 404s (portal /workspace is the desk),
 * so website / design / video rows use that site's slot origin from
 * `NEXT_PUBLIC_FAMILY_EMBED_ORIGIN`. Never fall back to the production
 * subsite from a LeoDev page.
 */
export function officialTemplatePreviewHref(
  appId: string,
  artifactId: string,
  siteKey = "",
  options?: { host?: string; embedOriginEnv?: string },
): string {
  const path = workspaceTemplatePreviewHref(appId, artifactId);
  const host =
    options?.host ??
    (typeof window !== "undefined" ? window.location.host : "");
  if (!isFamilyEmbedOverrideHost(host)) return path;
  const key = siteKey.trim();
  if (key !== "website" && key !== "design" && key !== "video") return path;
  const parsed = parseFamilyEmbedOriginEnv(
    options?.embedOriginEnv ?? process.env.NEXT_PUBLIC_FAMILY_EMBED_ORIGIN,
  );
  const origin = parsed.bySubsite[key] || parsed.single;
  if (!origin) return path;
  if (typeof window !== "undefined" && window.location.origin === origin) {
    return path;
  }
  return `${origin}${path}`;
}

export function templateMaterialToBayAsset(
  material: TemplateMaterialListing,
  bayType: BayAssetType,
): BayOfficialAsset {
  const preview = assetPreviewUrl(material.previewKey);
  const thumb = assetThumbUrl(material.previewKey) || preview;
  return withOfficialCatalog({
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
    openHref: officialTemplatePreviewHref(
      material.appId,
      material.artifactId,
      material.siteKey,
    ),
    shelfKind: "official",
    price_fen: 0,
    currency: "CNY",
  }, {
    source: "template-materials",
    catalogId: material.id,
    artifactId: material.artifactId,
    revisionId: null,
    artifactType: material.artifactType,
    siteKey: material.siteKey,
    appId: material.appId,
    context: null,
    entry: templateMaterialEntry(material),
  });
}
