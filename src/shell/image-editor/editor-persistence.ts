"use client";

import { saveWorks, uploadFile } from "../../lib/database";
import type { LibraryItem } from "../library-data";
import type { ExportFormat } from "./types";

export function mimeFor(format: ExportFormat): string {
  return format === "jpeg" ? "image/jpeg" : `image/${format}`;
}

export function extensionFor(format: ExportFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

export function downloadImageBlob(
  blob: Blob,
  title: string,
  format: ExportFormat,
): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = `${title || "oceanleo-image"}.${extensionFor(format)}`;
  anchor.href = url;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function persistImageBlob(
  blob: Blob,
  item: LibraryItem,
  siteId: string,
  format: ExportFormat,
  messages: { uploadFailed: string; registerFailed: string },
): Promise<string> {
  const targetSite = siteId || "design";
  const title = `${item.title || "图片"}-编辑版`;
  const uploaded = await uploadFile(
    new File([blob], `${title}.${extensionFor(format)}`, {
      type: mimeFor(format),
    }),
    { siteId: targetSite, title },
  );
  const url = uploaded.data?.file?.url || "";
  if (!uploaded.ok || !url) {
    throw new Error(uploaded.error || messages.uploadFailed);
  }
  const saved = await saveWorks(targetSite, [
    {
      url,
      thumb_url: url,
      media_type: "image",
      title,
      kind: "image",
      meta: {
        parent_asset_id: item.id,
        editor: "fabric-v2",
      },
    },
  ]);
  if (!saved.ok || Number(saved.data?.saved || 0) !== 1) {
    throw new Error(saved.error || messages.registerFailed);
  }
  return url;
}
