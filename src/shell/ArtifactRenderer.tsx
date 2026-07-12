"use client";

// A single artifact uses the exact same viewer contract as a cross-site library
// item. Keeping this adapter tiny prevents the agent result pane and the "+"
// libraries from drifting into two different PPT/Excel/Word implementations.

import type { ArtifactMeta } from "../lib/agent";
import { inferLibraryKind, type LibraryItem } from "./library-data";
import { LibraryItemViewer } from "./library-viewers";

export interface ArtifactRendererProps {
  artifact: ArtifactMeta;
  content: string;
  accent?: string;
}

export function ArtifactRenderer({
  artifact,
  content,
  accent = "#4f46e5",
}: ArtifactRendererProps) {
  const meta = artifact.meta ?? {};
  const item: LibraryItem = {
    key: "active-artifact",
    source: "artifact",
    id: "active-artifact",
    title: artifact.title || "生成结果",
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
  return <LibraryItemViewer item={item} accent={accent} />;
}
