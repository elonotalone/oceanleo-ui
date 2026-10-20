import type {
  PluginCommandResult,
  PluginCommandSurfaceInput,
} from "../plugin-command/types";
import type { DesignDocumentProject } from "../image-editor/design-document-schema";
import { cloneDesignDocument } from "./design-document-fabric";

export interface DesignCommandPort {
  project(): DesignDocumentProject;
  revision(): number;
  sourceReady(): boolean;
  apply(next: DesignDocumentProject): void;
}

function ok(message: string, revision?: number): PluginCommandResult {
  return {
    ok: true,
    message,
    ...(typeof revision === "number" ? { revision } : {}),
  };
}

function fail(message: string): PluginCommandResult {
  return { ok: false, message };
}

export function applyDesignDocumentTitle(
  project: DesignDocumentProject,
  text: string,
): DesignDocumentProject {
  const next = cloneDesignDocument(project);
  const title = text.trim();
  if (title.length >= 8) next.title = title.slice(0, 160);
  next.document = {
    ...next.document,
    elements: next.document.elements.map((element) =>
      element.id === "title1" && element.type === "text"
        ? { ...element, text: title.slice(0, 300) || element.text }
        : element,
    ),
  };
  return next;
}

export function applyDesignCommand(
  project: DesignDocumentProject,
  id: string,
  params: Record<string, unknown> = {},
):
  | { ok: true; project: DesignDocumentProject; message: string }
  | { ok: false; error: string } {
  if (id === "design-canvas.set-title") {
    const text = String(params.text ?? "").trim();
    if (text.length < 4) {
      return { ok: false, error: "标题至少四个字。" };
    }
    return {
      ok: true,
      project: applyDesignDocumentTitle(project, text),
      message: `已把标题改成「${text.slice(0, 40)}」。`,
    };
  }
  return { ok: false, error: `设计画布没有「${id}」这条指令。` };
}

export function createDesignCommandSurface(
  port: DesignCommandPort,
): PluginCommandSurfaceInput {
  return {
    editorId: "design-canvas",
    describe() {
      if (!port.sourceReady()) return [];
      return [
        {
          id: "design-canvas.set-title",
          label: "改标题",
          summary: "改设计稿标题，并写回画布上的标题文字。",
          mutates: true,
          params: [{ key: "text", label: "标题", type: "string", required: true }],
        },
      ];
    },
    state() {
      const project = port.project();
      return {
        revision: port.revision(),
        sourceReady: port.sourceReady(),
        title: project.title,
        elements: project.document.elements.length,
      };
    },
    run(id, params) {
      if (!port.sourceReady()) {
        return fail("设计稿还没载入，不能改。");
      }
      const applied = applyDesignCommand(port.project(), id, params || {});
      if (!applied.ok) return fail(applied.error);
      port.apply(applied.project);
      return ok(applied.message, port.revision());
    },
  };
}
