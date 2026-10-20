"use client";

import { useMemo, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { EditorSourceFailurePanel } from "../doc-editors/EditorSourceFailurePanel";
import { DESIGN_DOCUMENT_PROJECT_SCHEMA } from "../image-editor/design-document-schema";
import { parseDesignDocumentProject } from "../image-editor/design-document-schema";
import { useLocalDesignCanvas } from "../design-canvas/use-local-design-canvas";
import { designCanvasLocalSourceAdmission } from "./non-richdoc-source-gate";

export { designCanvasLocalSourceAdmission };

export function DesignCanvasLocalRoute({
  item,
  taskId,
  siteId = "",
  accent = "#1F6FEB",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const [reloadNonce, setReloadNonce] = useState(0);
  const admitted = useMemo(
    () => designCanvasLocalSourceAdmission(item || {}),
    [item, reloadNonce],
  );
  const sourceFailed = !admitted.ok;
  const sourceFailureReason = admitted.ok ? "" : admitted.error;
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
        stage: sourceFailed ? (
          <EditorSourceFailurePanel
            message={sourceFailureReason}
            onReload={() => setReloadNonce((value) => value + 1)}
            variant="surface"
          />
        ) : (
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
          dirty: !sourceFailed && editor.dirty,
          editRevision: editor.revision,
          autoSave: !sourceFailed && editor.ready,
          flush: () =>
            sourceFailed
              ? { ok: false as const, error: sourceFailureReason }
              : { ok: true as const, item: savedItem || item },
          recovery: {
            draftSchema: DESIGN_DOCUMENT_PROJECT_SCHEMA,
            key: advancedRecoveryKey("design-canvas", item),
            ready: !sourceFailed && editor.ready,
            capture: () => (sourceFailed ? null : editor.project),
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
