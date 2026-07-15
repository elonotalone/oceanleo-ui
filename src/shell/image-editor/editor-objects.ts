"use client";

// ============================================================================
// @oceanleo/ui — fabric 对象化图片编辑器：对象层纯助手
// ----------------------------------------------------------------------------
// 本文件不在模块顶层 import fabric 运行时（SSR 安全）：所有需要 fabric 类的
// 函数都显式接收 `fabric: FabricNS`（hook 在 useEffect 里 await import("fabric")
// 后传进来）。类型 import 会在编译期擦除，不产生运行时依赖。
// ============================================================================

import type {
  Canvas,
  FabricImage,
  FabricObject,
  Group,
  Shadow,
  TMat2D,
} from "fabric";
import {
  INITIAL_FILTERS,
  type DocSize,
  type ExportFormat,
  type FilterSettings,
  type LayerKind,
  type SelectedSnapshot,
  type ShadowSettings,
  type ShapeKind,
  type TextSettings,
} from "./types";

export type FabricNS = typeof import("fabric");

export type EditorRole = "background" | "docbg" | "crop";

export interface EditorObjectProps {
  oceanleoId?: string;
  oceanleoRole?: EditorRole;
  oceanleoKind?: string;
  oceanleoLocked?: boolean;
  oceanleoRadius?: number;
  oceanleoFilters?: FilterSettings;
}

export type EditorObject = FabricObject & EditorObjectProps;
type ImageFilter = FabricImage["filters"][number];

/** 序列化（undo 快照）时随对象保存的自定义/行为属性。 */
export const SNAPSHOT_PROPS = [
  "oceanleoId",
  "oceanleoRole",
  "oceanleoKind",
  "oceanleoLocked",
  "oceanleoRadius",
  "oceanleoFilters",
  "selectable",
  "evented",
  "lockMovementX",
  "lockMovementY",
  "hasControls",
  "hoverCursor",
];

export function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function roleOf(obj: FabricObject): EditorRole | undefined {
  return (obj as EditorObject).oceanleoRole;
}

export function kindOf(fabric: FabricNS, obj: FabricObject): LayerKind {
  if (roleOf(obj) === "background") return "background";
  if (obj instanceof fabric.FabricImage) return "image";
  if (obj instanceof fabric.IText) return "text";
  if (obj instanceof fabric.Rect) return "rect";
  if (obj instanceof fabric.Circle) return "circle";
  if (obj instanceof fabric.Ellipse) return "ellipse";
  if (obj instanceof fabric.Line) return "line";
  if (obj instanceof fabric.Group) {
    return (obj as EditorObject).oceanleoKind === "arrow" ? "arrow" : "shape";
  }
  if (obj instanceof fabric.Path) return "path";
  return "shape";
}

export function findByRole(canvas: Canvas, role: EditorRole): EditorObject | null {
  return (
    (canvas.getObjects().find((obj) => roleOf(obj) === role) as
      | EditorObject
      | undefined) ?? null
  );
}

export function findById(canvas: Canvas, id: string): EditorObject | null {
  return (
    (canvas
      .getObjects()
      .find((obj) => (obj as EditorObject).oceanleoId === id) as
      | EditorObject
      | undefined) ?? null
  );
}

/** 把对象原点归一到中心（保持视觉位置不变），使旋转/翻转围绕中心。 */
export function centerOrigin(obj: FabricObject): void {
  const center = obj.getCenterPoint();
  obj.set({ originX: "center", originY: "center" });
  obj.setPositionByOrigin(center, "center", "center");
  obj.setCoords();
}

export function tagObject(obj: FabricObject, kind?: string): EditorObject {
  const target = obj as EditorObject;
  if (!target.oceanleoId) target.oceanleoId = makeId();
  if (kind) target.oceanleoKind = kind;
  return target;
}

export function setLocked(obj: EditorObject, locked: boolean): void {
  obj.oceanleoLocked = locked;
  obj.set({
    selectable: !locked,
    evented: !locked,
    lockMovementX: locked,
    lockMovementY: locked,
    hasControls: !locked,
    hoverCursor: locked ? "not-allowed" : "move",
  });
  obj.setCoords();
}

// ---------------------------------------------------------------------------
// 滤镜
// ---------------------------------------------------------------------------

export function buildFilters(
  fabric: FabricNS,
  settings: FilterSettings,
): ImageFilter[] {
  const list: ImageFilter[] = [];
  const push = (filter: ImageFilter) => list.push(filter);
  if (settings.brightness !== 0) {
    push(new fabric.filters.Brightness({ brightness: settings.brightness / 100 }));
  }
  if (settings.contrast !== 0) {
    push(new fabric.filters.Contrast({ contrast: settings.contrast / 100 }));
  }
  if (settings.saturation !== 0) {
    push(new fabric.filters.Saturation({ saturation: settings.saturation / 100 }));
  }
  if (settings.blur > 0) {
    push(new fabric.filters.Blur({ blur: settings.blur / 100 }));
  }
  if (settings.pixelate >= 2) {
    push(new fabric.filters.Pixelate({ blocksize: Math.round(settings.pixelate) }));
  }
  if (settings.grayscale) push(new fabric.filters.Grayscale());
  if (settings.sepia) push(new fabric.filters.Sepia());
  if (settings.invert) push(new fabric.filters.Invert());
  return list;
}

export function readFilterSettings(obj: FabricObject): FilterSettings {
  const stored = (obj as EditorObject).oceanleoFilters;
  return stored ? { ...stored } : { ...INITIAL_FILTERS };
}

export function applyFilterSettings(
  fabric: FabricNS,
  image: FabricImage,
  settings: FilterSettings,
): void {
  (image as EditorObject).oceanleoFilters = { ...settings };
  image.filters = buildFilters(fabric, settings);
  image.applyFilters();
}

// ---------------------------------------------------------------------------
// 阴影 / 圆角
// ---------------------------------------------------------------------------

export const DEFAULT_SHADOW: ShadowSettings = {
  enabled: false,
  color: "rgba(15,23,42,0.35)",
  blur: 18,
  offsetX: 0,
  offsetY: 10,
};

export function readShadow(obj: FabricObject): ShadowSettings {
  const shadow = obj.shadow as Shadow | null | undefined;
  if (!shadow) return { ...DEFAULT_SHADOW };
  return {
    enabled: true,
    color: shadow.color || DEFAULT_SHADOW.color,
    blur: shadow.blur ?? DEFAULT_SHADOW.blur,
    offsetX: shadow.offsetX ?? 0,
    offsetY: shadow.offsetY ?? 0,
  };
}

export function applyShadow(
  fabric: FabricNS,
  obj: FabricObject,
  settings: ShadowSettings,
): void {
  obj.shadow = settings.enabled
    ? new fabric.Shadow({
        color: settings.color,
        blur: settings.blur,
        offsetX: settings.offsetX,
        offsetY: settings.offsetY,
      })
    : null;
  obj.set("dirty", true);
}

/** 图片对象圆角：clipPath = 以图片中心为原点的圆角矩形（对象本地坐标）。 */
export function applyImageRadius(
  fabric: FabricNS,
  image: FabricImage,
  px: number,
): void {
  const width = image.width;
  const height = image.height;
  const radius = Math.max(0, Math.min(px, Math.min(width, height) / 2));
  if (radius <= 0) {
    image.clipPath = undefined;
  } else {
    image.clipPath = new fabric.Rect({
      left: -width / 2,
      top: -height / 2,
      width,
      height,
      rx: radius,
      ry: radius,
    });
  }
  (image as EditorObject).oceanleoRadius = Math.round(px);
  image.set("dirty", true);
}

// ---------------------------------------------------------------------------
// 选中对象快照（喂给左栏样式面板）
// ---------------------------------------------------------------------------

function normalizeAngle(angle: number): number {
  return Math.round(((angle % 360) + 360) % 360);
}

export function buildSelectedSnapshot(
  fabric: FabricNS,
  obj: FabricObject,
): SelectedSnapshot {
  const target = obj as EditorObject;
  const kind = kindOf(fabric, obj);
  let fill = typeof obj.fill === "string" ? obj.fill : "";
  let stroke = typeof obj.stroke === "string" ? obj.stroke : "";
  let strokeWidth = obj.strokeWidth ?? 0;
  if (kind === "arrow" && obj instanceof fabric.Group) {
    const line = obj
      .getObjects()
      .find((child) => child instanceof fabric.Line);
    if (line) {
      stroke = typeof line.stroke === "string" ? line.stroke : "";
      fill = stroke;
      strokeWidth = line.strokeWidth ?? 0;
    }
  } else if (kind === "line") {
    fill = stroke;
  }
  let text: TextSettings | null = null;
  if (obj instanceof fabric.IText) {
    const weight = obj.fontWeight;
    const align = obj.textAlign;
    text = {
      value: String(obj.text || "").slice(0, 2_000),
      fontSize: Math.round(obj.fontSize),
      fill: typeof obj.fill === "string" ? obj.fill : "#1c1917",
      backgroundColor: obj.backgroundColor || "",
      bold: weight === "bold" || Number(weight) >= 600,
      italic: obj.fontStyle === "italic",
      align: align === "center" || align === "right" ? align : "left",
      stroke: typeof obj.stroke === "string" ? obj.stroke : "",
      strokeWidth: obj.strokeWidth ?? 0,
    };
  }
  const isImage = obj instanceof fabric.FabricImage;
  return {
    id: target.oceanleoId ?? "",
    kind,
    isBackground: roleOf(obj) === "background",
    opacity: Math.round((obj.opacity ?? 1) * 100),
    angle: normalizeAngle(obj.angle ?? 0),
    flipX: !!obj.flipX,
    flipY: !!obj.flipY,
    fill,
    stroke,
    strokeWidth,
    shadow: readShadow(obj),
    radius: isImage ? (target.oceanleoRadius ?? 0) : null,
    text,
  };
}

// ---------------------------------------------------------------------------
// 对象工厂
// ---------------------------------------------------------------------------

const SHAPE_FILL = "#4f46e5";
const INK = "#1c1917";

export function createTextbox(
  fabric: FabricNS,
  doc: DocSize,
  text: string,
  offsetIndex: number,
): EditorObject {
  const nudge = (offsetIndex % 5) * 16;
  const box = new fabric.Textbox(text, {
    width: Math.max(120, doc.width * 0.42),
    fontSize: Math.round(Math.min(96, Math.max(18, doc.width * 0.05))),
    fill: INK,
    fontFamily: "sans-serif",
    textAlign: "center",
    originX: "center",
    originY: "center",
    left: doc.width / 2 + nudge,
    top: doc.height / 2 + nudge,
  });
  return tagObject(box);
}

export function createShape(
  fabric: FabricNS,
  kind: ShapeKind,
  doc: DocSize,
  offsetIndex: number,
): EditorObject {
  const minSide = Math.min(doc.width, doc.height);
  const nudge = (offsetIndex % 5) * 16;
  const centerX = doc.width / 2 + nudge;
  const centerY = doc.height / 2 + nudge;
  const common = {
    originX: "center" as const,
    originY: "center" as const,
    left: centerX,
    top: centerY,
  };
  let obj: FabricObject;
  if (kind === "rect") {
    obj = new fabric.Rect({
      ...common,
      width: doc.width * 0.3,
      height: doc.height * 0.22,
      fill: SHAPE_FILL,
    });
  } else if (kind === "circle") {
    obj = new fabric.Circle({ ...common, radius: minSide * 0.14, fill: SHAPE_FILL });
  } else if (kind === "ellipse") {
    obj = new fabric.Ellipse({
      ...common,
      rx: doc.width * 0.16,
      ry: doc.height * 0.1,
      fill: SHAPE_FILL,
    });
  } else if (kind === "line") {
    obj = new fabric.Line([0, 0, Math.max(80, doc.width * 0.28), 0], {
      ...common,
      stroke: INK,
      strokeWidth: Math.max(3, Math.round(minSide * 0.008)),
      strokeLineCap: "round",
    });
  } else {
    const length = Math.max(90, doc.width * 0.24);
    const strokeWidth = Math.max(4, Math.round(minSide * 0.009));
    const head = strokeWidth * 4.5;
    const line = new fabric.Line([0, 0, length, 0], {
      stroke: INK,
      strokeWidth,
      strokeLineCap: "round",
    });
    const tip = new fabric.Triangle({
      left: length + head * 0.4,
      top: 0,
      originX: "center",
      originY: "center",
      angle: 90,
      width: head,
      height: head,
      fill: INK,
    });
    obj = new fabric.Group([line, tip], common);
    tagObject(obj, "arrow");
  }
  const tagged = tagObject(obj, kind);
  centerOrigin(tagged);
  return tagged;
}

export function recolorArrow(fabric: FabricNS, group: Group, color: string): void {
  group.getObjects().forEach((child) => {
    if (child instanceof fabric.Line) child.set({ stroke: color });
    else child.set({ fill: color });
  });
  group.set("dirty", true);
}

export function setArrowStrokeWidth(
  fabric: FabricNS,
  group: Group,
  width: number,
): void {
  group.getObjects().forEach((child) => {
    if (child instanceof fabric.Line) child.set({ strokeWidth: width });
  });
  group.set("dirty", true);
}

export async function loadImageObject(
  fabric: FabricNS,
  url: string,
  signal?: AbortSignal,
): Promise<FabricImage> {
  return fabric.FabricImage.fromURL(url, {
    crossOrigin: "anonymous",
    signal,
  });
}

// ---------------------------------------------------------------------------
// 导出（先把视口归零，确保导出的是文档区域而不是当前缩放视图）
// ---------------------------------------------------------------------------

function withIdentityViewport<T>(canvas: Canvas, run: () => T): T {
  const previous = [...canvas.viewportTransform] as TMat2D;
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  try {
    return run();
  } finally {
    canvas.setViewportTransform(previous);
    canvas.requestRenderAll();
  }
}

export async function exportDocBlob(
  canvas: Canvas,
  doc: DocSize,
  options: { format: ExportFormat; quality: number; multiplier: number },
): Promise<Blob | null> {
  return withIdentityViewport(canvas, () =>
    canvas.toBlob({
      left: 0,
      top: 0,
      width: doc.width,
      height: doc.height,
      multiplier: options.multiplier,
      format: options.format,
      quality: options.quality,
    }),
  );
}

export function exportRegionDataUrl(
  canvas: Canvas,
  region: { left: number; top: number; width: number; height: number },
): string {
  return withIdentityViewport(canvas, () =>
    canvas
      .toCanvasElement(1, {
        left: region.left,
        top: region.top,
        width: region.width,
        height: region.height,
      })
      .toDataURL("image/png"),
  );
}
