"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { GridContextToolbar } from "../doc-editors/GridContextToolbar";
import { downloadBlob } from "../doc-editors/doc-io";
import {
  captureGridRouteSnapshot,
  GridRouteHistory,
} from "../doc-editors/GridRouteHistory";
import { GridStage } from "../doc-editors/GridStage";
import { buildGridRouteWorkbookBlob } from "../doc-editors/GridWorkbookExport";
import {
  useGridEditor,
  type GridEditorState,
} from "../doc-editors/use-grid-editor";
import { editorToolLabel } from "../workbench-routes";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";

function useGridDocumentHistory(editor: GridEditorState, itemId: string) {
  const historyRef = useRef(new GridRouteHistory());
  const itemRef = useRef("");
  const loadingRef = useRef(editor.loading);
  const skipObservedRevisionRef = useRef(false);
  const [, renderHistory] = useState(0);
  const [error, setError] = useState("");
  const snapshot = useMemo(
    () => captureGridRouteSnapshot(editor),
    [
      editor.activeSheetId,
      editor.filterQuery,
      editor.headerRow,
      editor.selection.focus.col,
      editor.sheets,
    ],
  );
  const fingerprint = useMemo(() => JSON.stringify(snapshot), [snapshot]);

  useEffect(() => {
    const itemChanged = itemRef.current !== itemId;
    const loadingChanged = loadingRef.current !== editor.loading;
    loadingRef.current = editor.loading;
    if (
      itemChanged ||
      (loadingChanged && !skipObservedRevisionRef.current)
    ) {
      itemRef.current = itemId;
      skipObservedRevisionRef.current = false;
      historyRef.current.reset(editor.editRevision, snapshot);
      setError("");
      renderHistory((value) => value + 1);
      return;
    }
    if (editor.loading) {
      if (!skipObservedRevisionRef.current) {
        historyRef.current.accept(editor.editRevision, snapshot);
      }
      return;
    }
    if (skipObservedRevisionRef.current) {
      skipObservedRevisionRef.current = false;
      historyRef.current.accept(editor.editRevision, snapshot);
      setError("");
      renderHistory((value) => value + 1);
      return;
    }
    if (historyRef.current.observe(editor.editRevision, snapshot)) {
      setError("");
      renderHistory((value) => value + 1);
    }
  }, [editor.editRevision, editor.loading, fingerprint, itemId, snapshot]);

  const restore = useCallback(
    (direction: "undo" | "redo") => {
      const current = captureGridRouteSnapshot(editor);
      const target =
        direction === "undo"
          ? historyRef.current.undo(current)
          : historyRef.current.redo(current);
      if (!target) return;
      skipObservedRevisionRef.current = true;
      const restored: unknown = editor.restoreRecovery(target);
      if (restored === false) {
        skipObservedRevisionRef.current = false;
        if (direction === "undo") historyRef.current.rollbackUndo();
        else historyRef.current.rollbackRedo();
        setError("表格历史快照恢复失败，当前工作簿保持不变。");
        renderHistory((value) => value + 1);
        return;
      }
      setError("");
      renderHistory((value) => value + 1);
    },
    [editor],
  );
  const undo = useCallback(() => restore("undo"), [restore]);
  const redo = useCallback(() => restore("redo"), [restore]);

  return {
    canUndo: historyRef.current.canUndo,
    canRedo: historyRef.current.canRedo,
    undo,
    redo,
    snapshot,
    error,
  };
}

export function GridRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useGridEditor(item, siteId);
  const history = useGridDocumentHistory(
    editor,
    `${item.id}:${item.url || item.previewUrl || ""}`,
  );
  const xlsxExportBusyRef = useRef(false);
  const [xlsxExporting, setXlsxExporting] = useState(false);
  const [xlsxExportError, setXlsxExportError] = useState("");
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "grid-materials@2",
      actions: ["replace"],
      accepts: (material) => {
        const url = material.url || material.previewUrl || "";
        const format = String(material.meta.format || "").toLowerCase();
        return (
          material.kind === "sheet" ||
          ["csv", "tsv", "xlsx", "xls"].includes(format) ||
          /\.(?:csv|tsv|xlsx?|xlsm)(?:$|[?#])/i.test(url)
        );
      },
      mutate: async (_action, material) => {
        const url = material.url || material.previewUrl || "";
        if (!url) throw new Error("这个表格素材没有可用地址。");
        const blob = await fetchMediaBlob(url, { maxBytes: 64 * 1024 * 1024 });
        const extension =
          String(material.meta.format || "").toLowerCase() ||
          url.split(/[?#]/)[0].split(".").pop() ||
          "xlsx";
        await editor.importSource(
          new File([blob], `${material.title || "table"}.${extension}`, {
            type: blob.type || "application/octet-stream",
          }),
        );
      },
    }),
    [editor.importSource],
  );
  useWorkbenchMaterialAdapter(materialAdapter);
  const saveBeforeNewConversation = useCallback(async () => {
    const saved = await editor.save();
    return saved
      ? {
          ok: true as const,
          item: advancedSavedItem(item, {
            url: saved.url,
            versionId: saved.versionId,
            meta: {
              editor_project_url: saved.projectUrl,
              editor_project_schema: saved.projectSchema,
            },
          }),
        }
      : { ok: false as const };
  }, [editor.save, item]);
  const importLocalFile = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (file) await editor.importSource(file);
    },
    [editor.importSource],
  );
  const exportXlsx = useCallback(async () => {
    if (xlsxExportBusyRef.current) return;
    xlsxExportBusyRef.current = true;
    setXlsxExporting(true);
    setXlsxExportError("");
    try {
      const snapshot = structuredClone(editor.sheets);
      downloadBlob(
        `${item.title || "workbook"}.xlsx`,
        await buildGridRouteWorkbookBlob(snapshot, {
          headerRow: editor.headerRow,
        }),
      );
    } catch (caught) {
      setXlsxExportError(
        caught instanceof Error ? caught.message : "导出 XLSX 失败",
      );
    } finally {
      xlsxExportBusyRef.current = false;
      setXlsxExporting(false);
    }
  }, [editor.headerRow, editor.sheets, item.title]);
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "grid",
        label: editorToolLabel({ type: "grid" }),
        contextToolbar: editor.selectedCell ? (
          <GridContextToolbar editor={editor} accent={accent} />
        ) : null,
        history: {
          canUndo: history.canUndo,
          canRedo: history.canRedo,
          undo: history.undo,
          redo: history.redo,
        },
        directDownload: {
          id: "grid-export-xlsx",
          label: "直接下载 XLSX",
          icon: "download",
          busyLabel: "导出中…",
          busy: xlsxExporting,
          disabled: editor.loading || xlsxExporting,
          onTrigger: exportXlsx,
        },
        actions: [
          {
            id: "grid-export-csv",
            label: "导出 CSV",
            disabled: editor.loading || xlsxExporting,
            onTrigger: editor.exportCsv,
          },
        ],
        upload: {
          accept:
            ".csv,.tsv,.xls,.xlsx,.xlsm,.ods,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          onFiles: importLocalFile,
        },
        stage: <GridStage editor={editor} accent={accent} />,
        status:
          xlsxExportError ||
          history.error ||
          editor.error ||
          (editor.loading ? "正在载入表格" : ""),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("grid", item),
            ready: !editor.loading,
            capture: () => history.snapshot,
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
