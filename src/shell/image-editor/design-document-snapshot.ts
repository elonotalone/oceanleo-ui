/**
 * Design-document project -> image editor scene (read-time, pure).
 *
 * The merged image editor opens a stored `oceanleo.design-document.v1` project
 * as a Fabric scene. Nothing is rewritten in storage: the stored revision stays
 * as it is, the first save of the merged editor writes the normal image
 * project (Fabric layers) as a new revision.
 *
 * Elements the local scene cannot show faithfully (images, icons and chart
 * embeds need the content-addressed asset closure) are reported in
 * `unsupported`; callers must refuse to open instead of dropping them.
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
  /** Group containers that were flattened (children stay as layers). */
  flattenedGroups: number;
}

const UNSUPPORTED_TYPES = new Set(["image", "icon", "chart-embed"]);

export function looksLikeDesignDocument(value: unknown): boolean {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as { schema?: unknown }).schema === DESIGN_DOCUMENT_PROJECT_SCHEMA
  );
}

function common(element: DesignDocumentElement) {
  return {
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

function elementToJson(
  element: DesignDocumentElement,
): Record<string, unknown> | null {
  const base = common(element);
  switch (element.type) {
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
  for (const element of sorted) {
    if (element.type === "group") {
      flattenedGroups += 1;
      continue;
    }
    if (UNSUPPORTED_TYPES.has(element.type)) {
      unsupported.push({ id: element.id, type: element.type });
      continue;
    }
    const json = elementToJson(element);
    if (json) objects.push(json);
    else unsupported.push({ id: element.id, type: element.type });
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
  return `这份设计稿含 ${unsupported.length} 个本地图片编辑器还不能完整显示的元素（${types}），为避免丢内容，未打开编辑，也未改用空白画布覆盖原件。`;
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
