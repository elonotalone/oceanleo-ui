/**
 * Design mode for the merged Fabric 6 editor (R2: image + design combined).
 *
 * Design mode extends the photo editor with multi-artboard awareness,
 * slot metadata, ruler/guide/snap infrastructure, alignment/distribution,
 * group editing, watermark, barcode/QR, and font loading — all following
 * the vue-fabric-editor blueprint rewritten for Fabric 6.
 *
 * This is the "design" half of the `photo | design` mode pair; both share the
 * same `oceanleo.fabric-carrier.v1` carrier and the same `FabricEditorController`.
 */

import type { FabricObject, Canvas, Point } from "fabric";
import type { EditorObject, FabricNS } from "../editor-objects";
import type {
  FabricCarrierArtboard,
  FabricCarrierSlot,
  FabricCarrierDocument,
} from "../fabric-carrier-schema";

// ---------------------------------------------------------------------------
// Editor mode discriminator
// ---------------------------------------------------------------------------

export type FabricEditorMode = "photo" | "design";

export interface DesignModeState {
  mode: FabricEditorMode;
  activeArtboardId: string | null;
  artboardCount: number;
  guidesVisible: boolean;
  rulerVisible: boolean;
  snapEnabled: boolean;
  gridVisible: boolean;
  gridSize: number;
}

export const DESIGN_MODE_DEFAULTS: Readonly<DesignModeState> = Object.freeze({
  mode: "design",
  activeArtboardId: null,
  artboardCount: 0,
  guidesVisible: true,
  rulerVisible: true,
  snapEnabled: true,
  gridVisible: false,
  gridSize: 10,
});

// ---------------------------------------------------------------------------
// Guide model (ruler-dragged lines, stored in carrier as annotations)
// ---------------------------------------------------------------------------

export interface Guide {
  id: string;
  orientation: "horizontal" | "vertical";
  position: number;
  artboardId: string;
}

// ---------------------------------------------------------------------------
// Snap engine — edge and center snapping for drag/resize
// ---------------------------------------------------------------------------

export interface SnapLine {
  orientation: "horizontal" | "vertical";
  position: number;
  type: "edge" | "center" | "guide" | "grid";
}

export const SNAP_THRESHOLD_PX = 5;

export function computeSnapLines(
  target: { left: number; top: number; width: number; height: number },
  siblings: readonly { left: number; top: number; width: number; height: number }[],
  guides: readonly Guide[],
  gridSize: number,
  gridVisible: boolean,
): SnapLine[] {
  const lines: SnapLine[] = [];
  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;
  const targetRight = target.left + target.width;
  const targetBottom = target.top + target.height;

  for (const sib of siblings) {
    const sibCenterX = sib.left + sib.width / 2;
    const sibCenterY = sib.top + sib.height / 2;
    const sibRight = sib.left + sib.width;
    const sibBottom = sib.top + sib.height;

    // Vertical snaps (x-axis alignment)
    for (const [tVal, sVal] of [
      [target.left, sib.left],
      [target.left, sibRight],
      [targetRight, sib.left],
      [targetRight, sibRight],
      [targetCenterX, sibCenterX],
    ] as [number, number][]) {
      if (Math.abs(tVal - sVal) <= SNAP_THRESHOLD_PX) {
        lines.push({ orientation: "vertical", position: sVal, type: "edge" });
      }
    }

    // Horizontal snaps (y-axis alignment)
    for (const [tVal, sVal] of [
      [target.top, sib.top],
      [target.top, sibBottom],
      [targetBottom, sib.top],
      [targetBottom, sibBottom],
      [targetCenterY, sibCenterY],
    ] as [number, number][]) {
      if (Math.abs(tVal - sVal) <= SNAP_THRESHOLD_PX) {
        lines.push({ orientation: "horizontal", position: sVal, type: "edge" });
      }
    }
  }

  for (const guide of guides) {
    const pos = guide.position;
    if (guide.orientation === "horizontal") {
      for (const tVal of [target.top, targetBottom, targetCenterY]) {
        if (Math.abs(tVal - pos) <= SNAP_THRESHOLD_PX) {
          lines.push({ orientation: "horizontal", position: pos, type: "guide" });
        }
      }
    } else {
      for (const tVal of [target.left, targetRight, targetCenterX]) {
        if (Math.abs(tVal - pos) <= SNAP_THRESHOLD_PX) {
          lines.push({ orientation: "vertical", position: pos, type: "guide" });
        }
      }
    }
  }

  if (gridVisible && gridSize > 0) {
    for (const tVal of [target.left, targetRight, targetCenterX]) {
      const nearest = Math.round(tVal / gridSize) * gridSize;
      if (Math.abs(tVal - nearest) <= SNAP_THRESHOLD_PX) {
        lines.push({ orientation: "vertical", position: nearest, type: "grid" });
      }
    }
    for (const tVal of [target.top, targetBottom, targetCenterY]) {
      const nearest = Math.round(tVal / gridSize) * gridSize;
      if (Math.abs(tVal - nearest) <= SNAP_THRESHOLD_PX) {
        lines.push({ orientation: "horizontal", position: nearest, type: "grid" });
      }
    }
  }

  return lines;
}

export function applySnap(
  target: { left: number; top: number; width: number; height: number },
  lines: readonly SnapLine[],
): { left: number; top: number } {
  let left = target.left;
  let top = target.top;
  const cx = left + target.width / 2;
  const cy = top + target.height / 2;
  const right = left + target.width;
  const bottom = top + target.height;

  let bestDx = SNAP_THRESHOLD_PX + 1;
  let bestDy = SNAP_THRESHOLD_PX + 1;

  for (const line of lines) {
    if (line.orientation === "vertical") {
      for (const [tVal] of [[left], [right], [cx]]) {
        const d = Math.abs(tVal - line.position);
        if (d < bestDx) {
          bestDx = d;
          left = tVal === cx
            ? line.position - target.width / 2
            : tVal === right
              ? line.position - target.width
              : line.position;
        }
      }
    } else {
      for (const [tVal] of [[top], [bottom], [cy]]) {
        const d = Math.abs(tVal - line.position);
        if (d < bestDy) {
          bestDy = d;
          top = tVal === cy
            ? line.position - target.height / 2
            : tVal === bottom
              ? line.position - target.height
              : line.position;
        }
      }
    }
  }

  return { left, top };
}

// ---------------------------------------------------------------------------
// Alignment / distribution helpers (vue-fabric-editor blueprint)
// ---------------------------------------------------------------------------

export type AlignAction =
  | "align-left"
  | "align-center-h"
  | "align-right"
  | "align-top"
  | "align-center-v"
  | "align-bottom"
  | "distribute-h"
  | "distribute-v";

export interface AlignableRect {
  object: FabricObject;
  left: number;
  top: number;
  width: number;
  height: number;
}

function boundingRect(obj: FabricObject): AlignableRect {
  const br = obj.getBoundingRect();
  return {
    object: obj,
    left: br.left,
    top: br.top,
    width: br.width,
    height: br.height,
  };
}

export function alignObjects(
  objects: FabricObject[],
  action: AlignAction,
): void {
  if (objects.length < 2 && !action.startsWith("distribute")) return;
  if (objects.length < 3 && action.startsWith("distribute")) return;

  const rects = objects.map(boundingRect);

  switch (action) {
    case "align-left": {
      const minLeft = Math.min(...rects.map((r) => r.left));
      for (const r of rects) {
        r.object.set("left", (r.object.left ?? 0) + (minLeft - r.left));
      }
      break;
    }
    case "align-right": {
      const maxRight = Math.max(...rects.map((r) => r.left + r.width));
      for (const r of rects) {
        r.object.set(
          "left",
          (r.object.left ?? 0) + (maxRight - (r.left + r.width)),
        );
      }
      break;
    }
    case "align-center-h": {
      const avg =
        rects.reduce((s, r) => s + r.left + r.width / 2, 0) / rects.length;
      for (const r of rects) {
        r.object.set(
          "left",
          (r.object.left ?? 0) + (avg - (r.left + r.width / 2)),
        );
      }
      break;
    }
    case "align-top": {
      const minTop = Math.min(...rects.map((r) => r.top));
      for (const r of rects) {
        r.object.set("top", (r.object.top ?? 0) + (minTop - r.top));
      }
      break;
    }
    case "align-bottom": {
      const maxBottom = Math.max(...rects.map((r) => r.top + r.height));
      for (const r of rects) {
        r.object.set(
          "top",
          (r.object.top ?? 0) + (maxBottom - (r.top + r.height)),
        );
      }
      break;
    }
    case "align-center-v": {
      const avg =
        rects.reduce((s, r) => s + r.top + r.height / 2, 0) / rects.length;
      for (const r of rects) {
        r.object.set(
          "top",
          (r.object.top ?? 0) + (avg - (r.top + r.height / 2)),
        );
      }
      break;
    }
    case "distribute-h": {
      const sorted = [...rects].sort((a, b) => a.left - b.left);
      const total = sorted[sorted.length - 1].left + sorted[sorted.length - 1].width - sorted[0].left;
      const contentWidth = sorted.reduce((s, r) => s + r.width, 0);
      const gap = (total - contentWidth) / (sorted.length - 1);
      let cursor = sorted[0].left + sorted[0].width;
      for (let i = 1; i < sorted.length - 1; i++) {
        const target = cursor + gap;
        sorted[i].object.set(
          "left",
          (sorted[i].object.left ?? 0) + (target - sorted[i].left),
        );
        cursor = target + sorted[i].width;
      }
      break;
    }
    case "distribute-v": {
      const sorted = [...rects].sort((a, b) => a.top - b.top);
      const total = sorted[sorted.length - 1].top + sorted[sorted.length - 1].height - sorted[0].top;
      const contentHeight = sorted.reduce((s, r) => s + r.height, 0);
      const gap = (total - contentHeight) / (sorted.length - 1);
      let cursor = sorted[0].top + sorted[0].height;
      for (let i = 1; i < sorted.length - 1; i++) {
        const target = cursor + gap;
        sorted[i].object.set(
          "top",
          (sorted[i].object.top ?? 0) + (target - sorted[i].top),
        );
        cursor = target + sorted[i].height;
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Watermark stamp
// ---------------------------------------------------------------------------

export interface WatermarkOptions {
  text: string;
  fontSize?: number;
  color?: string;
  opacity?: number;
  angle?: number;
  density?: "low" | "medium" | "high";
}

const WATERMARK_DENSITIES: Record<string, { cols: number; rows: number }> = {
  low: { cols: 2, rows: 3 },
  medium: { cols: 3, rows: 5 },
  high: { cols: 5, rows: 8 },
};

export function createWatermarkObjects(
  fabric: FabricNS,
  canvasWidth: number,
  canvasHeight: number,
  options: WatermarkOptions,
): FabricObject[] {
  const {
    text,
    fontSize = 24,
    color = "#000000",
    opacity = 0.15,
    angle = -30,
    density = "medium",
  } = options;
  const { cols, rows } = WATERMARK_DENSITIES[density] || WATERMARK_DENSITIES.medium;
  const stepX = canvasWidth / cols;
  const stepY = canvasHeight / rows;
  const objects: FabricObject[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = new fabric.Text(text, {
        left: stepX * (c + 0.5),
        top: stepY * (r + 0.5),
        fontSize,
        fill: color,
        opacity,
        angle,
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
      });
      objects.push(t);
    }
  }
  return objects;
}

// ---------------------------------------------------------------------------
// Font loading helper
// ---------------------------------------------------------------------------

export interface FontLoadRequest {
  family: string;
  url: string;
  weight?: number;
}

const loadedFonts = new Set<string>();

export async function loadFontFace(request: FontLoadRequest): Promise<boolean> {
  const key = `${request.family}:${request.weight ?? 400}`;
  if (loadedFonts.has(key)) return true;
  if (typeof document === "undefined") return false;

  try {
    const face = new FontFace(
      request.family,
      `url(${request.url})`,
      { weight: String(request.weight ?? 400) },
    );
    const loaded = await face.load();
    document.fonts.add(loaded);
    loadedFonts.add(key);
    return true;
  } catch {
    return false;
  }
}

export async function loadCarrierFonts(
  fonts: readonly { family: string; asset_key?: string; source_url?: string; weights?: readonly number[] }[],
  assetBaseUrl: string,
): Promise<string[]> {
  const failures: string[] = [];
  for (const font of fonts) {
    const url = font.source_url || (font.asset_key ? `${assetBaseUrl}/${font.asset_key}` : "");
    if (!url) {
      failures.push(font.family);
      continue;
    }
    const weights = font.weights?.length ? font.weights : [400];
    for (const w of weights) {
      const ok = await loadFontFace({ family: font.family, url, weight: w });
      if (!ok) failures.push(`${font.family}@${w}`);
    }
  }
  return failures;
}
