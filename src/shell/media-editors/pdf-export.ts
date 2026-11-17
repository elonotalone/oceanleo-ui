import type { PdfViewerBridge } from "./pdf-viewer-bridge";

/**
 * 查看器导出的整份字节；有中日韩「加文字」时补上标准外观流（PDFium 自己生成的是空的，
 * 重开后文字会整个不见，`pdf-cjk-appearance.ts`）。没有就原样，不多走一遍 pdf-lib。
 */
export async function exportPdf(bridge: PdfViewerBridge): Promise<Uint8Array> {
  const bytes = await bridge.exportBytes();
  if (!bridge.hasWideFreeText()) return bytes;
  const { fixPdfCjkFreeTextAppearances } = await import("./pdf-cjk-appearance");
  return (await fixPdfCjkFreeTextAppearances(bytes)).bytes;
}
