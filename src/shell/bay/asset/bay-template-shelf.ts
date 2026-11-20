/** Catalog projections retain existing detail identity and purchase rights. */

import { assetPreviewUrl, assetThumbUrl } from "../../../lib/asset-thumb";
import {
  templateMaterialEntryId,
  templateMaterialEntry,
  type TemplateMaterialListing,
} from "../../material-library-template-source";
import { siteWorkspaceBase, siteWorkspaceKey } from "../../../lib/site-path";
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
 * Official cards open the library preview of their app on the main site:
 * `/workspace/<siteKey>/<appId>?tab=materials&item=…&mode=preview` (contract §2.5 — every site's workspace is
 * same-origin now, so the old LeoDev slot-origin swap for website / design / video is gone). Without a usable
 * site key the path falls back to the plain `/workspace/<appId>` shape callers had before.
 */
export function officialTemplatePreviewHref(
  appId: string,
  artifactId: string,
  siteKey = "",
): string {
  const key = siteWorkspaceKey(siteKey);
  return workspaceTemplatePreviewHref(
    appId,
    artifactId,
    key ? { canonicalBasePath: siteWorkspaceBase(key) } : undefined,
  );
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
