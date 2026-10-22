/**
 * Design-document project -> image editor scene (read-time, pure).
 *
 * The merged image editor opens a stored `oceanleo.design-document.v1` project
 * as a Fabric scene. Nothing is rewritten in storage: the stored revision stays
 * as it is, the first save of the merged editor writes the normal image
 * project (Fabric layers) as a new revision.
 *
 * Image, icon and chart-embed elements become Fabric image layers. Their
 * `assetId` is a `platform_assets.oss_key` (design-document spec section 4), so
 * the pixels come from the first-party asset bucket; the caller resolves each
 * asset's natural size first (`designAssetRefs` / `designAssetUrl`) and passes it
 * in `assets`. A chart-embed is delivered as its stored preview raster and the
 * layer is named "图表". Only genuinely unknown element types, or an element whose
 * asset is missing, are reported in `unsupported`; callers must refuse to open
 * instead of dropping them.
 */

import {
  DESIGN_DOCUMENT_PROJECT_SCHEMA,
  parseDesignDocumentProject,
  type DesignDocumentElement,
  type DesignDocumentProject,
} from "./design-document-schema";
import type { ImageEditorSnapshot } from "./image-document-contract";

export interface DesignSnapshotResult {
  snapshot: ImageEditorSnapshot;
  /** Element ids (with type) that cannot be rendered locally. */
  unsupported: Array<{ id: string; type: string }>;
  /** Group containers: children stay top-level layers tagged with the group id. */
  flattenedGroups: number;
}

const ASSET_TYPES = new Set(["image", "icon", "chart-embed"]);
const KNOWN_TYPES = new Set([
  "text", "rect", "ellipse", "line", "path", "group", ...ASSET_TYPES,
]);

/** First-party asset bucket that serves `platform_assets.oss_key`. */
export const DESIGN_ASSET_ORIGIN = "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com";

export interface DesignAssetImage {
  /** Browser-loadable (canvas-safe) URL. */
  url: string;
  /** Natural pixel size; 0/absent falls back to the element box. */
  width?: number;
  height?: number;
}

/** Element id + asset key for every element that needs pixels. */
export function designAssetRefs(
  project: DesignDocumentProject,
): Array<{ elementId: string; assetId: string; type: string }> {
  return project.document.elements
    .filter((element) => ASSET_TYPES.has(element.type) && element.assetId)
    .map((element) => ({
      elementId: element.id,
      assetId: element.assetId as string,
      type: element.type,
    }));
}

/** oss_key -> bucket URL; refuses anything that is not a plain object key. */
export function designAssetUrl(assetId: string): string {
  const key = String(assetId || "").trim();
  if (!key || key.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(key) || key.split("/").includes("..")) {
    return "";
  }
  return `${DESIGN_ASSET_ORIGIN}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

const LAYER_NAMES: Record<string, string> = { "chart-embed": "图表", icon: "图标" };

export function looksLikeDesignDocument(value: unknown): boolean {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { schema?: unknown }).schema === DESIGN_DOCUMENT_PROJECT_SCHEMA
  );
}

function common(element: DesignDocumentElement) {
  const name = LAYER_NAMES[element.type] ?? (element.alt ? element.alt.slice(0, 80) : "");
  return {
    ...(name ? { oceanleoName: name } : {}),
    ...(element.assetId ? { oceanleoDesignAssetId: element.assetId } : {}),
    originX: "left",
    originY: "top",
    left: element.x,
    top: element.y,
    angle: element.rotationDeg || 0,
    opacity: element.opacity ?? 1,
    oceanleoId: element.id,
    oceanleoKind: element.type,
  };
}

function assetImageJson(
  element: DesignDocumentElement,
  base: Record<string, unknown>,
  asset: DesignAssetImage,
): Record<string, unknown> {
  const boxW = element.width;
  const boxH = element.height;
  const nw = asset.width && asset.width > 0 ? asset.width : boxW;
  const nh = asset.height && asset.height > 0 ? asset.height : boxH;
  const fit = element.fit || (element.type === "image" ? "cover" : "contain");
  const out: Record<string, unknown> = {
    ...base,
    type: "Image",
    src: asset.url,
    crossOrigin: "anonymous",
    cropX: 0,
    cropY: 0,
    width: nw,
    height: nh,
    scaleX: boxW / nw,
    scaleY: boxH / nh,
  };
  if (fit === "contain") {
    const scale = Math.min(boxW / nw, boxH / nh);
    out.scaleX = scale;
    out.scaleY = scale;
    // Centre inside the box; rotation pivots on the box origin like the others.
    out.left = element.x + (boxW - nw * scale) / 2;
    out.top = element.y + (boxH - nh * scale) / 2;
  } else if (fit === "cover") {
    const scale = Math.max(boxW / nw, boxH / nh);
    const visibleW = boxW / scale;
    const visibleH = boxH / scale;
    out.scaleX = scale;
    out.scaleY = scale;
    out.cropX = (nw - visibleW) / 2;
    out.cropY = (nh - visibleH) / 2;
    out.width = visibleW;
    out.height = visibleH;
  }
  return out;
}

function elementToJson(
  element: DesignDocumentElement,
  assets: Record<string, DesignAssetImage>,
): Record<string, unknown> | null {
  const base = common(element);
  switch (element.type) {
    case "image":
    case "icon":
    case "chart-embed": {
      const asset = element.assetId ? assets[element.assetId] : undefined;
      return asset?.url ? assetImageJson(element, base, asset) : null;
    }
    case "rect":
      return {
        ...base,
        type: "Rect",
        width: element.width,
        height: element.height,
        fill: element.fill || "#1F6FEB",
        stroke: element.stroke ?? null,
        strokeWidth: element.strokeWidth || 0,
        rx: element.radius || 0,
        ry: element.radius || 0,
      };
    case "ellipse":
      return {
        ...base,
        type: "Ellipse",
        rx: element.width / 2,
        ry: element.height / 2,
        fill: element.fill || "#E5484D",
        stroke: element.stroke ?? null,
        strokeWidth: element.strokeWidth || 0,
      };
    case "text":
      return {
        ...base,
        type: "Textbox",
        text: element.text || "",
        width: element.width,
        fontSize: element.fontSizePx || 28,
        fill: element.fill || "#1F2328",
        fontFamily: element.fontFamily || "sans-serif",
        fontWeight: element.fontWeight || 400,
        lineHeight: element.lineHeight || 1.16,
        textAlign: element.align || "left",
      };
    case "line":
      return {
        ...base,
        type: "Line",
        x1: 0,
        y1: 0,
        x2: element.width,
        y2: element.height,
        stroke: element.stroke || element.fill || "#1F2328",
        strokeWidth: element.strokeWidth || 2,
      };
    case "path":
      if (!element.pathData) return null;
      return {
        ...base,
        type: "Path",
        path: element.pathData,
        fill: element.fill ?? null,
        stroke: element.stroke ?? null,
        strokeWidth: element.strokeWidth || 0,
      };
    default:
      return null;
  }
}

export function designDocumentToSnapshot(
  input: DesignDocumentProject | string | unknown,
  assets: Record<string, DesignAssetImage> = {},
): DesignSnapshotResult {
  const project: DesignDocumentProject =
    typeof input === "string"
      ? parseDesignDocumentProject(input)
      : parseDesignDocumentProject(JSON.stringify(input));
  const { width, height, background, elements } = project.document;
  const sorted = [...elements].sort((left, right) => left.z - right.z);
  const objects: Record<string, unknown>[] = [
    {
      type: "Rect",
      originX: "left",
      originY: "top",
      left: 0,
      top: 0,
      width,
      height,
      fill: background,
      strokeWidth: 0,
      selectable: false,
      evented: false,
      objectCaching: false,
      oceanleoId: "design-docbg",
      oceanleoRole: "docbg",
      oceanleoKind: "rect",
      oceanleoLocked: true,
    },
  ];
  const unsupported: DesignSnapshotResult["unsupported"] = [];
  let flattenedGroups = 0;
  const groupOf = new Map<string, string>();
  for (const element of sorted) {
    if (element.type === "group") {
      for (const childId of element.childIds ?? []) groupOf.set(childId, element.id);
    }
  }
  for (const element of sorted) {
    if (element.type === "group") {
      flattenedGroups += 1;
      continue;
    }
    if (!KNOWN_TYPES.has(element.type)) {
      unsupported.push({ id: element.id, type: element.type });
      continue;
    }
    const json = elementToJson(element, assets);
    if (!json) {
      unsupported.push({ id: element.id, type: element.type });
      continue;
    }
    const group = groupOf.get(element.id);
    objects.push(group ? { ...json, oceanleoDesignGroup: group } : json);
  }
  return {
    snapshot: {
      json: { version: "6", objects },
      doc: { width, height },
      canvasBackground: background,
    },
    unsupported,
    flattenedGroups,
  };
}

export function unsupportedDesignMessage(
  unsupported: DesignSnapshotResult["unsupported"],
): string {
  const types = [...new Set(unsupported.map((entry) => entry.type))].join("、");
  return `这份设计稿含 ${unsupported.length} 个本地图片编辑器无法完整载入的元素（未知类型或素材缺失）（${types}），为避免丢内容，未打开编辑，也未改用空白画布覆盖原件。`;
}

/**
 * Is this stored item a design-document project (legacy design canvas)?
 * Read-time check only; the item is never rewritten.
 */
export function isDesignDocumentItem(item: {
  meta?: Record<string, unknown>;
  artifact?: { sourceFormat?: string } | null;
  artifactType?: string;
}): boolean {
  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
  if (meta.designDocument && typeof meta.designDocument === "object") return true;
  if (String(meta.editor_project_schema || "") === DESIGN_DOCUMENT_PROJECT_SCHEMA) {
    return true;
  }
  return (
    item.artifactType === "composite_image" &&
    item.artifact?.sourceFormat === DESIGN_DOCUMENT_PROJECT_SCHEMA
  );
}
