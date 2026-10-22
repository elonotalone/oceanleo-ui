import {
  pdfPageGeometry,
  visualRectToPdf,
  type PdfVisualRect,
} from "../pdf-annotation-operations";
import {
  appendBlackRectOperator,
  assignPageContent,
  blankContentStrings,
  mergePageContentOperators,
  removeImageDrawsInRegion,
  scanContentStrings,
  type PdfContentRegion,
  type PdfContentStringSpan,
} from "./content-stream";
import { openPdfEngineDocument, readPdfPageText } from "../pdf-engine-host";
import { loadPdfDocument, savePdfDocument } from "./pdf-document-io";
import type { PdfRedactionMark } from "./types";

interface PdfTextItem {
  str: string;
  /** Bounds in PDF user space (origin bottom-left), i.e. what the content stream uses. */
  bounds: PdfContentRegion;
}

/**
 * Text runs of one page as an independent reader (PDFium, the EmbedPDF engine)
 * sees them. Runs are consecutive characters of one text object, which lines
 * up with one text-showing operator in the content stream. Rotation is
 * normalised so rects are in 0-degree space; the CropBox origin is added back
 * to land in user space.
 */
async function pdfTextItems(
  bytes: Uint8Array,
  pageIndex: number,
  crop: { x: number; y: number; height: number },
): Promise<PdfTextItem[]> {
  const opened = await openPdfEngineDocument(bytes, {
    mode: "direct",
    normalizeRotation: true,
  });
  try {
    const page = opened.doc.pages[pageIndex];
    if (!page) return [];
    const { runs } = await opened.engine
      .getPageTextRuns(opened.doc, page)
      .toPromise();
    return runs.map((run) => ({
      str: run.text.replace(/[\r\n]+$/, ""),
      bounds: {
        x: crop.x + run.rect.origin.x,
        y: crop.y + crop.height - (run.rect.origin.y + run.rect.size.height),
        width: run.rect.size.width,
        height: run.rect.size.height,
      },
    }));
  } finally {
    await opened.close();
  }
}

/** Text of one page as an independent reader sees it. */
export async function extractPageTextWithPdfium(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<string> {
  const opened = await openPdfEngineDocument(bytes, { mode: "direct" });
  try {
    const text = await readPdfPageText(opened, pageIndex);
    return text.replace(/\s+/g, " ").trim();
  } finally {
    await opened.close();
  }
}

function rectsOverlap(a: PdfContentRegion, b: PdfContentRegion): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

/**
 * Pair content-stream strings with the text PDFium reports, in stream order.
 *
 * Both sequences come from the same text-showing operators, so a greedy walk
 * lines them up. Pairing by position (not by text content) is what keeps a
 * redaction from also deleting the same word elsewhere on the page.
 */
function pairSpansWithItems(
  spans: readonly PdfContentStringSpan[],
  items: readonly PdfTextItem[],
): Map<number, PdfContentStringSpan> {
  const paired = new Map<number, PdfContentStringSpan>();
  let spanIndex = 0;
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const text = items[itemIndex].str;
    if (!text.trim()) continue;
    while (spanIndex < spans.length) {
      const span = spans[spanIndex];
      spanIndex += 1;
      if (span.candidates.some((candidate) => candidate === text)) {
        paired.set(itemIndex, span);
        break;
      }
    }
  }
  return paired;
}

export interface PdfRedactionOutcome {
  bytes: Uint8Array;
  /** Strings whose glyphs were removed from the content stream. */
  removedTextCount: number;
  removedImageCount: number;
  /**
   * Pages where per-position pairing did not hold and every string matching
   * the targeted text had to be blanked. Content outside the marked region may
   * have been removed too, so the UI must say so.
   */
  broadenedPages: number[];
}

export const REDACTION_IRREVERSIBLE =
  "涂黑会永久删除底层文字与图像，无法撤销。确定继续吗？";

export const REDACTION_VERIFICATION_FAILED =
  "无法证明涂黑已生效：此 PDF 的文字编码无法安全移除，已放弃修改（不会给你一个假涂黑）。";

export const REDACTION_BROADENED =
  "此页文字无法逐处定位，已删除页面上所有相同文字；请检查结果。";

export const REDACTION_NO_MARKS = "请先标记要涂黑的区域";

/**
 * True redaction: delete the text and images under the marks, then paint an
 * opaque black rectangle.
 *
 * The result is verified with an independent reader (PDFium) before it is
 * returned. If the targeted text is still extractable the call throws rather
 * than hand back a file that only looks redacted.
 */
export async function applyPdfRedactions(
  bytes: Uint8Array,
  marks: readonly PdfRedactionMark[],
): Promise<PdfRedactionOutcome> {
  if (!marks.length) {
    throw new Error(REDACTION_NO_MARKS);
  }
  const document = await loadPdfDocument(bytes);
  const byPage = new Map<number, PdfRedactionMark[]>();
  for (const mark of marks) {
    const list = byPage.get(mark.pageIndex) ?? [];
    list.push(mark);
    byPage.set(mark.pageIndex, list);
  }

  let removedTextCount = 0;
  let removedImageCount = 0;
  const targetsByPage = new Map<number, string[]>();

  for (const [pageIndex, pageMarks] of byPage) {
    const geometry = pdfPageGeometry(document, pageIndex);
    const regions = pageMarks.map((mark) => visualRectToPdf(mark.rect, geometry));
    const items = await pdfTextItems(bytes, pageIndex, geometry);
    const targetIndexes = new Set<number>();
    for (let index = 0; index < items.length; index += 1) {
      if (!items[index].str.trim()) continue;
      const bounds = items[index].bounds;
      if (regions.some((region) => rectsOverlap(bounds, region))) {
        targetIndexes.add(index);
      }
    }
    targetsByPage.set(
      pageIndex,
      [...targetIndexes].map((index) => items[index].str),
    );

    let operators = mergePageContentOperators(document, pageIndex);
    const paired = pairSpansWithItems(scanContentStrings(operators), items);
    const doomed: PdfContentStringSpan[] = [];
    for (const index of targetIndexes) {
      const span = paired.get(index);
      if (span) doomed.push(span);
    }
    operators = blankContentStrings(operators, doomed);
    removedTextCount += doomed.length;

    for (const region of regions) {
      const stripped = removeImageDrawsInRegion(operators, region);
      operators = stripped.content;
      removedImageCount += stripped.removed;
    }
    for (const region of regions) {
      operators = appendBlackRectOperator(
        operators,
        region.x,
        region.y,
        region.width,
        region.height,
      );
    }
    assignPageContent(document, pageIndex, operators);
  }

  let saved = await savePdfDocument(document);
  const broadenedPages: number[] = [];

  for (const [pageIndex, targets] of targetsByPage) {
    if (!targets.length) continue;
    const survivors = await survivingTargets(saved, pageIndex, targets);
    if (!survivors.length) continue;
    // Position pairing did not hold on this page. Fall back to blanking every
    // string that carries the targeted text.
    let operators = mergePageContentOperators(document, pageIndex);
    const spans = scanContentStrings(operators).filter((span) =>
      span.candidates.some((candidate) =>
        survivors.some(
          (target) => candidate.includes(target) || target.includes(candidate),
        ),
      ),
    );
    if (!spans.length) {
      throw new Error(REDACTION_VERIFICATION_FAILED);
    }
    operators = blankContentStrings(operators, spans);
    removedTextCount += spans.length;
    assignPageContent(document, pageIndex, operators);
    broadenedPages.push(pageIndex);
    saved = await savePdfDocument(document);
    const stillThere = await survivingTargets(saved, pageIndex, targets);
    if (stillThere.length) {
      throw new Error(REDACTION_VERIFICATION_FAILED);
    }
  }

  return { bytes: saved, removedTextCount, removedImageCount, broadenedPages };
}

async function survivingTargets(
  bytes: Uint8Array,
  pageIndex: number,
  targets: readonly string[],
): Promise<string[]> {
  const text = await extractPageTextWithPdfium(bytes, pageIndex);
  const collapsed = text.replace(/\s+/g, "");
  return targets.filter((target) => {
    const needle = target.replace(/\s+/g, "");
    return needle.length > 0 && collapsed.includes(needle);
  });
}
