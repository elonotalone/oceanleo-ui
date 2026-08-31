import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  pdfPageGeometry,
  visualRectToPdf,
  type PdfVisualRect,
} from "../pdf-annotation-operations";
import {
  appendBlackRectOperator,
  assignPageContentStream,
  filterContentLines,
  mergePageContentOperators,
} from "./content-stream";
import { loadPdfDocument, savePdfDocument } from "./pdf-document-io";
import type { PdfRedactionMark } from "./types";

const PDFJS_FONT_URL =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/";

interface PdfJsTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

async function textLiteralsInRegion(
  bytes: Uint8Array,
  pageIndex: number,
  region: { x: number; y: number; width: number; height: number },
): Promise<string[]> {
  const loading = await getDocument({
    data: Uint8Array.from(bytes),
    useSystemFonts: true,
    standardFontDataUrl: PDFJS_FONT_URL,
  }).promise;
  const page = await loading.getPage(pageIndex + 1);
  const content = await page.getTextContent();
  const literals = new Set<string>();
  for (const item of content.items as PdfJsTextItem[]) {
    const text = String(item.str || "").trim();
    if (!text) continue;
    const [a, b, c, d, e, f] = item.transform;
    const width = item.width || Math.hypot(a, b);
    const height = item.height || Math.abs(d) || Math.abs(b) || 12;
    const box = { x: e, y: f, width, height };
    if (rectsOverlap(box, region)) {
      literals.add(text);
    }
  }
  return [...literals];
}

export async function extractPageTextWithPdfJs(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<string> {
  const loading = await getDocument({
    data: Uint8Array.from(bytes),
    useSystemFonts: true,
    standardFontDataUrl: PDFJS_FONT_URL,
  }).promise;
  const page = await loading.getPage(pageIndex + 1);
  const content = await page.getTextContent();
  return (content.items as PdfJsTextItem[])
    .map((item) => String(item.str || ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True redaction: remove matching text operators from the content stream, then
 * paint an opaque black rectangle. Does not merely cover with an annotation.
 */
export async function applyPdfRedactions(
  bytes: Uint8Array,
  marks: readonly PdfRedactionMark[],
): Promise<Uint8Array> {
  if (!marks.length) {
    throw new Error("请先标记要涂黑的区域");
  }
  const document = await loadPdfDocument(bytes);
  const byPage = new Map<number, PdfRedactionMark[]>();
  for (const mark of marks) {
    const list = byPage.get(mark.pageIndex) || [];
    list.push(mark);
    byPage.set(mark.pageIndex, list);
  }
  for (const [pageIndex, pageMarks] of byPage) {
    const geometry = pdfPageGeometry(document, pageIndex);
    let operators = mergePageContentOperators(document, pageIndex);
    const literals: string[] = [];
    for (const mark of pageMarks) {
      const pdfRect = visualRectToPdf(mark.rect, geometry);
      const found = await textLiteralsInRegion(
        await savePdfDocument(document),
        pageIndex,
        pdfRect,
      );
      literals.push(...found);
      operators = appendBlackRectOperator(
        operators,
        pdfRect.x,
        pdfRect.y,
        pdfRect.width,
        pdfRect.height,
      );
    }
    operators = filterContentLines(operators, [...new Set(literals)]);
    assignPageContentStream(document, pageIndex, 0, operators);
  }
  return savePdfDocument(document);
}

export const REDACTION_IRREVERSIBLE =
  "涂黑会永久删除底层文字，无法撤销。确定继续吗？";

export const REDACTION_IMAGE_ONLY =
  "此页没有可删除的文字对象；已涂黑区域仍会从内容流中移除可见文字。";
