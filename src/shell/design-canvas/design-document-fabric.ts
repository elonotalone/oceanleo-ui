import type { Canvas, FabricObject } from "fabric";
import type { FabricNS } from "../image-editor/editor-objects";
import {
  parseDesignDocumentProject,
  serializeDesignDocumentProject,
  type DesignDocumentElement,
  type DesignDocumentProject,
} from "../image-editor/design-document-schema";

export const DESIGN_FABRIC_CUSTOM_PROPS = ["oceanleoId", "oceanleoKind"] as const;

function mark(
  object: FabricObject,
  id: string,
  kind: DesignDocumentElement["type"],
): FabricObject {
  (object as FabricObject & { oceanleoId: string; oceanleoKind: string }).oceanleoId =
    id;
  (object as FabricObject & { oceanleoId: string; oceanleoKind: string }).oceanleoKind =
    kind;
  return object;
}

export function elementToFabricObject(
  fabric: FabricNS,
  element: DesignDocumentElement,
): FabricObject | null {
  const common = {
    left: element.x,
    top: element.y,
    angle: element.rotationDeg || 0,
    opacity: element.opacity ?? 1,
  };
  if (element.type === "rect") {
    return mark(
      new fabric.Rect({
        ...common,
        width: element.width,
        height: element.height,
        fill: element.fill || "#1F6FEB",
        stroke: element.stroke,
        strokeWidth: element.strokeWidth || 0,
        rx: element.radius || 0,
        ry: element.radius || 0,
      }),
      element.id,
      "rect",
    );
  }
  if (element.type === "ellipse") {
    return mark(
      new fabric.Ellipse({
        ...common,
        rx: element.width / 2,
        ry: element.height / 2,
        fill: element.fill || "#E5484D",
        stroke: element.stroke,
        strokeWidth: element.strokeWidth || 0,
      }),
      element.id,
      "ellipse",
    );
  }
  if (element.type === "text") {
    return mark(
      new fabric.Textbox(element.text || "", {
        ...common,
        width: element.width,
        fontSize: element.fontSizePx || 28,
        fill: element.fill || "#1F2328",
        fontFamily: element.fontFamily || "sans-serif",
        fontWeight: element.fontWeight || 400,
      }),
      element.id,
      "text",
    );
  }
  if (element.type === "line") {
    return mark(
      new fabric.Line(
        [element.x, element.y, element.x + element.width, element.y + element.height],
        {
          stroke: element.stroke || element.fill || "#1F2328",
          strokeWidth: element.strokeWidth || 2,
          opacity: element.opacity ?? 1,
        },
      ),
      element.id,
      "line",
    );
  }
  return null;
}

export function applyDesignDocumentToCanvas(
  fabric: FabricNS,
  canvas: Canvas,
  project: DesignDocumentProject,
): void {
  canvas.clear();
  canvas.setDimensions({
    width: project.document.width,
    height: project.document.height,
  });
  canvas.backgroundColor = project.document.background;
  const sorted = [...project.document.elements].sort((left, right) => left.z - right.z);
  for (const element of sorted) {
    const object = elementToFabricObject(fabric, element);
    if (object) canvas.add(object);
  }
  canvas.requestRenderAll();
}

function readText(object: FabricObject): string {
  const record = object as FabricObject & { text?: string };
  return typeof record.text === "string" ? record.text : "";
}

export function mergeCanvasIntoDesignDocument(
  canvas: Canvas,
  project: DesignDocumentProject,
): DesignDocumentProject {
  const live = canvas.getObjects();
  const elements = project.document.elements.map((element) => {
    const object = live.find((item) => {
      const marked = item as FabricObject & { oceanleoId?: string };
      return marked.oceanleoId === element.id;
    });
    if (!object) return element;
    const next: DesignDocumentElement = {
      ...element,
      x: Number(object.left) || 0,
      y: Number(object.top) || 0,
    };
    if (element.type === "text") {
      next.text = readText(object);
    }
    return next;
  });
  return {
    ...project,
    document: {
      ...project.document,
      background: String(canvas.backgroundColor || project.document.background),
      elements,
    },
  };
}

export function cloneDesignDocument(
  project: DesignDocumentProject,
): DesignDocumentProject {
  return parseDesignDocumentProject(serializeDesignDocumentProject(project));
}

export function designDocumentTitleOf(
  project: DesignDocumentProject,
): string {
  const title = project.document.elements.find((element) => element.id === "title1");
  return title?.text || project.title;
}
