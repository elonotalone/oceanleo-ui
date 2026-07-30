"use client";

import { useCallback, useMemo, useState } from "react";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { advancedSavedItem } from "../advanced-session";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { downloadText } from "../doc-editors/doc-io";
import { libraryContentDescriptor, type LibraryItem } from "../library-data";
import { InteractiveDocContextToolbar } from "../interactive-doc-editor/InteractiveDocContextToolbar";
import { InteractiveDocControls } from "../interactive-doc-editor/InteractiveDocControls";
import { InteractiveDocStage } from "../interactive-doc-editor/InteractiveDocStage";
import { INTERACTIVE_DOC_PALETTE } from "../interactive-doc-editor/interactive-doc-controls";
import {
  interactiveDocEditorManifest,
  useInteractiveDocWorkbench,
  type InteractiveDocPorts,
} from "../interactive-doc-editor/use-interactive-doc-workbench";
// Data layer (owner W6), bound by the signatures pinned in the dispatch
// contract §4 W6 / arbitration D7. This route is the only place the viewport
// layer meets those modules; nothing here reaches into `chart-editor/` (D4).
import {
  INTERACTIVE_DOC_PROJECT_SCHEMA,
  validateInteractiveDocProject,
} from "../interactive-doc-editor/interactive-doc-schema";
import {
  evaluateComputeGraph,
  parseInteractiveDocSource,
  serializeInteractiveDocProject,
} from "../interactive-doc-editor/interactive-doc-source";
import { commitInteractiveDocProject } from "../interactive-doc-editor/interactive-doc-persistence";
import { renderInteractiveDocBlock } from "../interactive-doc-editor/interactive-doc-render";

export function InteractiveDocRoute({
  item,
  taskId,
  siteId = "",
  accent = INTERACTIVE_DOC_PALETTE["doc.accent"],
  onClose,
}: AdvancedContentWorkbenchProps) {
  const ports = useMemo<InteractiveDocPorts>(
    () => ({
      projectSchema: INTERACTIVE_DOC_PROJECT_SCHEMA,
      parse: (input) => parseInteractiveDocSource(input),
      serialize: (project) => serializeInteractiveDocProject(project),
      validate: (project) => validateInteractiveDocProject(project),
      evaluate: (project, inputs) => evaluateComputeGraph(project, inputs),
      commit: (args) => commitInteractiveDocProject(args),
      render: (args) => renderInteractiveDocBlock(args),
    }),
    [],
  );
  const editor = useInteractiveDocWorkbench(item, siteId, ports);
  const [exportError, setExportError] = useState("");

  const buildSavedItem = useCallback(
    (payload: { url?: string; versionId?: string; projectUrl?: string; revisionId?: string; previousRevisionId?: string; json?: string }): LibraryItem => {
      const next = advancedSavedItem(item, {
        url: payload.url || "",
        versionId: payload.versionId || "",
        previewUrl: item.previewUrl || item.thumbUrl,
        thumbUrl: item.thumbUrl || item.previewUrl,
        meta: {
          editor: interactiveDocEditorManifest(),
          content_type: "interactive_doc",
          representation: "interactive-doc-project",
          editor_project_url: payload.projectUrl,
          editor_project_schema: INTERACTIVE_DOC_PROJECT_SCHEMA,
          editor_revision_id: payload.revisionId,
          previous_revision_id: payload.previousRevisionId,
        },
      });
      return {
        ...next,
        content: payload.json || next.content,
        descriptor: libraryContentDescriptor({ kind: next.kind, meta: next.meta }),
      };
    },
    [item],
  );

  const flush = useCallback(async () => {
    const saved = await editor.save();
    if (!saved.ok) {
      return {
        ok: false as const,
        error:
          editor.error ||
          (saved.code === "interactive-doc-degraded-save-blocked"
            ? "文档处于 degraded（缺依赖或结果过期），已阻止保存。"
            : "可算文档保存失败"),
      };
    }
    const result = (saved.result || {}) as {
      url?: string;
      versionId?: string;
      projectUrl?: string;
      revisionId?: string;
      previousRevisionId?: string;
    };
    return {
      ok: true as const,
      item: buildSavedItem({ ...result, json: editor.serialize() }),
    };
  }, [buildSavedItem, editor]);

  const exportJson = useCallback(() => {
    setExportError("");
    try {
      downloadText(
        `${item.title || "interactive-doc"}.interactive-doc.json`,
        editor.serialize(),
        "application/json;charset=utf-8",
      );
    } catch (caught) {
      setExportError(
        caught instanceof Error ? caught.message : "可算文档 JSON 导出失败",
      );
    }
  }, [editor, item.title]);

  const exportCsv = useCallback(() => {
    setExportError("");
    try {
      const rows: string[] = ["id,label,value"];
      for (const block of editor.blocks) {
        if (block.kind === "metric") {
          rows.push(
            [block.bind, block.title || block.bind, block.display]
              .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
              .join(","),
          );
        }
        if (block.kind === "table") {
          for (const row of block.rows) {
            rows.push(
              [row.bind, row.label, row.display]
                .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
                .join(","),
            );
          }
        }
      }
      downloadText(
        `${item.title || "interactive-doc"}.results.csv`,
        rows.join("\n"),
        "text/csv;charset=utf-8",
      );
    } catch (caught) {
      setExportError(
        caught instanceof Error ? caught.message : "可算文档 CSV 导出失败",
      );
    }
  }, [editor, item.title]);

  const exportUnavailable =
    editor.loading || !editor.sourceReady || Boolean(editor.error && !editor.dirty);

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "interactive-doc",
        label: "可算文档",
        toolbox: {
          label: "参数与诊断",
          icon: "note",
          content: <InteractiveDocControls editor={editor} />,
        },
        contextToolbar: (
          <InteractiveDocContextToolbar editor={editor} accent={accent} />
        ),
        history: {
          canUndo: editor.canUndo,
          canRedo: editor.canRedo,
          undo: editor.undo,
          redo: editor.redo,
        },
        directDownload: {
          id: "interactive-doc-download-json",
          label: "直接下载结构化 JSON",
          icon: "download",
          disabled: exportUnavailable,
          onTrigger: exportJson,
        },
        actions: [
          {
            id: "interactive-doc-download-csv",
            label: "导出当前结果 CSV",
            group: "download",
            disabled: exportUnavailable,
            onTrigger: exportCsv,
          },
        ],
        stage: <InteractiveDocStage editor={editor} />,
        status:
          exportError ||
          editor.error ||
          editor.notice ||
          (editor.loading ? "正在载入可算文档…" : ""),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush,
          recovery: {
            key: advancedRecoveryKey("interactive-doc", item),
            ready: !editor.loading,
            capture: () => editor.captureRecovery(),
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}

export default InteractiveDocRoute;
