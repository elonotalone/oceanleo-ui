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
  type SiteDoc,
  type SiteEnvelope,
} from "./website-site-doc";
import { renderSiteCoverPng } from "./website-site-cover";
import { siteManifestWith, type StagedSiteFile } from "./website-site-files";

export { siteImagePathFor, siteManifestWith, validateSiteImage, type StagedSiteFile } from "./website-site-files";


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
