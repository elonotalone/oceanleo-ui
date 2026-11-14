import type { PdfPageOperation, PdfWorkingCopy } from "./pdf-recovery";

/** Preserve annotation coordinates in their native PDFium space; page edits replay after them. */
export function pdfPageWorkingCopy(
  doc: PdfWorkingCopy,
  operation: PdfPageOperation,
  pages: { size: { width: number; height: number } }[],
): PdfWorkingCopy {
  const count = pages.length;
  const at = (index: number) => Number.isInteger(index) && index >= 0 && index < count;
  if (operation.type === "move" ? !at(operation.fromIndex) || !at(operation.toIndex) : !at(operation.pageIndex)) throw new Error("PDF 页码超出范围");
  if (operation.type === "delete" && count <= 1) throw new Error("PDF 至少需要保留一页");
  return {
    ...doc,
    // Older documents captured annotations after every operation. Keep that interpretation.
    annotationOperationCount: doc.annotationOperationCount ?? doc.operations.length,
    operations: [...doc.operations, operation],
  };
}
