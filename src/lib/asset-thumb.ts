import type { DomainFamily } from "../contracts/domain-family";
import { resolvePublicAssetMedia } from "./asset-delivery";

/** Catalog keys select thumbnails; complete paths retain their stored variant. */
export function assetThumbUrl(key: string, family?: DomainFamily): string {
  return resolvePublicAssetMedia(key, { purpose: "thumb", family });
}

/** Catalog previews are <key>.webp (there is no implicit .preview.webp object). */
export function assetPreviewUrl(key: string, family?: DomainFamily): string {
  return resolvePublicAssetMedia(key, { purpose: "preview", family });
}
