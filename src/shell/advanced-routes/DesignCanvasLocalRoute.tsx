"use client";

import { useMemo, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { EditorSourceFailurePanel } from "../doc-editors/EditorSourceFailurePanel";
import { DESIGN_DOCUMENT_PROJECT_SCHEMA } from "../image-editor/design-document-schema";
import { parseDesignDocumentProject } from "../image-editor/design-document-schema";
import { useLocalDesignCanvas } from "../design-canvas/use-local-design-canvas";
import { createDesignCommandSurface } from "../design-canvas/design-command-surface";
import { designCanvasLocalSourceAdmission } from "./non-richdoc-source-gate";
import { usePluginCommandSurface } from "../plugin-command";
import { pluginTargetForLibraryItem } from "../active-agent-file";

export { designCanvasLocalSourceAdmission };

export function DesignCanvasLocalRoute({
  item,
  taskId,
  siteId = "",
  accent = "#1F6FEB",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const [reloadNonce, setReloadNonce] = useState(0);
  const editor = useLocalDesignCanvas(item, { reloadNonce });
  const sourceFailed = editor.sourceFailed;
  const sourceFailureReason = editor.sourceError;

  usePluginCommandSurface(
    useMemo(
      () =>
        createDesignCommandSurface({
          project: () => editor.project,
          revision: () => editor.revision,
          sourceReady: () => editor.sourceReady,
          target: () => pluginTargetForLibraryItem(item, "design-canvas", editor.revision),
          apply: (next) => {
            editor.applyProject(next);
          },
        }),
      [editor, item],
    ),
  );

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
        stage: !editor.sourceReady && !sourceFailed ? (
          <div className="flex h-full items-center justify-center p-8 text-sm" data-testid="design-canvas-loading">
            正在读取设计稿。
          </div>
        ) : sourceFailed ? (
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
          autoSave: !sourceFailed && editor.ready && editor.sourceReady,
          flush: () =>
            sourceFailed
              ? { ok: false as const, error: sourceFailureReason }
              : { ok: true as const, item: savedItem || item },
          recovery: {
            draftSchema: DESIGN_DOCUMENT_PROJECT_SCHEMA,
            key: advancedRecoveryKey("design-canvas", item),
            ready: !sourceFailed && editor.ready && editor.sourceReady,
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
