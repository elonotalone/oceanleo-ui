/**
 * Save a site document as a new website revision (W14, D11).
 *
 * - Bundle site: the entry stays the same file manifest; only its `site.json`
 *   row changes (new sha256/byteSize). The new `site.json` bytes and any newly
 *   chosen images travel as privately staged `sourceDependencies`; everything
 *   else (index.html, app.js, styles, old images, English copy) is inherited
 *   from the parent closure by the gateway (W04).
 * - Structured site: the entry JSON is the site document itself.
 *
 * No step reports success before the gateway answered with a revision.
 */
import { stageArtifactBlob } from "../artifact-client";
import { saveFileToLibrary, type SaveToLibraryResult } from "../doc-editors/doc-io";
import type { LibraryItem } from "../library-data";
import { WEBSITE_SOURCE_FORMAT } from "../website-source-carrier/website-source-schema";
import {
  SITE_DOC_PATH,
  siteDocTitle,
  type SiteBundleFile,
  type SiteDoc,
  type SiteEnvelope,
} from "./website-site-doc";
import { renderSiteCoverPng } from "./website-site-cover";

export interface StagedSiteFile {
  path: string;
  blobId: string;
  digest: string;
  mediaType: string;
  byteSize: number;
}

export interface SiteSaveInput {
  item: LibraryItem;
  siteId: string;
  envelope: SiteEnvelope;
  doc: SiteDoc;
  /** Images chosen in this session that the saved document names. */
  images: ReadonlyMap<string, File>;
  /** Staging receipts reused across retries (keyed by path + file identity). */
  staged: Map<string, StagedSiteFile>;
  editRevision: number;
  imageUrl: (path: string) => string;
}

const SITE_IMAGE_MEDIA = new Set(["image/png", "image/jpeg", "image/webp"]);
export const SITE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

function fileKey(path: string, file: File): string {
  return `${path}\u0000${file.size}\u0000${file.lastModified}\u0000${file.name}`;
}

async function stageOnce(
  artifactId: string,
  path: string,
  file: File,
  staged: Map<string, StagedSiteFile>,
): Promise<StagedSiteFile> {
  const key = fileKey(path, file);
  const known = staged.get(key);
  if (known) return known;
  const result = await stageArtifactBlob(artifactId, file);
  if (!result.ok || !result.data) {
    throw new Error(result.error || `${path} 没能放进保存暂存区。`);
  }
  const receipt: StagedSiteFile = {
    path,
    blobId: result.data.blobId,
    digest: result.data.digest,
    mediaType: result.data.mediaType || file.type,
    byteSize: result.data.byteSize || file.size,
  };
  staged.set(key, receipt);
  return receipt;
}

/** Only images the document still names travel; others were replaced again or removed. */
function namedImages(doc: SiteDoc, images: ReadonlyMap<string, File>): Array<[string, File]> {
  const text = JSON.stringify(doc.pages);
  return [...images].filter(([path]) => text.includes(JSON.stringify(path)));
}

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

export async function saveSiteDocRevision(input: SiteSaveInput): Promise<SaveToLibraryResult> {
  const artifactId = String(input.item.artifactId || "");
  if (!artifactId) throw new Error("这份网站还没有在库里，不能保存成新版本。");
  const sourceDependencies: StagedSiteFile[] = [];
  for (const [path, file] of namedImages(input.doc, input.images)) {
    sourceDependencies.push(await stageOnce(artifactId, path, file, input.staged));
  }
  const siteText = JSON.stringify(input.doc, null, 2);
  let entryText: string;
  if (input.envelope.kind === "bundle") {
    const siteFile = new File([siteText], SITE_DOC_PATH, { type: "application/json" });
    const site = await stageOnce(artifactId, SITE_DOC_PATH, siteFile, input.staged);
    sourceDependencies.unshift({ ...site, mediaType: "application/json" });
    entryText = siteManifestWith(input.envelope, sourceDependencies);
  } else {
    entryText = siteText;
  }
  const title = siteDocTitle(input.doc, input.item.title || "网站");
  const entry = new File([entryText], "oceanleo.website-source.json", { type: "application/json" });
  return saveFileToLibrary({
    item: input.item,
    siteId: input.siteId,
    fallbackSite: "oceanleo",
    file: entry,
    createPreview: () => renderSiteCoverPng(input.doc, input.imageUrl),
    sourceFormat: WEBSITE_SOURCE_FORMAT,
    sourceMediaType: "application/json",
    title,
    mediaType: "website",
    kind: "website",
    idempotencyKey: `website:${artifactId}:${String(input.item.revisionId || "").slice(-40)}:${input.editRevision}`,
    meta: {
      editor: "website",
      editor_capability: "website-editor",
      editor_project_schema: WEBSITE_SOURCE_FORMAT,
      website_source_shape: input.envelope.kind,
    },
    artifactRevision: {
      artifactType: "website",
      editor: "website",
      provenance: {
        editorRevision: input.editRevision,
        siteShape: input.envelope.kind,
        changedFiles: sourceDependencies.map((file) => file.path),
      },
      ...(sourceDependencies.length
        ? {
            sourceDependencies: sourceDependencies.map((file) => ({
              path: file.path,
              blobId: file.blobId,
              digest: file.digest,
              mediaType: file.mediaType,
            })),
          }
        : {}),
    },
  });
}
