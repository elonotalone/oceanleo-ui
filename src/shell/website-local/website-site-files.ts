/**
 * Pure helpers for website revision files (W14): the updated bundle manifest,
 * new image paths and the image admission rule. No network, no React.
 */
import type { SiteBundleFile, SiteEnvelope } from "./website-site-doc";

export interface StagedSiteFile {
  path: string;
  blobId: string;
  digest: string;
  mediaType: string;
  byteSize: number;
}

const SITE_IMAGE_MEDIA = new Set(["image/png", "image/jpeg", "image/webp"]);
export const SITE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

export function siteManifestWith(
  envelope: Extract<SiteEnvelope, { kind: "bundle" }>,
  changed: readonly StagedSiteFile[],
): string {
  const byPath = new Map(changed.map((file) => [file.path, file]));
  const files: SiteBundleFile[] = envelope.manifest.files.map((file) => {
    const next = byPath.get(file.path);
    if (!next) return file;
    byPath.delete(file.path);
    return { ...file, sha256: next.digest, byteSize: next.byteSize, mediaType: next.mediaType };
  });
  for (const file of byPath.values()) {
    files.push({
      path: file.path,
      dependencyPath: file.path,
      sha256: file.digest,
      byteSize: file.byteSize,
      mediaType: file.mediaType,
    });
  }
  return JSON.stringify({ ...envelope.manifest, files }, null, 2);
}

export function validateSiteImage(file: File): string {
  if (!SITE_IMAGE_MEDIA.has(file.type)) return "网站图片只支持 PNG、JPEG、WebP。";
  if (file.size > SITE_IMAGE_MAX_BYTES) return "这张图片超过 8 MB，网站里放不下。";
  if (file.size < 512) return "这张图片太小，像是坏文件。";
  return "";
}

export function siteImagePathFor(file: File, taken: (path: string) => boolean): string {
  const ext = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp";
  const stem =
    file.name
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image";
  for (let n = 0; n < 1000; n += 1) {
    const path = `images/${stem}${n ? `-${n}` : ""}.${ext}`;
    if (!taken(path)) return path;
  }
  return `images/${stem}-${Date.now().toString(36)}.${ext}`;
}
