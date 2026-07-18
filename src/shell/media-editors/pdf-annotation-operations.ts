"use client";

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
} from "pdf-lib";
export type PdfAnnotationKind = "text" | "highlight";
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
  if (match.subtype !== "Text" && match.subtype !== "Highlight") {
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

export async function listPdfAnnotations(
  bytes: Uint8Array,
  pageIndex: number,
): Promise<PdfAnnotationView[]> {
  const document = await loadPdf(bytes);
  const geometry = pdfPageGeometry(document, pageIndex);
  return pageAnnotations(document, pageIndex).flatMap((entry) => {
    if (entry.subtype !== "Text" && entry.subtype !== "Highlight") return [];
    const rect = entry.dictionary.lookupMaybe(PDFName.of("Rect"), PDFArray);
    if (!rect) return [];
    let box: { x: number; y: number; width: number; height: number };
    try {
      box = rect.asRectangle();
    } catch {
      return [];
    }
    return [
      {
        id: annotationId(entry.dictionary, entry.reference, entry.index),
        kind: entry.subtype === "Highlight" ? "highlight" : "text",
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
          entry.subtype === "Highlight" ? "#facc15" : "#f59e0b",
        ),
      },
    ];
  });
}

function freshAnnotationId(): string {
  return `oceanleo-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export async function addPdfTextAnnotationAt(
  bytes: Uint8Array,
  pageIndex: number,
  contents: string,
  point: PdfVisualPoint = { x: 0.9, y: 0.1 },
): Promise<{ bytes: Uint8Array; id: string }> {
  const text = contents.trim().slice(0, 2_000);
  if (!text) throw new Error("批注内容不能为空");
  const document = await loadPdf(bytes);
  const geometry = pdfPageGeometry(document, pageIndex);
  const page = document.getPage(pageIndex);
  const position = visualPointToPdf(point, geometry);
  const size = Math.min(24, geometry.width, geometry.height);
  const x = Math.max(
    geometry.x,
    Math.min(
      geometry.x + geometry.width - size,
      position.x - size / 2,
    ),
  );
  const y = Math.max(
    geometry.y,
    Math.min(
      geometry.y + geometry.height - size,
      position.y - size / 2,
    ),
  );
  const id = freshAnnotationId();
  const annotation = document.context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Text"),
    Rect: [x, y, x + size, y + size],
    Contents: PDFHexString.fromText(text),
    NM: PDFHexString.fromText(id),
    T: PDFHexString.fromText("OceanLeo"),
    Name: PDFName.of("Comment"),
    C: [1, 0.65, 0],
    F: 4,
  });
  page.node.addAnnot(document.context.register(annotation));
  return { bytes: await savePdf(document), id };
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
  const document = await loadPdf(bytes);
  const geometry = pdfPageGeometry(document, pageIndex);
  const page = document.getPage(pageIndex);
  const box = visualRectToPdf(rect, geometry);
  const left = box.x;
  const right = box.x + box.width;
  const bottom = box.y;
  const top = box.y + box.height;
  const id = freshAnnotationId();
  const annotation = document.context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Highlight"),
    Rect: [left, bottom, right, top],
    QuadPoints: [left, top, right, top, left, bottom, right, bottom],
    Contents: PDFHexString.fromText(contents.trim().slice(0, 2_000)),
    NM: PDFHexString.fromText(id),
    T: PDFHexString.fromText("OceanLeo"),
    C: [1, 0.8, 0],
    CA: 0.35,
    F: 4,
  });
  page.node.addAnnot(document.context.register(annotation));
  return { bytes: await savePdf(document), id };
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
  located.dictionary.set(
    PDFName.of("Rect"),
    document.context.obj([left, bottom, right, top]),
  );
  if (located.subtype === "Highlight") {
    located.dictionary.set(
      PDFName.of("QuadPoints"),
      document.context.obj([
        left,
        top,
        right,
        top,
        left,
        bottom,
        right,
        bottom,
      ]),
    );
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
