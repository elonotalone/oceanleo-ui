"use client";

import { useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { DESIGN_DOCUMENT_PROJECT_SCHEMA } from "../image-editor/design-document-schema";
import { parseDesignDocumentProject } from "../image-editor/design-document-schema";
import { useLocalDesignCanvas } from "../design-canvas/use-local-design-canvas";

export function DesignCanvasLocalRoute({
  item,
  taskId,
  siteId = "",
  accent = "#1F6FEB",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useLocalDesignCanvas(item);

  const savedItem = useMemo(() => {
    if (!item) return item;
    return {
      ...item,
      title: editor.title,
      meta: {
        ...item.meta,
        editor: "design-canvas",
        designDocument: editor.project,
        editor_project_schema: DESIGN_DOCUMENT_PROJECT_SCHEMA,
      },
    };
  }, [editor.project, editor.title, item]);

  if (!item) {
    return <div data-testid="design-canvas-missing-item">没有打开的设计稿。</div>;
  }

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "design-canvas",
        label: "设计画布",
        stage: (
          <div
            className="h-full min-h-0 overflow-auto bg-[var(--surface,#e6e9ed)] p-4"
            data-testid="design-canvas-local-stage"
            data-local-core="fabric"
          >
            <canvas
              ref={editor.canvasElRef}
              data-testid="design-canvas-local-canvas"
            />
          </div>
        ),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.revision,
          autoSave: true,
          flush: () => ({ ok: true as const, item: savedItem || item }),
          recovery: {
            draftSchema: DESIGN_DOCUMENT_PROJECT_SCHEMA,
            key: advancedRecoveryKey("design-canvas", item),
            ready: editor.ready,
            capture: () => editor.project,
            restore: (payload) => {
              try {
                parseDesignDocumentProject(JSON.stringify(payload));
                return true;
              } catch {
                return false;
              }
            },
          },
        },
      }}
      onClose={onClose}
    />
  );
}
