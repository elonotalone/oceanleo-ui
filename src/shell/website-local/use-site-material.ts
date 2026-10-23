"use client";

import { useMemo } from "react";
import { fetchMediaBlob } from "../../lib/media-proxy";
import type { LibraryItem } from "../library-data";
import { withEditorHistoryCommand } from "../workbench-material-command";
import { useWorkbenchMaterialAdapter, type WorkbenchMaterialAdapter } from "../workbench-material-provider";

/** Copy library image bytes into the site's private closure, not an expiring URL. */
export function useSiteMaterial({ item, selectedImage, insert }: {
  item: LibraryItem;
  selectedImage: string;
  insert: (file: File, replace: boolean) => void;
}) {
  const adapter = useMemo<WorkbenchMaterialAdapter>(() => withEditorHistoryCommand({
    id: "website-images",
    actions: selectedImage ? ["insert", "replace"] : ["insert"],
    materialTypes: ["image"],
    accepts: material => material.kind === "image" || String(material.meta.mime || "").startsWith("image/"),
    mutate: async (action, material) => {
      const url = material.url || material.previewUrl || material.thumbUrl;
      if (!url) throw new Error("这个图片素材没有可用地址。");
      const blob = await fetchMediaBlob(url, { maxBytes: 8 * 1024 * 1024 });
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
      insert(new File([blob], `${material.title || "image"}.${ext}`, { type: blob.type }), action === "replace");
    },
  }, {
    documentId: item.artifactId,
    targetRevisionId: item.revisionId,
    replaceTarget: () => selectedImage ? {
      targetId: selectedImage,
      slotId: "website-image",
      geometry: { x: 0, y: 0, width: 1, height: 1 },
    } : null,
  }), [item.artifactId, item.revisionId, selectedImage, insert]);
  useWorkbenchMaterialAdapter(adapter);
}
