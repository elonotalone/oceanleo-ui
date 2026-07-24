import {
  fetchMediaBlob,
  importMediaUrl,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import { createBlankPdf, inspectPdf } from "./pdf-operations";
import { assertBlobSource } from "./source-integrity.mjs";

const MAX_PDF_BYTES = 256 * 1024 * 1024;

export interface LoadedPdfSource {
  bytes: Uint8Array;
  durableUrl: string;
  pageCount: number;
  blank: boolean;
}

export async function loadInitialPdfSource(input: {
  source: string;
  siteId: string;
  title: string;
  signal: AbortSignal;
  allowBlank: boolean;
}): Promise<LoadedPdfSource> {
  if (!input.source) {
    if (!input.allowBlank) {
      throw new Error(
        "当前 PDF revision 缺少可验证的源文件；已阻止用空白页替代。",
      );
    }
    const bytes = await createBlankPdf();
    return { bytes, durableUrl: "", pageCount: 1, blank: true };
  }
  const durableUrl = isFirstPartyMediaUrl(input.source)
    ? input.source
    : await importMediaUrl(input.source, {
        kind: "file",
        siteId: input.siteId || "oceanleo",
        title: input.title,
        registerAsset: true,
      });
  const blob = await fetchMediaBlob(durableUrl, {
    maxBytes: MAX_PDF_BYTES,
    signal: input.signal,
  });
  await assertBlobSource(blob, "pdf");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    bytes,
    durableUrl,
    pageCount: await inspectPdf(bytes),
    blank: false,
  };
}
