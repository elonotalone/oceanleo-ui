"use client";

// ============================================================================
// @oceanleo/ui — fabric 图片编辑器运行时助手
// ----------------------------------------------------------------------------
// 与 editor-objects 一样不在顶层加载 fabric 运行时；动态加载后的模块由 hook
// 显式传入。这里集中画布视口、文档底板、背景图和历史快照，避免主 hook 膨胀。
// ============================================================================

import type { Canvas, FabricImage, FabricObject, Rect, TMat2D } from "fabric";
import {
  SNAPSHOT_PROPS,
  centerOrigin,
  type EditorObject,
  type FabricNS,
  makeId,
  roleOf,
  setEditorObjectId,
  setLocked,
} from "./editor-objects";
import { imageFitScales } from "./fabric-geometry";
import type { DocSize } from "./types";
import {
  normalizeImageEditorSnapshot,
  type ImageEditorSnapshot,
} from "./image-document-contract";

export type EditorSnapshot = ImageEditorSnapshot;
export const normalizeEditorSnapshot = normalizeImageEditorSnapshot;

export const IMAGE_EDGE_SNAP_ACQUIRE_PX = 8;
export const IMAGE_EDGE_SNAP_RELEASE_PX = 14;

export type ImageCanvasEdge = "left" | "right" | "top" | "bottom";
export type ImageHorizontalSnapEdge = Extract<
  ImageCanvasEdge,
  "left" | "right"
>;
export type ImageVerticalSnapEdge = Extract<ImageCanvasEdge, "top" | "bottom">;

export interface ImageEdgeSnapState {
  x: ImageHorizontalSnapEdge | null;
  y: ImageVerticalSnapEdge | null;
}

export interface ImageEdgeSnapResult {
  dx: number;
  dy: number;
  state: ImageEdgeSnapState;
}

export interface ImageEdgeScaleMultipliers {
  x: number;
  y: number;
}

const ALL_IMAGE_CANVAS_EDGES: readonly ImageCanvasEdge[] = [
  "left",
  "right",
  "top",
  "bottom",
];

export function emptyImageEdgeSnapState(): ImageEdgeSnapState {
  return { x: null, y: null };
}

/**
 * Fabric object bounds are in the scene/document plane. Convert edge distances
 * through the viewport's axis scales so magnetic thresholds stay in CSS pixels.
 */
export function viewportAxisScales(
  viewport: readonly number[] | null | undefined,
): { x: number; y: number } {
  const matrix = viewport ?? [1, 0, 0, 1, 0, 0];
  const x = Math.hypot(matrix[0] ?? 1, matrix[1] ?? 0);
  const y = Math.hypot(matrix[2] ?? 0, matrix[3] ?? 1);
  return {
    x: Number.isFinite(x) && x > 0 ? x : 1,
    y: Number.isFinite(y) && y > 0 ? y : 1,
  };
}

/**
 * CSS px per Fabric bitmap/canvas unit. Design-embed often CSS-shrinks the
 * canvas while viewportTransform stays ~identity for pointer mapping
 * (pointerScale≈1, visualScale≈0.19). Snap thresholds must use both.
 */
export function canvasElementCssScales(canvas: {
  getElement?: () => HTMLCanvasElement | null | undefined;
  lowerCanvasEl?: HTMLCanvasElement | null;
  upperCanvasEl?: HTMLCanvasElement | null;
  getWidth?: () => number;
  getHeight?: () => number;
  width?: number;
  height?: number;
} | null | undefined): { x: number; y: number } {
  if (!canvas) return { x: 1, y: 1 };
  const el =
    canvas.lowerCanvasEl ||
    canvas.upperCanvasEl ||
    (typeof canvas.getElement === "function" ? canvas.getElement() : null);
  if (!el || typeof el.getBoundingClientRect !== "function") {
    return { x: 1, y: 1 };
  }
  const rect = el.getBoundingClientRect();
  const bitmapW = Math.max(
    1,
    typeof canvas.getWidth === "function"
      ? canvas.getWidth()
      : Number(canvas.width) || el.width || 1,
  );
  const bitmapH = Math.max(
    1,
    typeof canvas.getHeight === "function"
      ? canvas.getHeight()
      : Number(canvas.height) || el.height || 1,
  );
  const x = rect.width / bitmapW;
  const y = rect.height / bitmapH;
  return {
    x: Number.isFinite(x) && x > 0 ? x : 1,
    y: Number.isFinite(y) && y > 0 ? y : 1,
  };
}

/** CSS px per scene/logical unit for magnetic edge thresholds. */
export function imageEdgeSnapScreenScales(
  viewport: readonly number[] | null | undefined,
  cssScale: { x?: number; y?: number } | null | undefined = null,
  /**
   * Controller fit/zoom bookkeeping. Production occasionally leaves
   * viewportTransform ≈ identity while `this.zoom` still holds the fit scale
   * (harness pointerScale≈1, visualScale≈0.19). Never under-read that zoom.
   */
  zoomFallback: number | null | undefined = null,
): { x: number; y: number } {
  const vpt = viewportAxisScales(viewport);
  const cssX =
    Number.isFinite(cssScale?.x) && (cssScale?.x as number) > 0
      ? (cssScale?.x as number)
      : 1;
  const cssY =
    Number.isFinite(cssScale?.y) && (cssScale?.y as number) > 0
      ? (cssScale?.y as number)
      : 1;
  const zoom =
    Number.isFinite(zoomFallback) && (zoomFallback as number) > 0
      ? (zoomFallback as number)
      : 0;
  // Prefer VPT×CSS. When VPT looks like identity but bookkeeping zoom still
  // holds a real fit scale (<1), trust zoom — production pointerScale≈1 miss.
  const axis = (vptScale: number, css: number) => {
    const fromVpt = Math.max(1e-6, vptScale * css);
    if (fromVpt > 0.98 && zoom > 0 && zoom < 0.98) {
      return Math.max(1e-6, zoom * css);
    }
    return fromVpt;
  };
  return {
    x: axis(vpt.x, cssX),
    y: axis(vpt.y, cssY),
  };
}

/** Page/client CSS positions for Fabric transform controls (V3 scale harness). */
export type ImageControlClientCoords = Partial<
  Record<
    "ml" | "mr" | "mt" | "mb" | "tl" | "tr" | "bl" | "br",
    { x: number; y: number }
  >
>;

/**
 * Map Fabric `oCoords` (canvas bitmap space) to page/client CSS pixels using the
 * upper/lower canvas element rect. Used for Playwright scale-handle targeting
 * when the Fabric instance is not reachable from `window`.
 */
export function imageControlClientCoordsFromOCoords(
  oCoords: Partial<
    Record<string, { x?: number; y?: number } | null | undefined>
  > | null
    | undefined,
  canvasRect: { left: number; top: number; width: number; height: number },
  canvasSize: { width: number; height: number },
): ImageControlClientCoords {
  const out: ImageControlClientCoords = {};
  if (!oCoords) return out;
  const canvasW = Math.max(1, canvasSize.width);
  const canvasH = Math.max(1, canvasSize.height);
  const sx = canvasRect.width / canvasW;
  const sy = canvasRect.height / canvasH;
  for (const key of ["ml", "mr", "mt", "mb", "tl", "tr", "bl", "br"] as const) {
    const pt = oCoords[key];
    if (
      !pt ||
      !Number.isFinite(pt.x) ||
      !Number.isFinite(pt.y)
    ) {
      continue;
    }
    out[key] = {
      x: canvasRect.left + (pt.x as number) * sx,
      y: canvasRect.top + (pt.y as number) * sy,
    };
  }
  return out;
}

export function imageSnapEdgesForControl(
  corner: string | undefined,
): readonly ImageCanvasEdge[] {
  switch (corner) {
    case "tl":
      return ["left", "top"];
    case "tr":
      return ["right", "top"];
    case "bl":
      return ["left", "bottom"];
    case "br":
      return ["right", "bottom"];
    case "ml":
      return ["left"];
    case "mr":
      return ["right"];
    case "mt":
      return ["top"];
    case "mb":
      return ["bottom"];
    default:
      return ALL_IMAGE_CANVAS_EDGES;
  }
}

export function imageScaleControlLocksAspectRatio(
  corner: string | undefined,
  shiftKey: boolean,
): boolean {
  return (
    !shiftKey &&
    (corner === "tl" ||
      corner === "tr" ||
      corner === "bl" ||
      corner === "br")
  );
}

/**
 * Near-full-bleed images have overlapping left/right (or top/bottom) magnetic
 * corridors. Bias acquire toward the edge the object is moving into so travel
 * through the opposite corridor does not yank. Keep a still-near latch on tiny
 * away-settle ticks unless the opposite edge is also inside acquire (competing).
 * Release should keep the gesture's last significant motion so opposite-corridor
 * edges do not steal a ≤acquire CSS latch on pointer-up.
 */
function resolveSnapAxis<T extends ImageCanvasEdge>(
  distances: ReadonlyArray<readonly [T, number]>,
  eligible: ReadonlySet<ImageCanvasEdge>,
  previous: T | null,
  screenScale: number,
  acquirePx: number,
  releasePx: number,
  motion = 0,
  towardLow: T,
  towardHigh: T,
): { correction: number; edge: T | null } {
  const candidateDistance = (edge: T) =>
    distances.find(([candidate]) => candidate === edge)?.[1];
  const screenDistanceFor = (edge: T) => {
    const distance = candidateDistance(edge);
    return distance == null
      ? Number.POSITIVE_INFINITY
      : Math.abs(distance) * screenScale;
  };
  const motionEpsilon = 0.25;
  // Break a latch only on deliberate reverse travel (≥2 CSS), not settle ticks.
  // Near-full-bleed always has a competing opposite corridor inside acquire.
  const breakAwayCss = 2;
  if (previous && eligible.has(previous)) {
    const distance = candidateDistance(previous);
    if (
      distance != null &&
      Math.abs(distance) * screenScale <= releasePx
    ) {
      const away =
        (previous === towardLow && motion > motionEpsilon) ||
        (previous === towardHigh && motion < -motionEpsilon);
      const awayCss = Math.abs(motion) * screenScale;
      const opposite = previous === towardLow ? towardHigh : towardLow;
      const oppositeCompeting =
        eligible.has(opposite) && screenDistanceFor(opposite) <= acquirePx;
      if (!away || awayCss < breakAwayCss || !oppositeCompeting) {
        return { correction: -distance, edge: previous };
      }
    }
  }
  let acquireEdges = distances.filter(([edge]) => eligible.has(edge));
  // Ignore the edge behind the pointer so opposite corridors cannot yank.
  // Release finalize must pass the gesture's last significant motion — pure 0
  // lets the closer opposite overhang steal near-full-bleed latches.
  if (motion < -motionEpsilon) {
    acquireEdges = acquireEdges.filter(([edge]) => edge !== towardHigh);
  } else if (motion > motionEpsilon) {
    acquireEdges = acquireEdges.filter(([edge]) => edge !== towardLow);
  }
  const candidate = acquireEdges
    .map(([edge, distance], order) => ({
      edge,
      distance,
      order,
      screenDistance: Math.abs(distance) * screenScale,
    }))
    .filter(({ screenDistance }) => screenDistance <= acquirePx)
    .sort(
      (a, b) =>
        a.screenDistance - b.screenDistance || a.order - b.order,
    )[0];
  return candidate
    ? { correction: -candidate.distance, edge: candidate.edge }
    : { correction: 0, edge: null };
}

export function resolveImageEdgeSnap({
  bounds,
  doc,
  viewport,
  previous = emptyImageEdgeSnapState(),
  edges = ALL_IMAGE_CANVAS_EDGES,
  bypass = false,
  acquirePx = IMAGE_EDGE_SNAP_ACQUIRE_PX,
  releasePx = IMAGE_EDGE_SNAP_RELEASE_PX,
  motion = { dx: 0, dy: 0 },
  cssScale = null,
  zoomFallback = null,
}: {
  bounds: { left: number; top: number; width: number; height: number };
  doc: DocSize;
  viewport: readonly number[] | null | undefined;
  previous?: ImageEdgeSnapState;
  edges?: readonly ImageCanvasEdge[];
  bypass?: boolean;
  acquirePx?: number;
  releasePx?: number;
  /** Scene-space delta of bounds.left / bounds.top since the previous sample. */
  motion?: { dx?: number; dy?: number };
  /**
   * CSS px per Fabric canvas/bitmap unit (getBoundingClientRect / getWidth).
   * Combined with viewportTransform for visual CSS thresholds.
   */
  cssScale?: { x?: number; y?: number } | null;
  /** Fit/zoom bookkeeping when VPT is stale/identity (see screen scale helper). */
  zoomFallback?: number | null;
}): ImageEdgeSnapResult {
  if (bypass) {
    return { dx: 0, dy: 0, state: emptyImageEdgeSnapState() };
  }
  const eligible = new Set(edges);
  const scale = imageEdgeSnapScreenScales(viewport, cssScale, zoomFallback);
  const acquire = Math.max(0, acquirePx);
  const release = Math.max(acquire, releasePx);
  const horizontal = resolveSnapAxis<ImageHorizontalSnapEdge>(
    [
      ["left", bounds.left],
      ["right", bounds.left + bounds.width - doc.width],
    ],
    eligible,
    previous.x,
    scale.x,
    acquire,
    release,
    motion.dx ?? 0,
    "left",
    "right",
  );
  const vertical = resolveSnapAxis<ImageVerticalSnapEdge>(
    [
      ["top", bounds.top],
      ["bottom", bounds.top + bounds.height - doc.height],
    ],
    eligible,
    previous.y,
    scale.y,
    acquire,
    release,
    motion.dy ?? 0,
    "top",
    "bottom",
  );
  return {
    dx: horizontal.correction,
    dy: vertical.correction,
    state: { x: horizontal.edge, y: vertical.edge },
  };
}

/**
 * Resize the manipulated edge toward its snap correction. The controller keeps
 * Fabric's opposite transform origin fixed while applying these multipliers.
 */
export function imageEdgeScaleMultipliers(
  bounds: { width: number; height: number },
  snapped: ImageEdgeSnapResult,
  lockAspectRatio = false,
): ImageEdgeScaleMultipliers {
  const width = Math.max(0.0001, Math.abs(bounds.width));
  const height = Math.max(0.0001, Math.abs(bounds.height));
  const widthDelta =
    snapped.state.x === "left"
      ? -snapped.dx
      : snapped.state.x === "right"
        ? snapped.dx
        : 0;
  const heightDelta =
    snapped.state.y === "top"
      ? -snapped.dy
      : snapped.state.y === "bottom"
        ? snapped.dy
        : 0;
  const multipliers = {
    x: Math.max(0.0001, width + widthDelta) / width,
    y: Math.max(0.0001, height + heightDelta) / height,
  };
  if (!lockAspectRatio) return multipliers;
  const uniform = snapped.state.x
    ? multipliers.x
    : snapped.state.y
      ? multipliers.y
      : 1;
  return { x: uniform, y: uniform };
}

export function imageEdgeScaleAnchorCorrection(
  before: { left: number; top: number; width: number; height: number },
  resized: { left: number; top: number; width: number; height: number },
  state: ImageEdgeSnapState,
): { dx: number; dy: number } {
  return {
    dx:
      state.x === "left"
        ? before.left + before.width - (resized.left + resized.width)
        : state.x === "right"
          ? before.left - resized.left
          : 0,
    dy:
      state.y === "top"
        ? before.top + before.height - (resized.top + resized.height)
        : state.y === "bottom"
          ? before.top - resized.top
          : 0,
  };
}

export function captureSnapshot(
  canvas: Canvas,
  doc: DocSize,
  canvasBackground: string,
): EditorSnapshot {
  const json = canvas.toObject(SNAPSHOT_PROPS) as Record<string, unknown>;
  if (Array.isArray(json.objects)) {
    json.objects = json.objects.filter(
      (object) => roleOf(object as FabricObject) !== "crop",
    );
  }
  return {
    json,
    doc: { ...doc },
    canvasBackground,
  };
}

export function snapshotKey(snapshot: EditorSnapshot): string {
  return JSON.stringify(snapshot);
}

export function createDocBackground(
  fabric: FabricNS,
  doc: DocSize,
  color: string,
): Rect & EditorObject {
  const rect = new fabric.Rect({
    left: 0,
    top: 0,
    originX: "left",
    originY: "top",
    width: doc.width,
    height: doc.height,
    fill: color,
    strokeWidth: 0,
    selectable: false,
    evented: false,
    objectCaching: false,
  }) as Rect & EditorObject;
  rect.oceanleoId = makeId();
  rect.oceanleoRole = "docbg";
  rect.oceanleoKind = "rect";
  rect.oceanleoLocked = true;
  return rect;
}

export function updateDocBackground(
  canvas: Canvas,
  doc: DocSize,
  color: string,
): void {
  const background = canvas
    .getObjects()
    .find((object) => roleOf(object) === "docbg");
  if (!background) return;
  background.set({
    left: 0,
    top: 0,
    width: doc.width,
    height: doc.height,
    scaleX: 1,
    scaleY: 1,
    fill: color,
  });
  background.setCoords();
  canvas.moveObjectTo(background, 0);
}

export function prepareBackgroundImage(
  image: FabricImage,
  doc: DocSize,
): EditorObject {
  const target = image as EditorObject;
  setEditorObjectId(target, target.oceanleoId || makeId());
  target.oceanleoRole = undefined;
  target.oceanleoKind = "image";
  target.oceanleoImageFit = "fill";
  const scales = imageFitScales(image, doc, "fill");
  target.set({
    left: doc.width / 2,
    top: doc.height / 2,
    originX: "center",
    originY: "center",
    ...scales,
  });
  setLocked(target, false);
  target.setCoords();
  return target;
}

export function preparePlacedImage(
  image: FabricImage,
  doc: DocSize,
  offsetIndex: number,
): EditorObject {
  const maxWidth = doc.width * 0.62;
  const maxHeight = doc.height * 0.62;
  const scale = Math.min(
    1,
    maxWidth / Math.max(1, image.width),
    maxHeight / Math.max(1, image.height),
  );
  const nudge = (offsetIndex % 5) * 16;
  const target = image as EditorObject;
  setEditorObjectId(target, target.oceanleoId || makeId());
  target.oceanleoRole = undefined;
  target.oceanleoKind = "image";
  target.set({
    left: doc.width / 2 + nudge,
    top: doc.height / 2 + nudge,
    originX: "center",
    originY: "center",
    scaleX: scale,
    scaleY: scale,
  });
  setLocked(target, false);
  target.setCoords();
  return target;
}

export function resizeViewportToContainer(
  canvas: Canvas,
  container: HTMLDivElement | null,
): { width: number; height: number } {
  const width = Math.max(320, Math.floor(container?.clientWidth || 900));
  const height = Math.max(240, Math.floor(container?.clientHeight || 620));
  canvas.setDimensions({ width, height });
  return { width, height };
}

/**
 * Resize Fabric's bitmap while preserving the current viewport transform and
 * the scene point under the viewport center.  This keeps a user's zoom/pan
 * through side-panel animations without introducing independent x/y scaling.
 */
export function resizeViewportPreservingView(
  canvas: Canvas,
  container: HTMLDivElement | null,
): void {
  const previous = [...canvas.viewportTransform] as TMat2D;
  const oldWidth = Math.max(1, canvas.getWidth());
  const oldHeight = Math.max(1, canvas.getHeight());
  const [a, b, c, d, e, f] = previous;
  const determinant = a * d - b * c;
  const oldCenterX = oldWidth / 2;
  const oldCenterY = oldHeight / 2;
  let sceneCenterX = oldCenterX;
  let sceneCenterY = oldCenterY;
  if (Number.isFinite(determinant) && Math.abs(determinant) > 1e-8) {
    const viewX = oldCenterX - e;
    const viewY = oldCenterY - f;
    sceneCenterX = (d * viewX - c * viewY) / determinant;
    sceneCenterY = (-b * viewX + a * viewY) / determinant;
  }
  const nextSize = resizeViewportToContainer(canvas, container);
  canvas.setViewportTransform([
    a,
    b,
    c,
    d,
    nextSize.width / 2 - (a * sceneCenterX + c * sceneCenterY),
    nextSize.height / 2 - (b * sceneCenterX + d * sceneCenterY),
  ]);
  canvas.requestRenderAll();
}

export function fitViewport(
  canvas: Canvas,
  doc: DocSize,
  container: HTMLDivElement | null,
): number {
  const viewport = resizeViewportToContainer(canvas, container);
  const padding = 56;
  const zoom = Math.max(
    0.05,
    Math.min(
      8,
      (viewport.width - padding * 2) / Math.max(1, doc.width),
      (viewport.height - padding * 2) / Math.max(1, doc.height),
    ),
  );
  const left = (viewport.width - doc.width * zoom) / 2;
  const top = (viewport.height - doc.height * zoom) / 2;
  canvas.setViewportTransform([zoom, 0, 0, zoom, left, top]);
  canvas.requestRenderAll();
  return zoom;
}

export function zoomViewport(
  fabric: FabricNS,
  canvas: Canvas,
  doc: DocSize,
  zoom: number,
): number {
  const next = Math.max(0.05, Math.min(8, zoom));
  const center = new fabric.Point(canvas.width / 2, canvas.height / 2);
  canvas.zoomToPoint(center, next);
  canvas.requestRenderAll();
  return next;
}

export function viewportAt100(canvas: Canvas, doc: DocSize): number {
  const left = (canvas.width - doc.width) / 2;
  const top = (canvas.height - doc.height) / 2;
  canvas.setViewportTransform([1, 0, 0, 1, left, top]);
  canvas.requestRenderAll();
  return 1;
}

export function panViewport(canvas: Canvas, dx: number, dy: number): void {
  const next = [...canvas.viewportTransform] as TMat2D;
  next[4] += dx;
  next[5] += dy;
  canvas.setViewportTransform(next);
  canvas.requestRenderAll();
}

export function cropBounds(
  crop: FabricObject,
  doc: DocSize,
): { left: number; top: number; width: number; height: number } | null {
  const bounds = crop.getBoundingRect();
  const left = Math.max(0, Math.min(doc.width, bounds.left));
  const top = Math.max(0, Math.min(doc.height, bounds.top));
  const right = Math.max(0, Math.min(doc.width, bounds.left + bounds.width));
  const bottom = Math.max(0, Math.min(doc.height, bounds.top + bounds.height));
  const width = Math.round(right - left);
  const height = Math.round(bottom - top);
  if (width < 2 || height < 2) return null;
  return { left: Math.round(left), top: Math.round(top), width, height };
}

export function constrainCropToDoc(crop: FabricObject, doc: DocSize): void {
  constrainCropToRect(crop, { left: 0, top: 0, width: doc.width, height: doc.height });
}

export function constrainCropToRect(
  crop: FabricObject,
  host: { left: number; top: number; width: number; height: number },
): void {
  const bounds = crop.getBoundingRect();
  let dx = 0;
  let dy = 0;
  if (bounds.left < host.left) dx = host.left - bounds.left;
  if (bounds.top < host.top) dy = host.top - bounds.top;
  if (bounds.left + bounds.width > host.left + host.width) {
    dx = host.left + host.width - (bounds.left + bounds.width);
  }
  if (bounds.top + bounds.height > host.top + host.height) {
    dy = host.top + host.height - (bounds.top + bounds.height);
  }
  if (dx || dy) {
    crop.set({
      left: (crop.left ?? 0) + dx,
      top: (crop.top ?? 0) + dy,
    });
    crop.setCoords();
  }
}

export function constrainCropToObject(crop: FabricObject, host: FabricObject): void {
  const cropCenter = crop.getCenterPoint();
  const hostCenter = host.getCenterPoint();
  const radians = ((host.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = cropCenter.x - hostCenter.x;
  const dy = cropCenter.y - hostCenter.y;
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  const maxX = Math.max(
    0,
    (host.getScaledWidth() - crop.getScaledWidth()) / 2,
  );
  const maxY = Math.max(
    0,
    (host.getScaledHeight() - crop.getScaledHeight()) / 2,
  );
  const nextX = Math.max(-maxX, Math.min(maxX, localX));
  const nextY = Math.max(-maxY, Math.min(maxY, localY));
  if (nextX === localX && nextY === localY) return;
  crop.set({
    left: hostCenter.x + nextX * cos - nextY * sin,
    top: hostCenter.y + nextX * sin + nextY * cos,
  });
  crop.setCoords();
}

/** Source-pixel crop for a selected Fabric image. Does not resize the document. */
export function fabricImageCropPatch(
  image: {
    getBoundingRect(): { left: number; top: number; width: number; height: number };
    getCenterPoint?(): { x: number; y: number };
    angle?: number | null;
    flipX?: boolean;
    flipY?: boolean;
    width?: number;
    height?: number;
    scaleX?: number | null;
    scaleY?: number | null;
    cropX?: number | null;
    cropY?: number | null;
  },
  region: {
    left: number;
    top: number;
    width: number;
    height: number;
    getCenterPoint?(): { x: number; y: number };
    angle?: number | null;
    scaleX?: number | null;
    scaleY?: number | null;
  },
): {
  cropX: number;
  cropY: number;
  width: number;
  height: number;
  originX: "center";
  originY: "center";
  left: number;
  top: number;
} | null {
  const imgRect = image.getBoundingRect();
  const scaleX = Math.max(0.0001, Math.abs(image.scaleX || 1));
  const scaleY = Math.max(0.0001, Math.abs(image.scaleY || 1));
  const imageCenter = image.getCenterPoint?.() ?? {
    x: imgRect.left + imgRect.width / 2,
    y: imgRect.top + imgRect.height / 2,
  };
  const imageAngle = ((image.angle ?? 0) * Math.PI) / 180;
  const regionCenter = region.getCenterPoint?.() ?? {
    x: region.left + region.width / 2,
    y: region.top + region.height / 2,
  };
  const regionScaleX = Math.max(0.0001, Math.abs(region.scaleX || 1));
  const regionScaleY = Math.max(0.0001, Math.abs(region.scaleY || 1));
  const regionAngle = ((region.angle ?? 0) * Math.PI) / 180;
  const regionCos = Math.cos(regionAngle);
  const regionSin = Math.sin(regionAngle);
  const imageCos = Math.cos(imageAngle);
  const imageSin = Math.sin(imageAngle);
  const halfWidth = (region.width * regionScaleX) / 2;
  const halfHeight = (region.height * regionScaleY) / 2;
  const localCorners = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ].map(([cornerX, cornerY]) => {
    const worldX = cornerX * regionCos - cornerY * regionSin;
    const worldY = cornerX * regionSin + cornerY * regionCos;
    const dx = regionCenter.x + worldX - imageCenter.x;
    const dy = regionCenter.y + worldY - imageCenter.y;
    return {
      x: dx * imageCos + dy * imageSin,
      y: -dx * imageSin + dy * imageCos,
    };
  });
  const imageWidth = image.width ?? imgRect.width / scaleX;
  const imageHeight = image.height ?? imgRect.height / scaleY;
  const visibleWidth = imageWidth * scaleX;
  const visibleHeight = imageHeight * scaleY;
  const localLeft = Math.max(
    -visibleWidth / 2,
    Math.min(...localCorners.map((point) => point.x)),
  );
  const localRight = Math.min(
    visibleWidth / 2,
    Math.max(...localCorners.map((point) => point.x)),
  );
  const localTop = Math.max(
    -visibleHeight / 2,
    Math.min(...localCorners.map((point) => point.y)),
  );
  const localBottom = Math.min(
    visibleHeight / 2,
    Math.max(...localCorners.map((point) => point.y)),
  );
  const width = localRight - localLeft;
  const height = localBottom - localTop;
  if (width < 2 || height < 2) return null;
  const sourceLeft = localLeft + visibleWidth / 2;
  const sourceTop = localTop + visibleHeight / 2;
  const sourceWidth = width / scaleX;
  const sourceHeight = height / scaleY;
  const sourceX = image.flipX ? imageWidth - sourceLeft / scaleX - sourceWidth : sourceLeft / scaleX;
  const sourceY = image.flipY ? imageHeight - sourceTop / scaleY - sourceHeight : sourceTop / scaleY;
  const centerLocalX = (localLeft + localRight) / 2;
  const centerLocalY = (localTop + localBottom) / 2;
  return {
    cropX: (image.cropX || 0) + sourceX,
    cropY: (image.cropY || 0) + sourceY,
    width: sourceWidth,
    height: sourceHeight,
    originX: "center",
    originY: "center",
    left: imageCenter.x + centerLocalX * imageCos - centerLocalY * imageSin,
    top: imageCenter.y + centerLocalX * imageSin + centerLocalY * imageCos,
  };
}

export function applyFabricImageCrop(
  image: FabricImage,
  region: FabricObject,
): boolean {
  const patch = fabricImageCropPatch(image, region);
  if (!patch) return false;
  image.set(patch);
  image.setCoords();
  return true;
}

export function removeEditableObjects(canvas: Canvas): void {
  const objects = canvas.getObjects();
  if (objects.length) canvas.remove(...objects);
}

export function ensureLayerOrder(canvas: Canvas): void {
  const docBackground = canvas
    .getObjects()
    .find((object) => roleOf(object) === "docbg");
  if (docBackground) canvas.moveObjectTo(docBackground, 0);
  const crop = canvas
    .getObjects()
    .find((object) => roleOf(object) === "crop");
  if (crop) canvas.bringObjectToFront(crop);
}

export function restoreLockFlags(canvas: Canvas): void {
  canvas.getObjects().forEach((object) => {
    const target = object as EditorObject;
    if (target.oceanleoRole === "docbg") {
      target.set({
        selectable: false,
        evented: false,
        hasControls: false,
        hoverCursor: "default",
      });
      return;
    }
    if (
      target.oceanleoRole === "background" &&
      target.oceanleoKind === "image"
    ) {
      target.oceanleoRole = undefined;
      target.oceanleoImageFit ||= "fill";
      setLocked(target, target.oceanleoLocked === true);
      return;
    }
    if (target.oceanleoLocked != null) {
      setLocked(target, target.oceanleoLocked);
    }
  });
}

export function objectIsEditable(object: FabricObject | undefined): object is EditorObject {
  if (!object) return false;
  const role = roleOf(object);
  return role !== "docbg" && role !== "crop";
}

/** Unlocked non-background image layers available for magnetic snap / V3 selection. */
export function isUnlockedImageLayerEntry(layer: {
  kind: string;
  locked: boolean;
  isBackground: boolean;
  visible?: boolean;
}): boolean {
  if (layer.locked || layer.isBackground) return false;
  if (layer.visible === false) return false;
  return layer.kind === "image" || layer.kind === "background";
}

export function countUnlockedImageLayers(
  layers: readonly {
    kind: string;
    locked: boolean;
    isBackground: boolean;
    visible?: boolean;
  }[],
): number {
  return layers.filter(isUnlockedImageLayerEntry).length;
}

export function preferredUnlockedImageLayerId(
  layers: readonly {
    id: string;
    kind: string;
    locked: boolean;
    isBackground: boolean;
    visible?: boolean;
  }[],
): string | null {
  // readView emits topmost first (reversed canvas order).
  const hit = layers.find(isUnlockedImageLayerEntry);
  return hit?.id ?? null;
}

export function preferUnlockedImageObject(
  canvas: Canvas,
  isFabricImage: (object: FabricObject) => boolean,
): EditorObject | null {
  const objects = canvas.getObjects();
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index];
    if (!objectIsEditable(object)) continue;
    if (roleOf(object) === "background") continue;
    const editor = object as EditorObject;
    if (editor.oceanleoLocked === true) continue;
    if (object.visible === false) continue;
    if (!isFabricImage(object) && editor.oceanleoKind !== "image") continue;
    return editor;
  }
  return null;
}
