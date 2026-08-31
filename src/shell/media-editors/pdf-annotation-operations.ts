"use client";

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFRef,
  PDFString,
} from "pdf-lib";
import { PDF_READER_PALETTE } from "./pdf-workbench-utils";

/**
 * What `PDFContext.obj()` accepts. pdf-lib declares the equivalent `Literal`
 * union internally but does not export it, and `unknown` will not do: nested
 * dictionaries are the whole point of an annotation entry map.
 */
type PdfLiteral =
  | PDFObject
  | PdfLiteralObject
  | PdfLiteral[]
  | string
  | number
  | boolean
  | null
  | undefined;

interface PdfLiteralObject {
  [key: string]: PdfLiteral;
}

/**
 * Every kind below is written as a standard PDF annotation dictionary (PDF
 * 32000-1 §12.5.6), never painted into the page content stream. Content-stream
 * ink is permanent: another reader cannot select it, recolour it or delete it,
 * and the author cannot take it back. Office review depends on the round trip,
 * so the annotation dictionary is the contract.
 */
export type PdfAnnotationKind =
  | "text"
  | "highlight"
  | "underline"
  | "strikeout"
  | "squiggly"
  | "freehand"
  | "square"
  | "circle"
  | "line"
  | "arrow"
  | "stamp";

/** `arrow` is a `Line` carrying an arrow line-ending, so the map is not 1:1. */
export const PDF_ANNOTATION_SUBTYPES: Readonly<
  Record<PdfAnnotationKind, string>
> = {
  text: "Text",
  highlight: "Highlight",
  underline: "Underline",
  strikeout: "StrikeOut",
  squiggly: "Squiggly",
  freehand: "Ink",
  square: "Square",
  circle: "Circle",
  line: "Line",
  arrow: "Line",
  stamp: "Stamp",
};

export const PDF_ANNOTATION_KINDS = Object.keys(
  PDF_ANNOTATION_SUBTYPES,
) as readonly PdfAnnotationKind[];

/** The four kinds whose geometry is a list of quadrilaterals over glyph runs. */
const QUAD_KINDS: readonly PdfAnnotationKind[] = [
  "highlight",
  "underline",
  "strikeout",
  "squiggly",
];

/** PDF 32000-1 §12.5.6.20 — the closed set of built-in stamp names. */
export const PDF_STAMP_NAMES = [
  "Approved",
  "AsIs",
  "Confidential",
  "Departmental",
  "Draft",
  "Experimental",
  "Expired",
  "Final",
  "ForComment",
  "ForPublicRelease",
  "NotApproved",
  "NotForPublicRelease",
  "Sold",
  "TopSecret",
] as const;
export type PdfStampName = (typeof PDF_STAMP_NAMES)[number];

/**
 * §2.1 — the annotation colours are normative, so they are written into the
 * PDF `C` array and used as the read-back fallback from the same source.
 */
const HIGHLIGHT_HEX = PDF_READER_PALETTE["annot.highlight"];
const TEXT_MARKER_HEX = PDF_READER_PALETTE["annot.text.marker"];
const INK_HEX = PDF_READER_PALETTE["reader.accent"];

export const PDF_ANNOTATION_COLORS: Readonly<
  Record<PdfAnnotationKind, string>
> = {
  text: TEXT_MARKER_HEX,
  highlight: HIGHLIGHT_HEX,
  underline: "#2F9E44",
  strikeout: TEXT_MARKER_HEX,
  squiggly: "#F76707",
  freehand: INK_HEX,
  square: INK_HEX,
  circle: INK_HEX,
  line: INK_HEX,
  arrow: INK_HEX,
  stamp: TEXT_MARKER_HEX,
};

/** Highlight paints over the glyphs, so it is the one kind that must be sheer. */
const DEFAULT_OPACITY: Readonly<Record<PdfAnnotationKind, number>> = {
  text: 1,
  highlight: 0.35,
  underline: 1,
  strikeout: 1,
  squiggly: 1,
  freehand: 1,
  square: 1,
  circle: 1,
  line: 1,
  arrow: 1,
  stamp: 1,
};

const DEFAULT_STROKE_WIDTH = 2;

function pdfColorChannels(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  ) as [number, number, number];
}
export interface PdfVisualPoint {
  x: number;
  y: number;
}
export interface PdfVisualRect extends PdfVisualPoint {
  width: number;
  height: number;
}
export interface PdfPageGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
export interface PdfAnnotationView {
  id: string;
  kind: PdfAnnotationKind;
  contents: string;
  rect: PdfVisualRect;
  color: string;
  opacity: number;
  /** Quadrilateral bounds, one per marked glyph run. Quad kinds only. */
  quads: PdfVisualRect[];
  /** Ink strokes in visual coordinates. `freehand` only. */
  strokes: PdfVisualPoint[][];
  /** Start and end of a `line` / `arrow`. */
  endpoints: [PdfVisualPoint, PdfVisualPoint] | null;
  /** Built-in stamp name, when the stamp is not image-backed. */
  stampName: string;
}
interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clampCoordinate(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function safeDimension(value: number): number {
  return Math.max(Number.EPSILON, value);
}

function normalizedRotation(value: number): 0 | 90 | 180 | 270 {
  const rotation = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  return rotation === 90 || rotation === 180 || rotation === 270
    ? rotation
    : 0;
}

export function pdfPointToVisual(
  point: PdfVisualPoint,
  geometry: PdfPageGeometry,
): PdfVisualPoint {
  const u = (point.x - geometry.x) / safeDimension(geometry.width);
  const v =
    1 - (point.y - geometry.y) / safeDimension(geometry.height);
  switch (normalizedRotation(geometry.rotation)) {
    case 90:
      return { x: clampCoordinate(1 - v), y: clampCoordinate(u) };
    case 180:
      return { x: clampCoordinate(1 - u), y: clampCoordinate(1 - v) };
    case 270:
      return { x: clampCoordinate(v), y: clampCoordinate(1 - u) };
    default:
      return { x: clampCoordinate(u), y: clampCoordinate(v) };
  }
}

export function visualPointToPdf(
  point: PdfVisualPoint,
  geometry: PdfPageGeometry,
): PdfVisualPoint {
  const x = clampCoordinate(point.x);
  const y = clampCoordinate(point.y);
  let u = x;
  let v = y;
  if (normalizedRotation(geometry.rotation) === 90) {
    u = y;
    v = 1 - x;
  } else if (normalizedRotation(geometry.rotation) === 180) {
    u = 1 - x;
    v = 1 - y;
  } else if (normalizedRotation(geometry.rotation) === 270) {
    u = 1 - y;
    v = x;
  }
  return {
    x:
      geometry.x +
      clampCoordinate(u) * safeDimension(geometry.width),
    y:
      geometry.y +
      (1 - clampCoordinate(v)) * safeDimension(geometry.height),
  };
}

function rectCorners(rect: PdfRect): PdfVisualPoint[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height },
    { x: rect.x + rect.width, y: rect.y + rect.height },
  ];
}

function boundingRect(points: PdfVisualPoint[]): PdfRect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

export function pdfRectToVisual(
  rect: PdfRect,
  geometry: PdfPageGeometry,
): PdfVisualRect {
  const result = boundingRect(
    rectCorners(rect).map((point) => pdfPointToVisual(point, geometry)),
  );
  const left = clampCoordinate(result.x);
  const top = clampCoordinate(result.y);
  const right = clampCoordinate(result.x + result.width);
  const bottom = clampCoordinate(result.y + result.height);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function visualRectToPdf(
  rect: PdfVisualRect,
  geometry: PdfPageGeometry,
): PdfRect {
  const normalized = {
    x: clampCoordinate(rect.x),
    y: clampCoordinate(rect.y),
    width: clampCoordinate(rect.width, 0, 1 - clampCoordinate(rect.x)),
    height: clampCoordinate(rect.height, 0, 1 - clampCoordinate(rect.y)),
  };
  return boundingRect(
    rectCorners(normalized).map((point) => visualPointToPdf(point, geometry)),
  );
}

export function normalizedVisualRect(
  start: PdfVisualPoint,
  end: PdfVisualPoint,
): PdfVisualRect {
  const x = clampCoordinate(Math.min(start.x, end.x));
  const y = clampCoordinate(Math.min(start.y, end.y));
  return {
    x,
    y,
    width: clampCoordinate(Math.abs(end.x - start.x), 0, 1 - x),
    height: clampCoordinate(Math.abs(end.y - start.y), 0, 1 - y),
  };
}

const LOAD_OPTIONS = {
  ignoreEncryption: false,
  updateMetadata: false,
} as const;

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(Uint8Array.from(bytes), LOAD_OPTIONS);
}

async function savePdf(document: PDFDocument): Promise<Uint8Array> {
  return document.save({ useObjectStreams: true, objectsPerTick: 25 });
}

export function pdfPageGeometry(
  document: PDFDocument,
  pageIndex: number,
): PdfPageGeometry {
  if (
    !Number.isInteger(pageIndex) ||
    pageIndex < 0 ||
    pageIndex >= document.getPageCount()
  ) {
    throw new Error("PDF 页码超出范围");
  }
  const page = document.getPage(pageIndex);
  const cropBox = page.getCropBox();
  if (
    !Number.isFinite(cropBox.x) ||
    !Number.isFinite(cropBox.y) ||
    !Number.isFinite(cropBox.width) ||
    !Number.isFinite(cropBox.height) ||
    cropBox.width <= 0 ||
    cropBox.height <= 0
  ) {
    throw new Error("PDF CropBox 无效");
  }
  return {
    x: cropBox.x,
    y: cropBox.y,
    width: cropBox.width,
    height: cropBox.height,
    rotation: page.getRotation().angle,
  };
}

function decodeText(
  value: PDFString | PDFHexString | undefined,
): string {
  if (!value) return "";
  try {
    return value.decodeText();
  } catch {
    return "";
  }
}

function annotationId(
  dictionary: PDFDict,
  reference: PDFRef | null,
  index: number,
): string {
  const name = decodeText(
    dictionary.lookupMaybe(
      PDFName.of("NM"),
      PDFString,
      PDFHexString,
    ),
  );
  return name || (reference ? `ref:${reference.toString()}` : `direct:${index}`);
}

interface LocatedAnnotation {
  dictionary: PDFDict;
  reference: PDFRef | null;
  index: number;
  subtype: string;
}

function pageAnnotations(
  document: PDFDocument,
  pageIndex: number,
): LocatedAnnotation[] {
  const page = document.getPage(pageIndex);
  const annotations = page.node.Annots();
  if (!annotations) return [];
  const result: LocatedAnnotation[] = [];
  for (let index = 0; index < annotations.size(); index += 1) {
    const raw = annotations.get(index);
    const reference = raw instanceof PDFRef ? raw : null;
    const dictionary = reference
      ? document.context.lookup(reference, PDFDict)
      : raw instanceof PDFDict
        ? raw
        : null;
    if (!dictionary) continue;
    const subtype =
      dictionary
        .lookupMaybe(PDFName.of("Subtype"), PDFName)
        ?.decodeText() || "";
    result.push({ dictionary, reference, index, subtype });
  }
  return result;
}

/** A `Line` is an arrow when either line ending is an arrow form. */
const ARROW_ENDINGS = new Set([
  "OpenArrow",
  "ClosedArrow",
  "ROpenArrow",
  "RClosedArrow",
]);

function lineIsArrow(dictionary: PDFDict): boolean {
  const endings = dictionary.lookupMaybe(PDFName.of("LE"), PDFArray);
  if (!endings) return false;
  for (let index = 0; index < endings.size(); index += 1) {
    const name = endings.lookupMaybe(index, PDFName)?.decodeText() || "";
    if (ARROW_ENDINGS.has(name)) return true;
  }
  return false;
}

function annotationKind(
  dictionary: PDFDict,
  subtype: string,
): PdfAnnotationKind | null {
  if (subtype === "Line") return lineIsArrow(dictionary) ? "arrow" : "line";
  const match = PDF_ANNOTATION_KINDS.find(
    (kind) => kind !== "arrow" && PDF_ANNOTATION_SUBTYPES[kind] === subtype,
  );
  return match || null;
}

function locateAnnotation(
  document: PDFDocument,
  pageIndex: number,
  id: string,
): LocatedAnnotation {
  const match = pageAnnotations(document, pageIndex).find(
    (entry) =>
      annotationId(entry.dictionary, entry.reference, entry.index) === id,
  );
  if (!match) throw new Error("找不到所选 PDF 批注");
  if (!annotationKind(match.dictionary, match.subtype)) {
    throw new Error("此 PDF 批注类型暂不支持编辑");
  }
  return match;
}

function colorHex(array: PDFArray | undefined, fallback: string): string {
  if (!array || array.size() < 3) return fallback;
  const channels = [0, 1, 2].map(
    (index) => array.lookupMaybe(index, PDFNumber)?.asNumber() ?? 0,
  );
  return `#${channels
    .map((value) =>
      Math.round(Math.max(0, Math.min(1, value)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function numbersOf(array: PDFArray | undefined): number[] {
  if (!array) return [];
  const values: number[] = [];
  for (let index = 0; index < array.size(); index += 1) {
    const value = array.lookupMaybe(index, PDFNumber)?.asNumber();
    if (typeof value !== "number" || !Number.isFinite(value)) return [];
    values.push(value);
  }
  return values;
}

/** `QuadPoints` is upper-left, upper-right, lower-left, lower-right per quad. */
function readQuads(
  dictionary: PDFDict,
  geometry: PdfPageGeometry,
): PdfVisualRect[] {
  const flat = numbersOf(
    dictionary.lookupMaybe(PDFName.of("QuadPoints"), PDFArray),
  );
  const quads: PdfVisualRect[] = [];
  for (let offset = 0; offset + 8 <= flat.length; offset += 8) {
    const xs = [flat[offset], flat[offset + 2], flat[offset + 4], flat[offset + 6]];
    const ys = [flat[offset + 1], flat[offset + 3], flat[offset + 5], flat[offset + 7]];
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    quads.push(
      pdfRectToVisual(
        { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y },
        geometry,
      ),
    );
  }
  return quads;
}

function readStrokes(
  document: PDFDocument,
  dictionary: PDFDict,
  geometry: PdfPageGeometry,
): PdfVisualPoint[][] {
  const list = dictionary.lookupMaybe(PDFName.of("InkList"), PDFArray);
  if (!list) return [];
  const strokes: PdfVisualPoint[][] = [];
  for (let index = 0; index < list.size(); index += 1) {
    const raw = list.get(index);
    const stroke =
      raw instanceof PDFRef ? document.context.lookup(raw, PDFArray) : raw;
    if (!(stroke instanceof PDFArray)) continue;
    const flat = numbersOf(stroke);
    const points: PdfVisualPoint[] = [];
    for (let offset = 0; offset + 2 <= flat.length; offset += 2) {
      points.push(
        pdfPointToVisual({ x: flat[offset], y: flat[offset + 1] }, geometry),
      );
    }
    if (points.length) strokes.push(points);
  }
  return strokes;
}

function readEndpoints(
  dictionary: PDFDict,
  geometry: PdfPageGeometry,
): [PdfVisualPoint, PdfVisualPoint] | null {
  const flat = numbersOf(dictionary.lookupMaybe(PDFName.of("L"), PDFArray));
  if (flat.length < 4) return null;
  return [
    pdfPointToVisual({ x: flat[0], y: flat[1] }, geometry),
    pdfPointToVisual({ x: flat[2], y: flat[3] }, geometry),
  ];
}

export async function listPdfAnnotations(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<PdfAnnotationView[]> {
  const document = await loadPdf(bytes);
  const geometry = pdfPageGeometry(document, pageIndex);
  return pageAnnotations(document, pageIndex).flatMap((entry) => {
    const kind = annotationKind(entry.dictionary, entry.subtype);
    if (!kind) return [];
    const rect = entry.dictionary.lookupMaybe(PDFName.of("Rect"), PDFArray);
    if (!rect) return [];
    let box: { x: number; y: number; width: number; height: number };
    try {
      box = rect.asRectangle();
    } catch {
      return [];
    }
    const opacity = entry.dictionary
      .lookupMaybe(PDFName.of("CA"), PDFNumber)
      ?.asNumber();
    return [
      {
        id: annotationId(entry.dictionary, entry.reference, entry.index),
        kind,
        contents: decodeText(
          entry.dictionary.lookupMaybe(
            PDFName.of("Contents"),
            PDFString,
            PDFHexString,
          ),
        ).slice(0, 2_000),
        rect: pdfRectToVisual(box, geometry),
        color: colorHex(
          entry.dictionary.lookupMaybe(PDFName.of("C"), PDFArray),
          PDF_ANNOTATION_COLORS[kind],
        ),
        opacity:
          typeof opacity === "number" && Number.isFinite(opacity)
            ? Math.max(0, Math.min(1, opacity))
            : DEFAULT_OPACITY[kind],
        quads: QUAD_KINDS.includes(kind)
          ? readQuads(entry.dictionary, geometry)
          : [],
        strokes:
          kind === "freehand"
            ? readStrokes(document, entry.dictionary, geometry)
            : [],
        endpoints:
          kind === "line" || kind === "arrow"
            ? readEndpoints(entry.dictionary, geometry)
            : null,
        stampName:
          kind === "stamp"
            ? entry.dictionary
                .lookupMaybe(PDFName.of("Name"), PDFName)
                ?.decodeText() || ""
            : "",
      },
    ];
  });
}

function freshAnnotationId(): string {
  return `oceanleo-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export interface PdfStampImage {
  bytes: Uint8Array;
  mediaType: "image/png" | "image/jpeg";
}

export interface PdfAnnotationDraft {
  kind: PdfAnnotationKind;
  contents?: string;
  color?: string;
  interiorColor?: string;
  opacity?: number;
  /** Stroke width in PDF points. */
  strokeWidth?: number;
  /** Bounds for `text`, `square`, `circle` and `stamp`. */
  rect?: PdfVisualRect;
  /** Placement for `text` when no rect is supplied. */
  point?: PdfVisualPoint;
  /** One quadrilateral per marked glyph run. Quad kinds only. */
  quads?: PdfVisualRect[];
  /** Ink strokes in visual coordinates. `freehand` only. */
  strokes?: PdfVisualPoint[][];
  /** Start and end of a `line` / `arrow`. */
  endpoints?: [PdfVisualPoint, PdfVisualPoint];
  stampName?: PdfStampName;
  stampImage?: PdfStampImage;
  /**
   * Sub-rectangle of the stamp image to show, in 0..1 image coordinates with
   * the origin at the bottom left. Used by cross-page seals, where each page
   * carries one vertical slice of a single seal.
   */
  stampImageCrop?: PdfVisualRect;
  author?: string;
}

function formatNumber(value: number): string {
  return (Math.round(value * 1000) / 1000).toString();
}

function strokeOps(hex: string): string {
  return `${pdfColorChannels(hex).map(formatNumber).join(" ")} RG`;
}

function fillOps(hex: string): string {
  return `${pdfColorChannels(hex).map(formatNumber).join(" ")} rg`;
}

function padRect(rect: PdfRect, padding: number): PdfRect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

/**
 * The appearance stream lives inside the annotation object, not the page
 * content stream, so deleting the annotation still takes the drawing with it.
 */
function appearanceRef(
  document: PDFDocument,
  box: PdfRect,
  operators: string,
  resources: PdfLiteralObject = {},
): PDFRef {
  const stream = document.context.flateStream(operators, {
    Type: "XObject",
    Subtype: "Form",
    FormType: 1,
    BBox: [box.x, box.y, box.x + box.width, box.y + box.height],
    Matrix: [1, 0, 0, 1, 0, 0],
    Resources: resources,
  });
  return document.context.register(stream);
}

function quadsToPdf(
  quads: readonly PdfVisualRect[],
  geometry: PdfPageGeometry,
): PdfRect[] {
  return quads
    .map((quad) => visualRectToPdf(quad, geometry))
    .filter((quad) => quad.width > 0 && quad.height > 0);
}

function unionRect(boxes: readonly PdfRect[]): PdfRect {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
  };
}

function quadPointsArray(boxes: readonly PdfRect[]): number[] {
  return boxes.flatMap((box) => [
    box.x,
    box.y + box.height,
    box.x + box.width,
    box.y + box.height,
    box.x,
    box.y,
    box.x + box.width,
    box.y,
  ]);
}

function squigglePath(box: PdfRect, amplitude: number): string {
  const step = Math.max(2, amplitude * 2);
  const baseline = box.y + amplitude;
  let path = `${formatNumber(box.x)} ${formatNumber(baseline)} m`;
  let up = true;
  for (let x = box.x + step; x <= box.x + box.width; x += step) {
    path += ` ${formatNumber(x)} ${formatNumber(baseline + (up ? amplitude : -amplitude))} l`;
    up = !up;
  }
  return `${path} S`;
}

function ellipsePath(box: PdfRect): string {
  const kappa = 0.5522847498;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const rx = box.width / 2;
  const ry = box.height / 2;
  const ox = rx * kappa;
  const oy = ry * kappa;
  const n = formatNumber;
  return [
    `${n(cx - rx)} ${n(cy)} m`,
    `${n(cx - rx)} ${n(cy + oy)} ${n(cx - ox)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)} c`,
    `${n(cx + ox)} ${n(cy + ry)} ${n(cx + rx)} ${n(cy + oy)} ${n(cx + rx)} ${n(cy)} c`,
    `${n(cx + rx)} ${n(cy - oy)} ${n(cx + ox)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)} c`,
    `${n(cx - ox)} ${n(cy - ry)} ${n(cx - rx)} ${n(cy - oy)} ${n(cx - rx)} ${n(cy)} c`,
  ].join("\n");
}

function arrowHeadPath(
  from: PdfVisualPoint,
  to: PdfVisualPoint,
  size: number,
): { path: string; points: PdfVisualPoint[] } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const baseX = to.x - ux * size;
  const baseY = to.y - uy * size;
  const wing = size * 0.45;
  const left = { x: baseX - uy * wing, y: baseY + ux * wing };
  const right = { x: baseX + uy * wing, y: baseY - ux * wing };
  const n = formatNumber;
  return {
    path: `${n(to.x)} ${n(to.y)} m ${n(left.x)} ${n(left.y)} l ${n(right.x)} ${n(right.y)} l h f`,
    points: [to, left, right],
  };
}

interface AnnotationShape {
  rect: PdfRect;
  entries: PdfLiteralObject;
  appearance?: { operators: string; resources?: PdfLiteralObject };
}

function buildQuadShape(
  kind: PdfAnnotationKind,
  draft: PdfAnnotationDraft,
  geometry: PdfPageGeometry,
  color: string,
): AnnotationShape {
  const source =
    draft.quads && draft.quads.length ? draft.quads : draft.rect ? [draft.rect] : [];
  const boxes = quadsToPdf(source, geometry);
  if (!boxes.length) throw new Error("批注区域无效");
  const rect = unionRect(boxes);
  const entries: PdfLiteralObject = {
    QuadPoints: quadPointsArray(boxes),
  };
  let operators = "";
  if (kind === "highlight") {
    operators = [
      fillOps(color),
      ...boxes.map(
        (box) =>
          `${formatNumber(box.x)} ${formatNumber(box.y)} ${formatNumber(box.width)} ${formatNumber(box.height)} re`,
      ),
      "f",
    ].join("\n");
  } else {
    const width = Math.max(
      0.75,
      draft.strokeWidth ??
        Math.min(...boxes.map((box) => box.height)) * 0.07,
    );
    entries.BS = { W: width, S: PDFName.of("S") };
    const lines = boxes.map((box) => {
      if (kind === "underline") {
        const y = box.y + width;
        return `${formatNumber(box.x)} ${formatNumber(y)} m ${formatNumber(box.x + box.width)} ${formatNumber(y)} l S`;
      }
      if (kind === "strikeout") {
        const y = box.y + box.height / 2;
        return `${formatNumber(box.x)} ${formatNumber(y)} m ${formatNumber(box.x + box.width)} ${formatNumber(y)} l S`;
      }
      return squigglePath(box, Math.max(1, width));
    });
    operators = [strokeOps(color), `${formatNumber(width)} w`, ...lines].join("\n");
  }
  return { rect, entries, appearance: { operators } };
}

function buildShapeAnnotation(
  kind: "square" | "circle",
  draft: PdfAnnotationDraft,
  geometry: PdfPageGeometry,
  color: string,
): AnnotationShape {
  if (!draft.rect) throw new Error("批注区域无效");
  const box = visualRectToPdf(draft.rect, geometry);
  if (box.width <= 0 || box.height <= 0) throw new Error("批注区域无效");
  const width = Math.max(0.5, draft.strokeWidth ?? DEFAULT_STROKE_WIDTH);
  const inset = {
    x: box.x + width / 2,
    y: box.y + width / 2,
    width: Math.max(0, box.width - width),
    height: Math.max(0, box.height - width),
  };
  const entries: PdfLiteralObject = {
    BS: { W: width, S: PDFName.of("S") },
    RD: [width / 2, width / 2, width / 2, width / 2],
  };
  if (draft.interiorColor) {
    entries.IC = pdfColorChannels(draft.interiorColor);
  }
  const path =
    kind === "square"
      ? `${formatNumber(inset.x)} ${formatNumber(inset.y)} ${formatNumber(inset.width)} ${formatNumber(inset.height)} re`
      : ellipsePath(inset);
  const paint = draft.interiorColor ? "B" : "S";
  const operators = [
    strokeOps(color),
    ...(draft.interiorColor ? [fillOps(draft.interiorColor)] : []),
    `${formatNumber(width)} w`,
    path,
    paint,
  ].join("\n");
  return { rect: box, entries, appearance: { operators } };
}

function buildLineAnnotation(
  kind: "line" | "arrow",
  draft: PdfAnnotationDraft,
  geometry: PdfPageGeometry,
  color: string,
): AnnotationShape {
  if (!draft.endpoints) throw new Error("需要线段的起点与终点");
  const [from, to] = draft.endpoints.map((point) =>
    visualPointToPdf(point, geometry),
  );
  const width = Math.max(0.5, draft.strokeWidth ?? DEFAULT_STROKE_WIDTH);
  const headSize = Math.max(6, width * 4);
  const head = kind === "arrow" ? arrowHeadPath(from, to, headSize) : null;
  const points = [from, to, ...(head?.points || [])];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const rect = padRect(
    {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    },
    width,
  );
  const entries: PdfLiteralObject = {
    L: [from.x, from.y, to.x, to.y],
    LE: [
      PDFName.of("None"),
      PDFName.of(kind === "arrow" ? "ClosedArrow" : "None"),
    ],
    BS: { W: width, S: PDFName.of("S") },
    IC: pdfColorChannels(color),
  };
  const n = formatNumber;
  const operators = [
    strokeOps(color),
    fillOps(color),
    `${n(width)} w`,
    "1 J 1 j",
    `${n(from.x)} ${n(from.y)} m ${n(to.x)} ${n(to.y)} l S`,
    ...(head ? [head.path] : []),
  ].join("\n");
  return { rect, entries, appearance: { operators } };
}

function buildInkAnnotation(
  draft: PdfAnnotationDraft,
  geometry: PdfPageGeometry,
  color: string,
): AnnotationShape {
  const strokes = (draft.strokes || [])
    .map((stroke) => stroke.map((point) => visualPointToPdf(point, geometry)))
    .filter((stroke) => stroke.length >= 1);
  if (!strokes.length) throw new Error("墨迹为空");
  const width = Math.max(0.5, draft.strokeWidth ?? DEFAULT_STROKE_WIDTH);
  const all = strokes.flat();
  const xs = all.map((point) => point.x);
  const ys = all.map((point) => point.y);
  const rect = padRect(
    {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    },
    width,
  );
  const n = formatNumber;
  const paths = strokes.map((stroke) => {
    if (stroke.length === 1) {
      const [only] = stroke;
      return `${n(only.x)} ${n(only.y)} m ${n(only.x + 0.01)} ${n(only.y)} l S`;
    }
    return `${stroke
      .map((point, index) => `${n(point.x)} ${n(point.y)} ${index === 0 ? "m" : "l"}`)
      .join(" ")} S`;
  });
  return {
    rect,
    entries: {
      InkList: strokes.map((stroke) => stroke.flatMap((point) => [point.x, point.y])),
      BS: { W: width, S: PDFName.of("S") },
    },
    appearance: {
      operators: [strokeOps(color), `${n(width)} w`, "1 J 1 j", ...paths].join("\n"),
    },
  };
}

async function buildStampAnnotation(
  document: PDFDocument,
  draft: PdfAnnotationDraft,
  geometry: PdfPageGeometry,
): Promise<AnnotationShape> {
  if (!draft.rect) throw new Error("批注区域无效");
  const box = visualRectToPdf(draft.rect, geometry);
  if (box.width <= 0 || box.height <= 0) throw new Error("批注区域无效");
  if (!draft.stampImage) {
    return {
      rect: box,
      entries: { Name: PDFName.of(draft.stampName || "Draft") },
    };
  }
  const image =
    draft.stampImage.mediaType === "image/jpeg"
      ? await document.embedJpg(draft.stampImage.bytes)
      : await document.embedPng(draft.stampImage.bytes);
  const n = formatNumber;
  const crop = draft.stampImageCrop;
  const placement =
    crop && crop.width > 0 && crop.height > 0
      ? (() => {
          // Scale the whole image up so the crop window alone fills the box,
          // then shift the window into place. The appearance BBox clips the
          // rest away (PDF 32000-1 §12.5.5).
          const scaleX = box.width / crop.width;
          const scaleY = box.height / crop.height;
          return [
            `${n(box.x)} ${n(box.y)} ${n(box.width)} ${n(box.height)} re W n`,
            `${n(scaleX)} 0 0 ${n(scaleY)} ${n(box.x - scaleX * crop.x)} ${n(
              box.y - scaleY * crop.y,
            )} cm`,
          ];
        })()
      : [`${n(box.width)} 0 0 ${n(box.height)} ${n(box.x)} ${n(box.y)} cm`];
  return {
    rect: box,
    entries: draft.stampName ? { Name: PDFName.of(draft.stampName) } : {},
    appearance: {
      operators: ["q", ...placement, "/OceanLeoStamp Do", "Q"].join("\n"),
      resources: { XObject: { OceanLeoStamp: image.ref } },
    },
  };
}

function buildTextAnnotation(
  draft: PdfAnnotationDraft,
  geometry: PdfPageGeometry,
): AnnotationShape {
  const size = Math.min(24, geometry.width, geometry.height);
  const anchor = draft.rect
    ? visualRectToPdf(draft.rect, geometry)
    : (() => {
        const position = visualPointToPdf(
          draft.point || { x: 0.9, y: 0.1 },
          geometry,
        );
        return {
          x: position.x - size / 2,
          y: position.y - size / 2,
          width: size,
          height: size,
        };
      })();
  const width = Math.max(size, Math.min(anchor.width || size, geometry.width));
  const height = Math.max(size, Math.min(anchor.height || size, geometry.height));
  const x = Math.max(
    geometry.x,
    Math.min(geometry.x + geometry.width - width, anchor.x),
  );
  const y = Math.max(
    geometry.y,
    Math.min(geometry.y + geometry.height - height, anchor.y),
  );
  return {
    rect: { x, y, width, height },
    entries: { Name: PDFName.of("Comment") },
  };
}

async function buildAnnotationShape(
  document: PDFDocument,
  draft: PdfAnnotationDraft,
  geometry: PdfPageGeometry,
  color: string,
): Promise<AnnotationShape> {
  switch (draft.kind) {
    case "text":
      return buildTextAnnotation(draft, geometry);
    case "highlight":
    case "underline":
    case "strikeout":
    case "squiggly":
      return buildQuadShape(draft.kind, draft, geometry, color);
    case "square":
    case "circle":
      return buildShapeAnnotation(draft.kind, draft, geometry, color);
    case "line":
    case "arrow":
      return buildLineAnnotation(draft.kind, draft, geometry, color);
    case "freehand":
      return buildInkAnnotation(draft, geometry, color);
    case "stamp":
      return buildStampAnnotation(document, draft, geometry);
  }
}

/**
 * Appends one standard annotation dictionary to the page and returns its id.
 * Callers that need the bytes use {@link addPdfAnnotation}; the signature and
 * redaction paths reuse this so they can batch several writes into one save.
 */
export async function appendPdfAnnotation(
  document: PDFDocument,
  pageIndex: number,
  draft: PdfAnnotationDraft,
): Promise<string> {
  const geometry = pdfPageGeometry(document, pageIndex);
  const page = document.getPage(pageIndex);
  const color = draft.color || PDF_ANNOTATION_COLORS[draft.kind];
  const contents = (draft.contents || "").trim().slice(0, 2_000);
  if (draft.kind === "text" && !contents) {
    throw new Error("批注内容不能为空");
  }
  const shape = await buildAnnotationShape(document, draft, geometry, color);
  const id = freshAnnotationId();
  const opacity = Math.max(
    0,
    Math.min(1, draft.opacity ?? DEFAULT_OPACITY[draft.kind]),
  );
  const entries: PdfLiteralObject = {
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of(PDF_ANNOTATION_SUBTYPES[draft.kind]),
    Rect: [
      shape.rect.x,
      shape.rect.y,
      shape.rect.x + shape.rect.width,
      shape.rect.y + shape.rect.height,
    ],
    Contents: PDFHexString.fromText(contents),
    NM: PDFHexString.fromText(id),
    T: PDFHexString.fromText(draft.author || "OceanLeo"),
    C: pdfColorChannels(color),
    CA: opacity,
    F: 4,
    ...shape.entries,
  };
  if (shape.appearance) {
    entries.AP = {
      N: appearanceRef(
        document,
        shape.rect,
        shape.appearance.operators,
        shape.appearance.resources,
      ),
    };
  }
  page.node.addAnnot(document.context.register(document.context.obj(entries)));
  return id;
}

export async function addPdfAnnotation(
  bytes: Uint8Array,
  pageIndex: number,
  draft: PdfAnnotationDraft,
): Promise<{ bytes: Uint8Array; id: string }> {
  const document = await loadPdf(bytes);
  const id = await appendPdfAnnotation(document, pageIndex, draft);
  return { bytes: await savePdf(document), id };
}

export async function addPdfTextAnnotationAt(
  bytes: Uint8Array,
  pageIndex: number,
  contents: string,
  point: PdfVisualPoint = { x: 0.9, y: 0.1 },
): Promise<{ bytes: Uint8Array; id: string }> {
  return addPdfAnnotation(bytes, pageIndex, {
    kind: "text",
    contents,
    point,
  });
}

export async function addPdfHighlightAnnotation(
  bytes: Uint8Array,
  pageIndex: number,
  rect: PdfVisualRect,
  contents = "",
): Promise<{ bytes: Uint8Array; id: string }> {
  if (rect.width < 0.002 || rect.height < 0.002) {
    throw new Error("高亮区域过小");
  }
  return addPdfAnnotation(bytes, pageIndex, {
    kind: "highlight",
    rect,
    contents,
  });
}

export async function movePdfAnnotation(
  bytes: Uint8Array,
  pageIndex: number,
  id: string,
  rect: PdfVisualRect,
): Promise<Uint8Array> {
  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error("批注区域无效");
  }
  const document = await loadPdf(bytes);
  const geometry = pdfPageGeometry(document, pageIndex);
  const located = locateAnnotation(document, pageIndex, id);
  const box = visualRectToPdf(rect, geometry);
  const left = box.x;
  const right = box.x + box.width;
  const bottom = box.y;
  const top = box.y + box.height;
  const previous = numbersOf(
    located.dictionary.lookupMaybe(PDFName.of("Rect"), PDFArray),
  );
  located.dictionary.set(
    PDFName.of("Rect"),
    document.context.obj([left, bottom, right, top]),
  );
  const kind = annotationKind(located.dictionary, located.subtype);
  // The appearance stream needs no edit: PDF 32000-1 §12.5.5 maps the
  // transformed BBox onto Rect, so the drawing follows the new box by itself.
  // The geometry keys are normative data, though, and every reader trusts them
  // over the appearance, so they have to move with it.
  if (kind && QUAD_KINDS.includes(kind)) {
    located.dictionary.set(
      PDFName.of("QuadPoints"),
      document.context.obj([left, top, right, top, left, bottom, right, bottom]),
    );
  } else if (previous.length >= 4) {
    const source = {
      x: Math.min(previous[0], previous[2]),
      y: Math.min(previous[1], previous[3]),
      width: Math.abs(previous[2] - previous[0]),
      height: Math.abs(previous[3] - previous[1]),
    };
    const scaleX = source.width > 0 ? box.width / source.width : 1;
    const scaleY = source.height > 0 ? box.height / source.height : 1;
    const mapX = (value: number) => left + (value - source.x) * scaleX;
    const mapY = (value: number) => bottom + (value - source.y) * scaleY;
    if (kind === "line" || kind === "arrow") {
      const line = numbersOf(
        located.dictionary.lookupMaybe(PDFName.of("L"), PDFArray),
      );
      if (line.length >= 4) {
        located.dictionary.set(
          PDFName.of("L"),
          document.context.obj([
            mapX(line[0]),
            mapY(line[1]),
            mapX(line[2]),
            mapY(line[3]),
          ]),
        );
      }
    }
    if (kind === "freehand") {
      const strokes = readStrokes(document, located.dictionary, geometry).map(
        (stroke) =>
          stroke
            .map((point) => visualPointToPdf(point, geometry))
            .flatMap((point) => [mapX(point.x), mapY(point.y)]),
      );
      if (strokes.length) {
        located.dictionary.set(
          PDFName.of("InkList"),
          document.context.obj(strokes),
        );
      }
    }
  }
  return savePdf(document);
}

export async function updatePdfAnnotation(
  bytes: Uint8Array,
  pageIndex: number,
  id: string,
  contents: string,
): Promise<Uint8Array> {
  const document = await loadPdf(bytes);
  pdfPageGeometry(document, pageIndex);
  const located = locateAnnotation(document, pageIndex, id);
  const text = contents.trim().slice(0, 2_000);
  if (located.subtype === "Text" && !text) {
    throw new Error("文字批注内容不能为空");
  }
  located.dictionary.set(
    PDFName.of("Contents"),
    PDFHexString.fromText(text),
  );
  return savePdf(document);
}

export async function deletePdfAnnotation(
  bytes: Uint8Array,
  pageIndex: number,
  id: string,
): Promise<Uint8Array> {
  const document = await loadPdf(bytes);
  pdfPageGeometry(document, pageIndex);
  const located = locateAnnotation(document, pageIndex, id);
  const page = document.getPage(pageIndex);
  if (located.reference) {
    page.node.removeAnnot(located.reference);
  } else {
    page.node.Annots()?.remove(located.index);
  }
  return savePdf(document);
}
