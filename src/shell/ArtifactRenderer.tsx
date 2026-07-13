"use client";

// A generated artifact uses the exact same viewer contract as Materials/My
// Library. Keeping this adapter tiny prevents result and library viewers from
// drifting into separate PPT/Excel/Word/website implementations.

import type { ArtifactMeta } from "../lib/agent";
import { inferLibraryKind, type LibraryItem } from "./library-data";
import { LibraryItemViewer } from "./library-viewers";

export interface ArtifactRendererProps {
  artifact: ArtifactMeta;
  content: string;
  accent?: string;
}

export function artifactToLibraryItem(
  artifact: ArtifactMeta,
  content: string,
  key = "active-artifact",
): LibraryItem {
  const meta = artifact.meta ?? {};
  return {
    key,
    source: "artifact",
    id: key,
    title: artifact.title || "预览",
    kind: inferLibraryKind({
      meta,
      mediaType: artifact.media_type,
      kind: artifact.type || artifact.format,
      url: artifact.url,
      siteId: artifact.site_id,
    }),
    siteId: artifact.site_id || "",
    url: artifact.url,
    previewUrl:
      typeof meta.preview_url === "string" ? meta.preview_url : undefined,
    thumbUrl:
      typeof meta.thumb_url === "string" ? meta.thumb_url : undefined,
    content,
    favorite: false,
    meta,
  };
}

export function ArtifactRenderer({
  artifact,
  content,
  accent = "#4f46e5",
}: ArtifactRendererProps) {
  const item = artifactToLibraryItem(artifact, content);
  return <LibraryItemViewer item={item} accent={accent} />;
}
