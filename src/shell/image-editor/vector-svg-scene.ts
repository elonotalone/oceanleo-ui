/**
 * Vector image (SVG) <-> image editor scene.
 *
 * The merged image editor opens a stored `vector_image` revision by sanitizing
 * its SVG (no script, event attributes, foreignObject, external references;
 * reuses `vector-editor/vector-sanitize.ts`) and parsing it with Fabric's
 * `loadSVGFromString`. `<g>` groups are flattened by Fabric into layers with the
 * group transform baked in, so every path / rect / shape is directly editable.
 * SVG text becomes `IText` (editable). The stored revision is never rewritten:
 * saving writes a new revision whose delivery bytes are `canvas.toSVG()`.
 */

import { sanitizeSvg } from "../vector-editor/vector-sanitize";
import { makeId, SNAPSHOT_PROPS, type FabricNS } from "./editor-objects";
import type { ImageEditorSnapshot } from "./image-document-contract";

export const VECTOR_SVG_MAX_BYTES = 8 * 1024 * 1024;
export const VECTOR_DOC_BACKGROUND = "#ffffff";

export class VectorSvgError extends Error {}

/** Sanitize for editing; refuse (never silently blank) when nothing safe/renderable is left. */
export function sanitizeVectorSource(text: string): {
  svg: string;
  removed: number;
} {
  if (!text || !text.trim()) throw new VectorSvgError("矢量图源为空。");
  if (new TextEncoder().encode(text).byteLength > VECTOR_SVG_MAX_BYTES) {
    throw new VectorSvgError("矢量图超过 8MB 安全上限，无法在线编辑。");
  }
  const report = sanitizeSvg(text);
  if (!report.renderable || !report.svg) {
    throw new VectorSvgError("这份矢量图无法解析为可编辑的 SVG。");
  }
  if (report.residual.length > 0) {
    throw new VectorSvgError("这份矢量图含无法清除的危险结构，未打开编辑。");
  }
  return { svg: report.svg, removed: report.removals.length };
}

export interface VectorSceneResult {
  snapshot: ImageEditorSnapshot;
  removed: number;
  layerCount: number;
}

export async function vectorSvgToSnapshot(
  fabric: FabricNS,
  svgText: string,
): Promise<VectorSceneResult> {
  const { svg, removed } = sanitizeVectorSource(svgText);
  const parsed = await fabric.loadSVGFromString(svg);
  const options = parsed.options as {
    width?: number;
    height?: number;
    viewBoxWidth?: number;
    viewBoxHeight?: number;
    minX?: number;
    minY?: number;
  };
  const width = Math.max(
    1,
    Math.round(options.viewBoxWidth || options.width || 0),
  );
  const height = Math.max(
    1,
    Math.round(options.viewBoxHeight || options.height || 0),
  );
  if (!width || !height) throw new VectorSvgError("矢量图缺少画布尺寸（width/height 或 viewBox）。");
  const minX = Number(options.minX) || 0;
  const minY = Number(options.minY) || 0;
  const objects: Record<string, unknown>[] = [
    {
      type: "Rect",
      originX: "left",
      originY: "top",
      left: 0,
      top: 0,
      width,
      height,
      fill: VECTOR_DOC_BACKGROUND,
      strokeWidth: 0,
      selectable: false,
      evented: false,
      objectCaching: false,
      oceanleoId: makeId(),
      oceanleoRole: "docbg",
      oceanleoKind: "rect",
      oceanleoLocked: true,
    },
  ];
  for (const object of parsed.objects) {
    if (!object) continue;
    if (minX || minY) {
      object.set({
        left: (object.left ?? 0) - minX,
        top: (object.top ?? 0) - minY,
      });
    }
    const json = object.toObject([...SNAPSHOT_PROPS]) as Record<string, unknown>;
    // Real SVG text stays editable text.
    if (json.type === "Text") json.type = "IText";
    json.oceanleoId = makeId();
    objects.push(json);
  }
  if (objects.length === 1) {
    throw new VectorSvgError("这份矢量图没有可编辑的图形元素。");
  }
  return {
    snapshot: {
      json: { version: "6", objects },
      doc: { width, height },
      canvasBackground: VECTOR_DOC_BACKGROUND,
    },
    removed,
    layerCount: objects.length - 1,
  };
}

export interface SvgExportCanvas {
  viewportTransform: readonly number[];
  setViewportTransform(transform: [number, number, number, number, number, number]): void;
  requestRenderAll(): void;
  getObjects(): object[];
  toSVG(options?: Record<string, unknown>): string;
}

/** Delivery bytes for a vector revision: the live canvas as SVG, page background excluded. */
export function exportVectorSvg(
  canvas: SvgExportCanvas,
  doc: { width: number; height: number },
): string {
  const previous = [...canvas.viewportTransform] as [number, number, number, number, number, number];
  const skipped: Array<{ object: { excludeFromExport?: boolean }; was: boolean | undefined }> = [];
  for (const raw of canvas.getObjects()) {
    const object = raw as { excludeFromExport?: boolean; oceanleoRole?: string };
    const role = object.oceanleoRole;
    if (role === "docbg" || role === "crop") {
      skipped.push({ object, was: object.excludeFromExport });
      object.excludeFromExport = true;
    }
  }
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  let svg: string;
  try {
    svg = canvas.toSVG({
      viewBox: { x: 0, y: 0, width: doc.width, height: doc.height },
      width: String(doc.width),
      height: String(doc.height),
      suppressPreamble: true,
    });
  } finally {
    canvas.setViewportTransform(previous);
    for (const { object, was } of skipped) object.excludeFromExport = was;
    canvas.requestRenderAll();
  }
  const report = sanitizeSvg(svg);
  if (!report.renderable || !report.svg || report.residual.length > 0) {
    throw new VectorSvgError("导出的 SVG 未通过安全清理，本次未保存。");
  }
  return report.svg;
}

/** Durable vector revision recognised by the typed artifact fields. */
export function isVectorImageItem(item: {
  artifactType?: string;
  artifact?: { artifactType?: string } | null;
}): boolean {
  return (
    item.artifactType === "vector_image" ||
    item.artifact?.artifactType === "vector_image"
  );
}
