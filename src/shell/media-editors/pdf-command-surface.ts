import type { EditorContextSurfaceInput } from "../plugin-command/types";
import type { LibraryItem } from "../library-data";
import type { PdfViewerBridge, PdfAnnotationLike } from "./pdf-viewer-bridge";
import { boundedAgentContent } from "../plugin-command/bounded-agent-content";
import { pluginTargetForLibraryItem } from "../active-agent-file";
export function buildPdfContext(editor: { loading: boolean; currentPage: number; pageCount: number; editRevision: number; selected?: PdfAnnotationLike | null; bridge: PdfViewerBridge | null }, item: LibraryItem): EditorContextSurfaceInput {
  return {
    editorId: "pdf",
    target: () => pluginTargetForLibraryItem(item, "pdf", editor.editRevision),
    selection: () => ({ kind: "pdf", page: editor.currentPage, annotationIds: editor.selected ? [editor.selected.id] : [], ...(editor.selected ? { region: { x: editor.selected.rect.origin.x, y: editor.selected.rect.origin.y, width: editor.selected.rect.size.width, height: editor.selected.rect.size.height } } : {}) }),
    agentContext: () => editor.loading ? { ready: false, reason: "PDF source unavailable" } : boundedAgentContent({ page: editor.currentPage, pageCount: editor.pageCount, annotation: editor.selected }),
  };
}
