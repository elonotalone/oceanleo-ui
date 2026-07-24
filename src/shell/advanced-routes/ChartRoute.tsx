"use client";

import { useCallback, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { ChartContextToolbar } from "../chart-editor/ChartContextToolbar";
import { ChartControls } from "../chart-editor/ChartControls";
import { ChartStage } from "../chart-editor/ChartStage";
import { chartExportOption } from "../chart-editor/chart-render";
import { chartDocumentToJson } from "../chart-editor/chart-schema";
import {
  chartEditorManifest,
  useChartWorkbench,
  type ChartSaveResult,
} from "../chart-editor/use-chart-workbench";
import { downloadText } from "../doc-editors/doc-io";
import { libraryContentDescriptor, type LibraryItem } from "../library-data";
import { editorToolLabel } from "../workbench-routes";

export function ChartRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useChartWorkbench(item, siteId);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportBusyRef = useRef(false);
  const exportUnavailable =
    editor.loading || Boolean(editor.error && !editor.dirty);
  const buildSavedItem = useCallback(
    (saved: ChartSaveResult): LibraryItem => {
      if (saved.item) {
        const canonicalMeta = {
          ...saved.item.meta,
          editor: chartEditorManifest(),
          content_type: "chart",
          representation: "echarts-option",
          editor_project_url: saved.projectUrl,
          editor_project_schema: saved.projectSchema,
          editor_revision_id: saved.revisionId,
          previous_revision_id: saved.previousRevisionId,
        };
        return {
          ...saved.item,
          content: saved.json,
          meta: canonicalMeta,
          descriptor: libraryContentDescriptor({
            kind: saved.item.kind,
            meta: canonicalMeta,
          }),
        };
      }
      const next = advancedSavedItem(item, {
        url: saved.url,
        versionId: saved.versionId,
        previewUrl: item.previewUrl || item.thumbUrl,
        thumbUrl: item.thumbUrl || item.previewUrl,
        meta: {
          editor: chartEditorManifest(),
          content_type: "chart",
          representation: "echarts-option",
          subtype: String(item.meta.subtype || item.meta.category || ""),
          editor_project_url: saved.projectUrl,
          editor_project_schema: saved.projectSchema,
          editor_revision_id: saved.revisionId,
          previous_revision_id: saved.previousRevisionId,
        },
      });
      const {
        chart_document: _chartDocument,
        chart_option: _chartOption,
        ...sessionMeta
      } = next.meta;
      return {
        ...next,
        meta: sessionMeta,
        content: saved.json,
        descriptor: libraryContentDescriptor({
          kind: next.kind,
          meta: sessionMeta,
        }),
      };
    },
    [item],
  );
  const saveBeforeNewConversation = useCallback(async () => {
    const saved = await editor.save();
    return saved
      ? { ok: true as const, item: buildSavedItem(saved) }
      : { ok: false as const, error: editor.error || "图表保存失败" };
  }, [buildSavedItem, editor]);
  const importLocalData = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setExportError("");
      try {
        editor.importCsv(await file.text());
      } catch (caught) {
        setExportError(
          caught instanceof Error ? caught.message : "图表数据读取失败",
        );
      }
    },
    [editor.importCsv],
  );
  const exportImage = useCallback(async (format: "png" | "svg") => {
    if (exportBusyRef.current) return;
    exportBusyRef.current = true;
    setExporting(true);
    setExportError("");
    const host = document.createElement("div");
    host.style.cssText =
      "position:fixed;left:-10000px;top:0;width:1200px;height:675px";
    document.body.appendChild(host);
    let chart: import("echarts").ECharts | null = null;
    try {
      const snapshot = structuredClone(editor.document);
      const echarts = await import("echarts");
      chart = echarts.init(host, undefined, {
        renderer: format === "svg" ? "svg" : "canvas",
        width: 1200,
        height: 675,
      });
      chart.setOption(
        chartExportOption(snapshot.option),
        { notMerge: true, lazyUpdate: false },
      );
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const anchor = document.createElement("a");
      anchor.href = chart.getDataURL(
        format === "svg"
          ? { type: "svg" }
          : {
              type: "png",
              pixelRatio: 2,
              backgroundColor: "#ffffff",
            },
      );
      anchor.download = `${item.title || "chart"}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (caught) {
      setExportError(
        caught instanceof Error ? caught.message : "图表导出失败",
      );
    } finally {
      chart?.dispose();
      host.remove();
      exportBusyRef.current = false;
      setExporting(false);
    }
  }, [editor.document, item.title]);
  const exportJson = useCallback(() => {
    setExportError("");
    try {
      const snapshot = structuredClone(editor.document);
      downloadText(
        `${item.title || "chart"}.chart.json`,
        chartDocumentToJson(snapshot),
        "application/json;charset=utf-8",
      );
    } catch (caught) {
      setExportError(
        caught instanceof Error ? caught.message : "图表 JSON 导出失败",
      );
    }
  }, [editor.document, item.title]);

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "chart-editor@1",
        label: editorToolLabel({
          type: "grid",
          adapter: "chart-editor@1",
        }),
        toolbox: {
          label: "数据与系列",
          icon: "timeline",
          content: <ChartControls editor={editor} />,
        },
        contextToolbar: (
          <ChartContextToolbar editor={editor} accent={accent} />
        ),
        history: {
          canUndo: editor.canUndo,
          canRedo: editor.canRedo,
          undo: editor.undo,
          redo: editor.redo,
        },
        directDownload: {
          id: "chart-download-png",
          label: "直接下载 PNG",
          icon: "download",
          busy: exporting,
          busyLabel: "导出中…",
          disabled: exporting || exportUnavailable,
          onTrigger: () => exportImage("png"),
        },
        actions: [
          {
            id: "chart-download-svg",
            label: "导出 SVG",
            group: "download",
            busy: exporting,
            disabled: exporting || exportUnavailable,
            onTrigger: () => exportImage("svg"),
          },
          {
            id: "chart-download-json",
            label: "导出结构化 JSON",
            group: "download",
            disabled: exporting || exportUnavailable,
            onTrigger: exportJson,
          },
        ],
        upload: {
          accept: ".csv,.tsv,text/csv,text/tab-separated-values",
          onFiles: importLocalData,
        },
        stage: <ChartStage editor={editor} />,
        status:
          exportError ||
          editor.error ||
          editor.notice ||
          (editor.loading ? "正在载入结构化图表…" : ""),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("chart-editor@1", item),
            ready: !editor.loading,
            capture: () => structuredClone(editor.document),
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
