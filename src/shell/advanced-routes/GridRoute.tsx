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
  gridSavedItemForHandoff,
  useGridEditor,
  GRID_SOURCE_FORMAT,
  GRID_SOURCE_MEDIA_TYPE,
  type GridEditorState,
} from "../doc-editors/use-grid-editor";
import { useOfficeArtifactSource } from "../office-editor";
import { editorToolLabel } from "../workbench-routes";
import { buildGridCommandSurface } from "../doc-editors/doc-family-commands";
import { downloadConvertedCopy } from "../doc-editors/doc-family-download";
import {
  DOC_FAMILY_DOWNLOAD_FORMATS,
  docFamilyAcceptAttribute,
} from "../doc-editors/doc-family-formats";
import { importDocFamilyFile } from "../doc-editors/doc-family-import";
import { usePluginCommandSurface } from "../plugin-command";
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
  const officeSource = useOfficeArtifactSource(item);
  const editor = useGridEditor(
    officeSource.item,
    siteId,
    officeSource.resourceFailed,
  );
  const history = useGridDocumentHistory(
    editor,
    `${item.id}:${officeSource.url || ""}`,
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
    if (!saved) {
      return {
        ok: false as const,
        error: editor.error || undefined,
      };
    }
    const receipt = advancedSavedItem(item, {
      url: saved.url,
      versionId: saved.versionId,
      title: saved.title,
      meta: {
        source_format: saved.sourceFormat || GRID_SOURCE_FORMAT,
        source_media_type: saved.sourceMediaType || GRID_SOURCE_MEDIA_TYPE,
        source_url: saved.url,
        delivery_format: GRID_SOURCE_FORMAT,
        editor_project_url: saved.projectUrl,
        editor_project_schema: saved.projectSchema,
        editor_manifest_url: saved.projectUrl,
        editor_manifest_schema: saved.projectSchema,
        editor_working_head_url: saved.projectUrl,
        editor_working_head_project_url: saved.projectUrl,
        editor_working_head_schema: saved.projectSchema,
      },
    });
    return {
      ok: true as const,
      item: gridSavedItemForHandoff(saved.item || receipt || item, saved),
    };
  }, [editor.error, editor.save, item]);
  const [importError, setImportError] = useState("");
  /**
   * `.tsv` 过去在上传框里选得中、`loadGridFile` 当场拒（P1 实测）。现在先归一化
   * 成 XLSX 再进编辑器，转不了的报出一句能看懂的原因，不留空白工作簿。
   */
  const importLocalFile = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setImportError("");
      const outcome = await importDocFamilyFile(file, "grid");
      if (!outcome.ok) {
        setImportError(outcome.message);
        return;
      }
      await editor.importSource(outcome.file);
    },
    [editor.importSource],
  );
  const workbookBlob = useCallback(
    () =>
      buildGridRouteWorkbookBlob(structuredClone(editor.sheets), {
        headerRow: editor.headerRow,
      }),
    [editor.headerRow, editor.sheets],
  );
  const exportXlsx = useCallback(async () => {
    if (xlsxExportBusyRef.current) return;
    xlsxExportBusyRef.current = true;
    setXlsxExporting(true);
    setXlsxExportError("");
    try {
      downloadBlob(`${item.title || "workbook"}.xlsx`, await workbookBlob());
    } catch (caught) {
      setXlsxExportError(
        caught instanceof Error ? caught.message : "导出 XLSX 失败",
      );
    } finally {
      xlsxExportBusyRef.current = false;
      setXlsxExporting(false);
    }
  }, [item.title, workbookBlob]);
  /** 一个后缀 → 一次下载。PDF 走后端转换（本地出不来）。 */
  const downloadAs = useCallback(
    async (extension: string): Promise<string> => {
      setXlsxExportError("");
      try {
        if (extension === "xlsx") {
          await exportXlsx();
          return xlsxExportBusyRef.current ? "上一次导出还没结束，请稍等。" : "";
        }
        if (extension === "csv") {
          editor.exportCsv();
          return "";
        }
        if (extension === "pdf") {
          const title = item.title || "workbook";
          const failure = await downloadConvertedCopy({
            source: await workbookBlob(),
            sourceName: `${title}.xlsx`,
            target: "pdf",
            baseName: title,
          });
          if (failure) setXlsxExportError(failure);
          return failure;
        }
        return `这里没有 ${extension.toUpperCase()} 这个下载格式。`;
      } catch (caught) {
        const message =
          caught instanceof Error && caught.message
            ? caught.message
            : `导出 ${extension.toUpperCase()} 失败。`;
        setXlsxExportError(message);
        return message;
      }
    },
    [editor.exportCsv, exportXlsx, item.title, workbookBlob],
  );
  usePluginCommandSurface(
    buildGridCommandSurface(editor, { download: downloadAs }),
  );
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
          label: `直接下载 ${DOC_FAMILY_DOWNLOAD_FORMATS.grid[0].label}`,
          icon: "download",
          busyLabel: "导出中…",
          busy: xlsxExporting,
          disabled: editor.loading || xlsxExporting,
          onTrigger: exportXlsx,
        },
        actions: [
          ...(editor.sourceFailed
            ? [
                {
                  id: "grid-reload-source",
                  label: "重新载入表格",
                  onTrigger: editor.reload,
                },
              ]
            : []),
          ...(editor.error || officeSource.error
            ? [
                {
                  id: "grid-refresh-office-source",
                  label: "刷新 source/full 后重试",
                  onTrigger: officeSource.retry,
                },
              ]
            : []),
          ...DOC_FAMILY_DOWNLOAD_FORMATS.grid.slice(1).map((format) => ({
            id: `grid-export-${format.extension}`,
            label: `下载 ${format.label}`,
            group: "download" as const,
            disabled: editor.loading || xlsxExporting,
            onTrigger: () => {
              void downloadAs(format.extension);
            },
          })),
        ],
        upload: {
          accept: docFamilyAcceptAttribute("grid"),
          onFiles: importLocalFile,
        },
        stage: <GridStage editor={editor} accent={accent} />,
        status:
          importError ||
          xlsxExportError ||
          history.error ||
          (!item.meta.editor_project_url &&
            Boolean(item.url || item.artifactId) &&
            officeSource.error) ||
          editor.error ||
          (editor.loading || officeSource.loading ? "正在载入表格" : ""),
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
