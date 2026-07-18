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
  type ImageFitMode,
  type LayerKind,
  type SelectedSnapshot,
  type ShadowSettings,
  type ShapeKind,
  type TableSettings,
  type TextPreset,
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
  oceanleoImageFit?: ImageFitMode;
  oceanleoTableRows?: number;
  oceanleoTableColumns?: number;
  oceanleoTableRow?: number;
  oceanleoTableColumn?: number;
  oceanleoTablePart?: "cell" | "text";
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
  "oceanleoImageFit",
  "oceanleoTableRows",
  "oceanleoTableColumns",
  "oceanleoTableRow",
  "oceanleoTableColumn",
  "oceanleoTablePart",
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
  const declared = (obj as EditorObject).oceanleoKind;
  if (
    declared === "signature" ||
    declared === "rounded-rect" ||
    declared === "triangle" ||
    declared === "diamond" ||
    declared === "hexagon" ||
    declared === "star" ||
    declared === "heart" ||
    declared === "dashed-line" ||
    declared === "curve" ||
    declared === "elbow-arrow" ||
    declared === "double-arrow"
  ) {
    return declared;
  }
  if (obj instanceof fabric.FabricImage) return "image";
  if (obj instanceof fabric.IText) return "text";
  if (obj instanceof fabric.Rect) return "rect";
  if (obj instanceof fabric.Circle) return "circle";
  if (obj instanceof fabric.Ellipse) return "ellipse";
  if (obj instanceof fabric.Line) return "line";
  if (obj instanceof fabric.Group) {
    if (declared === "arrow" || declared === "note" || declared === "table") {
      return declared;
    }
    return "shape";
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
  if (
    (kind === "arrow" ||
      kind === "elbow-arrow" ||
      kind === "double-arrow") &&
    obj instanceof fabric.Group
  ) {
    const line = obj
      .getObjects()
      .find(
        (child) =>
          child instanceof fabric.Line || child instanceof fabric.Path,
      );
    if (line) {
      stroke = typeof line.stroke === "string" ? line.stroke : "";
      fill = stroke;
      strokeWidth = line.strokeWidth ?? 0;
    }
  } else if (
    kind === "line" ||
    kind === "dashed-line" ||
    kind === "curve"
  ) {
    fill = stroke;
  }
  let text: TextSettings | null = null;
  if (obj instanceof fabric.IText) {
    const weight = obj.fontWeight;
    const align = obj.textAlign;
    text = {
      value: String(obj.text || "").slice(0, 2_000),
      fontFamily: obj.fontFamily || "sans-serif",
      fontSize: Math.round(obj.fontSize),
      fill: typeof obj.fill === "string" ? obj.fill : "#1c1917",
      backgroundColor: obj.backgroundColor || "",
      bold: weight === "bold" || Number(weight) >= 600,
      italic: obj.fontStyle === "italic",
      underline: obj.underline === true,
      linethrough: obj.linethrough === true,
      lineHeight: obj.lineHeight || 1.16,
      charSpacing: obj.charSpacing || 0,
      align: align === "center" || align === "right" ? align : "left",
      stroke: typeof obj.stroke === "string" ? obj.stroke : "",
      strokeWidth: obj.strokeWidth ?? 0,
    };
  }
  const isImage = obj instanceof fabric.FabricImage;
  const tableStyle: TableSettings = {
    headerFill: "#f1f3f9",
    bodyFill: "#ffffff",
    textColor: "#20242c",
    borderColor: "#8b93a7",
    borderWidth: 1,
  };
  if (kind === "table" && obj instanceof fabric.Group) {
    for (const child of obj.getObjects()) {
      const tagged = child as EditorObject;
      if (tagged.oceanleoTablePart === "cell") {
        const childFill =
          typeof child.fill === "string" ? child.fill : tableStyle.bodyFill;
        if (tagged.oceanleoTableRow === 0) tableStyle.headerFill = childFill;
        else tableStyle.bodyFill = childFill;
        if (typeof child.stroke === "string") {
          tableStyle.borderColor = child.stroke;
        }
        tableStyle.borderWidth = child.strokeWidth ?? tableStyle.borderWidth;
      } else if (
        tagged.oceanleoTablePart === "text" &&
        typeof child.fill === "string"
      ) {
        tableStyle.textColor = child.fill;
      }
    }
  }
  return {
    id: target.oceanleoId ?? "",
    kind,
    isBackground: roleOf(obj) === "background",
    opacity: Math.round((obj.opacity ?? 1) * 100),
    angle: normalizeAngle(obj.angle ?? 0),
    flipX: !!obj.flipX,
    flipY: !!obj.flipY,
    x: Math.round(obj.getCenterPoint().x),
    y: Math.round(obj.getCenterPoint().y),
    width: Math.round(obj.getScaledWidth()),
    height: Math.round(obj.getScaledHeight()),
    locked: target.oceanleoLocked === true,
    imageFit: isImage ? target.oceanleoImageFit || null : null,
    fill,
    stroke,
    strokeWidth,
    shadow: readShadow(obj),
    radius: isImage ? (target.oceanleoRadius ?? 0) : null,
    text,
    table:
      kind === "table"
        ? {
            rows: Math.max(1, target.oceanleoTableRows || 1),
            columns: Math.max(1, target.oceanleoTableColumns || 1),
            style: tableStyle,
          }
        : null,
  };
}

// ---------------------------------------------------------------------------
// 对象工厂
// ---------------------------------------------------------------------------

const SHAPE_FILL = "#6d5dfc";
const INK = "#1c1917";

export function createTextbox(
  fabric: FabricNS,
  doc: DocSize,
  text: string,
  offsetIndex: number,
  preset: TextPreset = "body",
): EditorObject {
  const nudge = (offsetIndex % 5) * 16;
  const fontSize =
    preset === "heading"
      ? Math.round(Math.min(128, Math.max(34, doc.width * 0.075)))
      : preset === "subheading"
        ? Math.round(Math.min(86, Math.max(26, doc.width * 0.052)))
        : Math.round(Math.min(56, Math.max(18, doc.width * 0.034)));
  const box = new fabric.Textbox(text, {
    width: Math.max(160, doc.width * (preset === "body" ? 0.46 : 0.62)),
    fontSize,
    fontWeight: preset === "heading" ? "bold" : "normal",
    fill: INK,
    fontFamily: "sans-serif",
    textAlign: preset === "body" ? "left" : "center",
    originX: "center",
    originY: "center",
    left: doc.width / 2 + nudge,
    top: doc.height / 2 + nudge,
  });
  return tagObject(box);
}

export function createStickyNote(
  fabric: FabricNS,
  doc: DocSize,
  offsetIndex: number,
  color = "#ffe36e",
): EditorObject {
  const width = Math.max(180, doc.width * 0.28);
  const height = Math.max(150, doc.height * 0.24);
  const background = new fabric.Rect({
    width,
    height,
    originX: "center",
    originY: "center",
    fill: color,
    rx: Math.max(14, width * 0.06),
    ry: Math.max(14, width * 0.06),
    shadow: new fabric.Shadow({
      color: "rgba(15,23,42,.16)",
      blur: 18,
      offsetX: 0,
      offsetY: 8,
    }),
  });
  const text = new fabric.Textbox("双击编辑便签", {
    width: width * 0.74,
    originX: "center",
    originY: "center",
    fontFamily: "Noto Sans SC, sans-serif",
    fontSize: Math.max(18, Math.round(width * 0.09)),
    fill: "#3f3420",
    textAlign: "center",
    selectable: true,
    evented: true,
  });
  background.set({ selectable: false, evented: false });
  const nudge = (offsetIndex % 5) * 16;
  return tagObject(
    new fabric.Group([background, text], {
      left: doc.width / 2 + nudge,
      top: doc.height / 2 + nudge,
      originX: "center",
      originY: "center",
      interactive: true,
      subTargetCheck: true,
    }),
    "note",
  );
}

export function createSignatureText(
  fabric: FabricNS,
  doc: DocSize,
  offsetIndex: number,
  text = "签名",
  color = "#18212f",
): EditorObject {
  const nudge = (offsetIndex % 5) * 16;
  return tagObject(
    new fabric.IText(text.slice(0, 120) || "签名", {
      left: doc.width / 2 + nudge,
      top: doc.height / 2 + nudge,
      originX: "center",
      originY: "center",
      fontFamily: "Segoe Script, Brush Script MT, cursive",
      fontStyle: "italic",
      fontSize: Math.round(Math.min(120, Math.max(42, doc.width * 0.08))),
      fill: color,
    }),
    "signature",
  );
}

export function createTable(
  fabric: FabricNS,
  doc: DocSize,
  offsetIndex: number,
  rows = 3,
  columns = 3,
  values: string[][] = [],
  style: Partial<TableSettings> = {},
): EditorObject {
  const safeRows = Math.min(20, Math.max(1, Math.round(rows)));
  const safeColumns = Math.min(20, Math.max(1, Math.round(columns)));
  const tableStyle: TableSettings = {
    headerFill: style.headerFill || "#f1f3f9",
    bodyFill: style.bodyFill || "#ffffff",
    textColor: style.textColor || "#20242c",
    borderColor: style.borderColor || "#8b93a7",
    borderWidth: Math.max(0, Math.min(20, style.borderWidth ?? 1)),
  };
  const width = Math.min(
    doc.width * 0.82,
    Math.max(240, safeColumns * 112),
  );
  const height = Math.min(
    doc.height * 0.82,
    Math.max(150, safeRows * 56),
  );
  const cellWidth = width / safeColumns;
  const cellHeight = height / safeRows;
  const cells: FabricObject[] = [];
  for (let row = 0; row < safeRows; row += 1) {
    for (let column = 0; column < safeColumns; column += 1) {
      const left = column * cellWidth - width / 2;
      const top = row * cellHeight - height / 2;
      const background = new fabric.Rect({
        left,
        top,
        width: cellWidth,
        height: cellHeight,
        originX: "left",
        originY: "top",
        fill: row === 0 ? tableStyle.headerFill : tableStyle.bodyFill,
        stroke: tableStyle.borderColor,
        strokeWidth: tableStyle.borderWidth,
        selectable: false,
        evented: false,
      }) as EditorObject;
      background.oceanleoTableRow = row;
      background.oceanleoTableColumn = column;
      background.oceanleoTablePart = "cell";
      const cellText = new fabric.Textbox(
        values[row]?.[column] || (row === 0 ? `标题 ${column + 1}` : ""),
        {
          left: left + cellWidth / 2,
          top: top + cellHeight / 2,
          width: Math.max(20, cellWidth - 20),
          originX: "center",
          originY: "center",
          fontFamily: "Noto Sans SC, sans-serif",
          fontSize: Math.max(12, Math.min(28, cellHeight * 0.28)),
          fontWeight: row === 0 ? "bold" : "normal",
          fill: tableStyle.textColor,
          textAlign: "center",
          selectable: true,
          evented: true,
        },
      ) as EditorObject;
      cellText.oceanleoTableRow = row;
      cellText.oceanleoTableColumn = column;
      cellText.oceanleoTablePart = "text";
      cells.push(background, cellText);
    }
  }
  const nudge = (offsetIndex % 5) * 16;
  const table = tagObject(
    new fabric.Group(cells, {
      left: doc.width / 2 + nudge,
      top: doc.height / 2 + nudge,
      originX: "center",
      originY: "center",
      interactive: true,
      subTargetCheck: true,
    }),
    "table",
  );
  table.oceanleoTableRows = safeRows;
  table.oceanleoTableColumns = safeColumns;
  return table;
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
  } else if (kind === "rounded-rect") {
    obj = new fabric.Rect({
      ...common,
      width: doc.width * 0.3,
      height: doc.height * 0.22,
      rx: minSide * 0.035,
      ry: minSide * 0.035,
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
  } else if (kind === "triangle") {
    obj = new fabric.Triangle({
      ...common,
      width: minSide * 0.3,
      height: minSide * 0.27,
      fill: SHAPE_FILL,
    });
  } else if (kind === "diamond") {
    const side = minSide * 0.18;
    obj = new fabric.Polygon(
      [
        { x: 0, y: -side },
        { x: side, y: 0 },
        { x: 0, y: side },
        { x: -side, y: 0 },
      ],
      { ...common, fill: SHAPE_FILL },
    );
  } else if (kind === "hexagon") {
    const radius = minSide * 0.17;
    obj = new fabric.Polygon(
      Array.from({ length: 6 }, (_, index) => {
        const angle = (Math.PI / 3) * index;
        return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
      }),
      { ...common, fill: SHAPE_FILL },
    );
  } else if (kind === "star") {
    const outer = minSide * 0.18;
    const inner = outer * 0.45;
    obj = new fabric.Polygon(
      Array.from({ length: 10 }, (_, index) => {
        const radius = index % 2 === 0 ? outer : inner;
        const angle = -Math.PI / 2 + (Math.PI / 5) * index;
        return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
      }),
      { ...common, fill: SHAPE_FILL },
    );
  } else if (kind === "heart") {
    obj = new fabric.Path(
      "M 50 90 C 20 70 0 50 0 27 C 0 8 15 0 29 0 C 40 0 47 7 50 14 C 53 7 60 0 71 0 C 85 0 100 8 100 27 C 100 50 80 70 50 90 Z",
      { ...common, fill: SHAPE_FILL },
    );
    obj.scaleToWidth(minSide * 0.34);
  } else if (kind === "line" || kind === "dashed-line") {
    obj = new fabric.Line([0, 0, Math.max(80, doc.width * 0.28), 0], {
      ...common,
      stroke: INK,
      strokeWidth: Math.max(3, Math.round(minSide * 0.008)),
      strokeLineCap: "round",
      strokeDashArray:
        kind === "dashed-line"
          ? [Math.max(10, minSide * 0.025), Math.max(7, minSide * 0.016)]
          : undefined,
    });
  } else if (kind === "curve") {
    obj = new fabric.Path("M 0 80 C 70 -20 170 130 250 20", {
      ...common,
      fill: "",
      stroke: INK,
      strokeWidth: Math.max(3, Math.round(minSide * 0.008)),
      strokeLineCap: "round",
    });
  } else {
    const length = Math.max(90, doc.width * 0.24);
    const strokeWidth = Math.max(4, Math.round(minSide * 0.009));
    const head = strokeWidth * 4.5;
    const line =
      kind === "elbow-arrow"
        ? new fabric.Path(`M 0 0 V ${length * 0.45} H ${length}`, {
            fill: "",
            stroke: INK,
            strokeWidth,
            strokeLineCap: "round",
            strokeLineJoin: "round",
          })
        : new fabric.Line([0, 0, length, 0], {
            stroke: INK,
            strokeWidth,
            strokeLineCap: "round",
          });
    const tip = new fabric.Triangle({
      left: length + head * 0.4,
      top: kind === "elbow-arrow" ? length * 0.45 : 0,
      originX: "center",
      originY: "center",
      angle: 90,
      width: head,
      height: head,
      fill: INK,
    });
    const parts: FabricObject[] = [line, tip];
    if (kind === "double-arrow") {
      parts.push(
        new fabric.Triangle({
          left: -head * 0.4,
          top: 0,
          originX: "center",
          originY: "center",
          angle: -90,
          width: head,
          height: head,
          fill: INK,
        }),
      );
    }
    obj = new fabric.Group(parts, common);
  }
  const tagged = tagObject(obj, kind);
  centerOrigin(tagged);
  return tagged;
}

export function recolorArrow(fabric: FabricNS, group: Group, color: string): void {
  group.getObjects().forEach((child) => {
    if (child instanceof fabric.Line || child instanceof fabric.Path) {
      child.set({ stroke: color });
    }
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
    if (child instanceof fabric.Line || child instanceof fabric.Path) {
      child.set({ strokeWidth: width });
    }
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
