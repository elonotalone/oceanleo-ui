import {
  parseDesignDocumentProject,
  serializeDesignDocumentProject,
  type DesignDocumentProject,
} from "../image-editor/design-document-schema";
import { blankDesignDocument } from "./blank-design-document";
import {
  storedEditorProjectUrl,
  unwrapStoredEditorProject,
  type StoredProjectItem,
  type TextLoader,
} from "../advanced-routes/stored-editor-project";

export type DesignCanvasSourcePlan =
  | { kind: "ready"; project: DesignDocumentProject }
  | { kind: "blank"; project: DesignDocumentProject }
  | { kind: "remote"; url: string }
  | { kind: "fail"; error: string };

function parseInlineDesign(raw: unknown): DesignCanvasSourcePlan {
  try {
    const project =
      typeof raw === "string"
        ? parseDesignDocumentProject(raw)
        : parseDesignDocumentProject(JSON.stringify(raw));
    return { kind: "ready", project };
  } catch (caught) {
    return {
      kind: "fail",
      error:
        caught instanceof Error && caught.message.trim()
          ? `${caught.message.trim()}，未改用空白画布覆盖原件。`
          : "设计稿源无法解析，未改用空白画布覆盖原件。",
    };
  }
}

export function parseStoredDesignDocument(text: string): DesignDocumentProject {
  const unwrapped = unwrapStoredEditorProject(text);
  if (typeof unwrapped === "string") return parseDesignDocumentProject(unwrapped);
  return parseDesignDocumentProject(JSON.stringify(unwrapped));
}

export function planDesignCanvasSource(
  item: StoredProjectItem & { title?: string },
): DesignCanvasSourcePlan {
  const raw =
    item.meta && typeof item.meta === "object"
      ? item.meta.designDocument
      : undefined;
  if (raw && typeof raw === "object") {
    return parseInlineDesign(raw);
  }
  const content = typeof item.content === "string" ? item.content.trim() : "";
  if (content.startsWith("{")) {
    return parseInlineDesign(content);
  }
  const url = storedEditorProjectUrl(item);
  if (url) return { kind: "remote", url };
  if (item.artifactId) {
    return {
      kind: "fail",
      error: "这份设计稿没有可在本地打开的工程源，未改用空白画布覆盖原件。",
    };
  }
  return {
    kind: "blank",
    project: blankDesignDocument(item.title || "本地设计稿 W10"),
  };
}

export async function hydrateDesignCanvasSource(
  plan: DesignCanvasSourcePlan,
  loadText: TextLoader,
): Promise<
  { ok: true; project: DesignDocumentProject } | { ok: false; error: string }
> {
  if (plan.kind === "ready" || plan.kind === "blank") {
    return { ok: true, project: plan.project };
  }
  if (plan.kind === "fail") return { ok: false, error: plan.error };
  try {
    const text = await loadText(plan.url);
    if (!text || !String(text).trim()) {
      return {
        ok: false,
        error: "远程设计稿为空，未改用空白画布覆盖原件。",
      };
    }
    return { ok: true, project: parseStoredDesignDocument(text) };
  } catch (caught) {
    const detail =
      caught instanceof Error && caught.message.trim()
        ? caught.message.trim()
        : "远程设计稿无法读取";
    return {
      ok: false,
      error: `${detail}，未改用空白画布覆盖原件。`,
    };
  }
}

export function serializeDesignCanvasSource(
  project: DesignDocumentProject,
): string {
  return serializeDesignDocumentProject(project);
}
