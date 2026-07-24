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
  viewport: readonly number[],
): { x: number; y: number } {
  const x = Math.hypot(viewport[0] ?? 1, viewport[1] ?? 0);
  const y = Math.hypot(viewport[2] ?? 0, viewport[3] ?? 1);
  return {
    x: Number.isFinite(x) && x > 0 ? x : 1,
    y: Number.isFinite(y) && y > 0 ? y : 1,
  };
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

function resolveSnapAxis<T extends ImageCanvasEdge>(
  distances: ReadonlyArray<readonly [T, number]>,
  eligible: ReadonlySet<ImageCanvasEdge>,
  previous: T | null,
  screenScale: number,
  acquirePx: number,
  releasePx: number,
): { correction: number; edge: T | null } {
  const candidateDistance = (edge: T) =>
    distances.find(([candidate]) => candidate === edge)?.[1];
  if (previous && eligible.has(previous)) {
    const distance = candidateDistance(previous);
    if (
      distance != null &&
      Math.abs(distance) * screenScale <= releasePx
    ) {
      return { correction: -distance, edge: previous };
    }
  }
  const candidate = distances
    .filter(([edge]) => eligible.has(edge))
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
}: {
  bounds: { left: number; top: number; width: number; height: number };
  doc: DocSize;
  viewport: readonly number[];
  previous?: ImageEdgeSnapState;
  edges?: readonly ImageCanvasEdge[];
  bypass?: boolean;
  acquirePx?: number;
  releasePx?: number;
}): ImageEdgeSnapResult {
  if (bypass) {
    return { dx: 0, dy: 0, state: emptyImageEdgeSnapState() };
  }
  const eligible = new Set(edges);
  const scale = viewportAxisScales(viewport);
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
  return {
    json: canvas.toObject(SNAPSHOT_PROPS) as Record<string, unknown>,
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
  target.oceanleoLocked = false;
  target.set({
    left: doc.width / 2 + nudge,
    top: doc.height / 2 + nudge,
    originX: "center",
    originY: "center",
    scaleX: scale,
    scaleY: scale,
    selectable: true,
    evented: true,
  });
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
  const bounds = crop.getBoundingRect();
  let dx = 0;
  let dy = 0;
  if (bounds.left < 0) dx = -bounds.left;
  if (bounds.top < 0) dy = -bounds.top;
  if (bounds.left + bounds.width > doc.width) {
    dx = doc.width - (bounds.left + bounds.width);
  }
  if (bounds.top + bounds.height > doc.height) {
    dy = doc.height - (bounds.top + bounds.height);
  }
  if (dx || dy) {
    crop.set({
      left: (crop.left ?? 0) + dx,
      top: (crop.top ?? 0) + dy,
    });
    crop.setCoords();
  }
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
