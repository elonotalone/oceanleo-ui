import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from "pdf-lib";

function streamBytes(
  context: PDFDocument["context"],
  value: PDFRef | PDFStream | PDFRawStream,
): Uint8Array {
  const resolved = value instanceof PDFRef ? context.lookup(value) : value;
  if (resolved instanceof PDFRawStream) {
    return decodePDFRawStream(resolved).decode();
  }
  if (resolved instanceof PDFStream) {
    return resolved.getContents();
  }
  return new Uint8Array();
}

/** Decoded latin1 text of every content stream on one page, concatenated. */
export function readPageContentStreams(
  document: PDFDocument,
  pageIndex: number,
): { ref: PDFRef; text: string }[] {
  const page = document.getPage(pageIndex);
  const contents = page.node.Contents();
  if (!contents) return [];
  const context = document.context;
  const refs =
    contents instanceof PDFArray
      ? Array.from({ length: contents.size() }, (_, index) =>
          contents.get(index),
        )
      : [contents];
  return refs.map((ref) => {
    const bytes = streamBytes(context, ref as PDFRef);
    let text = "";
    for (const byte of bytes) text += String.fromCharCode(byte);
    return { ref: ref as PDFRef, text };
  });
}

/** In-place overwrite of one page content stream (PDFContext.assign). */
export function assignPageContentStream(
  document: PDFDocument,
  pageIndex: number,
  streamIndex: number,
  operators: string,
): void {
  const streams = readPageContentStreams(document, pageIndex);
  if (streamIndex < 0 || streamIndex >= streams.length) {
    throw new Error("PDF 内容流索引无效");
  }
  document.context.assign(
    streams[streamIndex].ref,
    document.context.flateStream(operators),
  );
}

/** Merge multiple content streams into one operator string. */
export function mergePageContentOperators(
  document: PDFDocument,
  pageIndex: number,
): string {
  return readPageContentStreams(document, pageIndex)
    .map((entry) => entry.text)
    .join("\n");
}

/**
 * Drop content-stream lines that expose the given literal strings (as PDF hex
 * or plain text). Used after pdfjs identifies text that must not survive.
 */
export function filterContentLines(
  content: string,
  literals: readonly string[],
): string {
  if (!literals.length) return content;
  const needles = literals.flatMap((literal) => {
    let hex = "";
    for (let index = 0; index < literal.length; index += 1) {
      hex += literal.charCodeAt(index).toString(16).padStart(4, "0").toUpperCase();
    }
    return [literal, `<${hex}>`, `<${hex.slice(0, 8)}`];
  });
  return content
    .split(/\r?\n/)
    .filter((line) => !needles.some((needle) => line.includes(needle)))
    .join("\n");
}

export function appendBlackRectOperator(
  content: string,
  x: number,
  y: number,
  width: number,
  height: number,
): string {
  const n = (value: number) =>
    Number.isFinite(value) ? String(Number(value.toFixed(4))) : "0";
  const paint = [
    "q",
    "0 0 0 rg",
    "0 0 0 RG",
    `${n(x)} ${n(y)} ${n(width)} ${n(height)} re f`,
    "Q",
  ].join("\n");
  return content ? `${content}\n${paint}` : paint;
}
