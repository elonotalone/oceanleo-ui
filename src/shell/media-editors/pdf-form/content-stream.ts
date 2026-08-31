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

function latin1(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}

/** Decoded latin1 text of every content stream on one page, in order. */
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
  return refs.map((ref) => ({
    ref: ref as PDFRef,
    text: latin1(streamBytes(context, ref as PDFRef)),
  }));
}

/** Merge every content stream of one page into a single operator string. */
export function mergePageContentOperators(
  document: PDFDocument,
  pageIndex: number,
): string {
  return readPageContentStreams(document, pageIndex)
    .map((entry) => entry.text)
    .join("\n");
}

/**
 * Write merged operators back to a page.
 *
 * The merged text goes to the first stream and every remaining stream of the
 * page is emptied. Assigning only the first stream would leave streams 1..n
 * untouched in the context, so `save()` would re-emit the unfiltered original
 * text — a redaction that looks applied but is not.
 */
export function assignPageContent(
  document: PDFDocument,
  pageIndex: number,
  operators: string,
): void {
  const streams = readPageContentStreams(document, pageIndex);
  if (!streams.length) {
    throw new Error("PDF 此页没有内容流");
  }
  const context = document.context;
  context.assign(streams[0].ref, context.flateStream(operators));
  for (let index = 1; index < streams.length; index += 1) {
    context.assign(streams[index].ref, context.flateStream(""));
  }
}

export type PdfContentStringKind = "literal" | "hex";

export interface PdfContentStringSpan {
  /** Index of the opening delimiter inside the content string. */
  start: number;
  /** Index just past the closing delimiter. */
  end: number;
  kind: PdfContentStringKind;
  /** Plausible decodings of the bytes; PDF text encoding is font-dependent. */
  candidates: string[];
}

function utf16beCandidate(raw: string): string | null {
  if (raw.length < 2 || raw.length % 2 !== 0) return null;
  let text = "";
  for (let index = 0; index < raw.length; index += 2) {
    text += String.fromCharCode(
      (raw.charCodeAt(index) << 8) | raw.charCodeAt(index + 1),
    );
  }
  return text;
}

function textCandidates(raw: string): string[] {
  const candidates = [raw];
  const wide = utf16beCandidate(raw);
  if (wide && wide !== raw) candidates.push(wide);
  return candidates.filter((candidate) => candidate.length > 0);
}

function decodeHexBody(body: string): string {
  const digits = body.replace(/[^0-9a-fA-F]/g, "");
  const padded = digits.length % 2 === 0 ? digits : `${digits}0`;
  let raw = "";
  for (let index = 0; index < padded.length; index += 2) {
    raw += String.fromCharCode(Number.parseInt(padded.slice(index, index + 2), 16));
  }
  return raw;
}

const LITERAL_ESCAPES: Readonly<Record<string, string>> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  "(": "(",
  ")": ")",
  "\\": "\\",
};

function readLiteralString(
  content: string,
  openIndex: number,
): { end: number; raw: string } {
  let depth = 1;
  let index = openIndex + 1;
  let raw = "";
  while (index < content.length && depth > 0) {
    const char = content[index];
    if (char === "\\") {
      const next = content[index + 1];
      if (next === undefined) {
        index += 1;
        continue;
      }
      if (next === "\n") {
        index += 2;
        continue;
      }
      if (next === "\r") {
        index += content[index + 2] === "\n" ? 3 : 2;
        continue;
      }
      if (next >= "0" && next <= "7") {
        let octal = "";
        let cursor = index + 1;
        while (
          cursor < content.length &&
          octal.length < 3 &&
          content[cursor] >= "0" &&
          content[cursor] <= "7"
        ) {
          octal += content[cursor];
          cursor += 1;
        }
        raw += String.fromCharCode(Number.parseInt(octal, 8) & 0xff);
        index = cursor;
        continue;
      }
      raw += LITERAL_ESCAPES[next] ?? next;
      index += 2;
      continue;
    }
    if (char === "(") {
      depth += 1;
      raw += char;
      index += 1;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      index += 1;
      if (depth === 0) break;
      raw += char;
      continue;
    }
    raw += char;
    index += 1;
  }
  return { end: index, raw };
}

/**
 * Every PDF string in a content stream, in stream order.
 *
 * Comments and `<<` dictionary openers are skipped so they cannot be mistaken
 * for hex strings.
 */
export function scanContentStrings(content: string): PdfContentStringSpan[] {
  const spans: PdfContentStringSpan[] = [];
  let index = 0;
  while (index < content.length) {
    const char = content[index];
    if (char === "%") {
      while (index < content.length && content[index] !== "\n" && content[index] !== "\r") {
        index += 1;
      }
      continue;
    }
    if (char === "<") {
      if (content[index + 1] === "<") {
        index += 2;
        continue;
      }
      const close = content.indexOf(">", index + 1);
      if (close < 0) break;
      spans.push({
        start: index,
        end: close + 1,
        kind: "hex",
        candidates: textCandidates(decodeHexBody(content.slice(index + 1, close))),
      });
      index = close + 1;
      continue;
    }
    if (char === "(") {
      const { end, raw } = readLiteralString(content, index);
      spans.push({
        start: index,
        end,
        kind: "literal",
        candidates: textCandidates(raw),
      });
      index = end;
      continue;
    }
    index += 1;
  }
  return spans;
}

/**
 * Replace the given string spans with empty strings.
 *
 * The operator itself survives so text positioning stays valid; only the
 * glyphs disappear.
 */
export function blankContentStrings(
  content: string,
  spans: readonly PdfContentStringSpan[],
): string {
  const ordered = [...spans].sort((a, b) => b.start - a.start);
  let next = content;
  for (const span of ordered) {
    const empty = span.kind === "hex" ? "<>" : "()";
    next = next.slice(0, span.start) + empty + next.slice(span.end);
  }
  return next;
}

export interface PdfContentRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rectsOverlap(a: PdfContentRegion, b: PdfContentRegion): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** PDF row-vector composition: `cm` premultiplies the current matrix. */
function concatMatrix(applied: Matrix, current: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = applied;
  const [a2, b2, c2, d2, e2, f2] = current;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

function unitSquareBounds(matrix: Matrix): PdfContentRegion {
  const [a, b, c, d, e, f] = matrix;
  const points = [
    [e, f],
    [a + e, b + f],
    [c + e, d + f],
    [a + c + e, b + d + f],
  ];
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

interface ContentToken {
  text: string;
  start: number;
  end: number;
}

/** Whitespace-delimited tokens, with PDF strings kept whole. */
function tokenizeContent(content: string): ContentToken[] {
  const tokens: ContentToken[] = [];
  const spans = scanContentStrings(content);
  const stringStarts = new Map(spans.map((span) => [span.start, span]));
  let index = 0;
  while (index < content.length) {
    const char = content[index];
    if (char === "%") {
      while (index < content.length && content[index] !== "\n" && content[index] !== "\r") {
        index += 1;
      }
      continue;
    }
    const span = stringStarts.get(index);
    if (span) {
      tokens.push({
        text: content.slice(span.start, span.end),
        start: span.start,
        end: span.end,
      });
      index = span.end;
      continue;
    }
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    let cursor = index;
    while (
      cursor < content.length &&
      !/\s/.test(content[cursor]) &&
      content[cursor] !== "(" &&
      content[cursor] !== "<"
    ) {
      cursor += 1;
    }
    if (cursor === index) cursor += 1;
    tokens.push({ text: content.slice(index, cursor), start: index, end: cursor });
    index = cursor;
  }
  return tokens;
}

/**
 * Drop `Do` XObject invocations whose placement overlaps a region.
 *
 * The surrounding `q`/`cm`/`Q` operators are left alone: without the `Do` they
 * paint nothing, and keeping them means the graphics state stack stays
 * balanced.
 */
export function removeImageDrawsInRegion(
  content: string,
  region: PdfContentRegion,
): { content: string; removed: number } {
  const tokens = tokenizeContent(content);
  let matrix: Matrix = IDENTITY;
  const stack: Matrix[] = [];
  const cuts: { start: number; end: number }[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index].text;
    if (token === "q") {
      stack.push(matrix);
      continue;
    }
    if (token === "Q") {
      matrix = stack.pop() ?? IDENTITY;
      continue;
    }
    if (token === "cm" && index >= 6) {
      const numbers = tokens
        .slice(index - 6, index)
        .map((entry) => Number(entry.text));
      if (numbers.every((value) => Number.isFinite(value))) {
        matrix = concatMatrix(numbers as Matrix, matrix);
      }
      continue;
    }
    if (token === "Do" && index >= 1 && tokens[index - 1].text.startsWith("/")) {
      if (rectsOverlap(unitSquareBounds(matrix), region)) {
        cuts.push({ start: tokens[index - 1].start, end: tokens[index].end });
      }
    }
  }
  if (!cuts.length) return { content, removed: 0 };
  let next = content;
  for (const cut of [...cuts].sort((a, b) => b.start - a.start)) {
    next = next.slice(0, cut.start) + next.slice(cut.end);
  }
  return { content: next, removed: cuts.length };
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
