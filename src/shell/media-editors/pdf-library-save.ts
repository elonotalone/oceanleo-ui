import type { LibraryItem } from "../library-data";
import { saveFileToLibrary } from "../doc-editors/doc-io";
import { pdfFileStem } from "./pdf-workbench-utils";

/**
 * The Library write for an edited PDF: bytes are the artifact source and are
 * themselves a displayable primary (matrix §3.2 row 8); the editor keeps no
 * project sidecar.
 */
export function savePdfBytesToLibrary({
  item,
  siteId,
  bytes,
  editedSuffix,
  savingRevision,
  pageCount,
  keySalt,
}: {
  item: LibraryItem;
  siteId: string;
  bytes: Uint8Array;
  /**
   * 旧版「另存一份」才加的标题后缀。现在保存是同一份 PDF 的新版本，标题不变；
   * 不传就沿用原标题。
   */
  editedSuffix?: string;
  savingRevision: number;
  pageCount: number;
  keySalt?: string;
}) {
  const title = editedSuffix
    ? `${pdfFileStem(item.title)}-${editedSuffix}`
    : pdfFileStem(item.title);
  const file = new File([Uint8Array.from(bytes)], `${title}.pdf`, {
    type: "application/pdf",
  });
  return saveFileToLibrary({
    item,
    siteId,
    fallbackSite: "oceanleo",
    file,
    sourceFormat: "pdf",
    sourceMediaType: "application/pdf",
    title,
    mediaType: "doc",
    kind: "pdf",
    idempotencyKey: `pdf:${item.id}:${savingRevision}${keySalt ? `:${keySalt}` : ""}`,
    meta: {
      editor: "pdf-native-v1",
      editor_capability: "pdf-editor",
      page_count: pageCount,
    },
    deliveryProjectSchema: "pdf-binary@1",
    artifactRevision: {
      artifactType: "pdf",
      editor: "pdf-native-v1",
      provenance: { editorRevision: savingRevision, pageCount },
    },
  });
}
