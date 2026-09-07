"use client";

/**
 * 图表新核叶子。只在 `resolveEditorCore("chart-editor") === "next"` 时由
 * ChartRoute `dynamic(..., { ssr: false })` 拉起。
 *
 * `@antv/ava` 不许出现在 ChartRoute：推荐时再动态 import advisor 模块。
 * 专业模式 = option JSON 代码面板，同一份 document / 同一座 ChartStage，不重建。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { useModeSwitchReady } from "../advanced-routes/mode-switch-gate";
import { advancedSavedItem } from "../advanced-session";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import type { EditorMode } from "../hosted-editor/index";
import { ChartContextToolbar } from "./ChartContextToolbar";
import { ChartControls } from "./ChartControls";
import { ChartStage } from "./ChartStage";
import { ChartOptionCodePanel } from "./ChartOptionCodePanel";
import { chartExportOption } from "./chart-render";
import { chartDocumentToJson, type ChartOption } from "./chart-schema";
import {
  chartEditorManifest,
  useChartWorkbench,
  type ChartSaveResult,
} from "./use-chart-workbench";
import { downloadText } from "../doc-editors/doc-io";
import { libraryContentDescriptor, type LibraryItem } from "../library-data";
import { editorToolLabel } from "../workbench-routes";
import { usePluginCommandSurface } from "../plugin-command";
import { createChartCommandSurface } from "./chart-command-surface";
import { visualImportPlan } from "../media-editors/visual-formats";
import {
  CHART_NEXT_DEFAULT_MODE,
  CHART_NEXT_INSTANCE_ID,
  applyChartNextMode,
} from "./chart-next-chrome";
import {
  chartTypedArtifactFromDocument,
  wrapChartArtifactHtml,
} from "./chart-next-artifact";
import {
  parseChartOptionJson,
  chartOptionJsonFromDocument,
} from "./chart-next-option-code";
import {
  buildChartReviewProposal,
  chartToolsManifestChips,
} from "./chart-next-l4-chips";
import {
  CHART_LEGACY_READONLY_NOTICE,
  nextChartConversionState,
  planChartLegacyConversion,
  type ChartConversionState,
} from "./chart-next-legacy-conversion";

export function ChartNextStage({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useChartWorkbench(item, siteId);
  const toolsManifest = useMemo(() => chartToolsManifestChips(), []);
  const [mode, setModeState] = useState<EditorMode>(CHART_NEXT_DEFAULT_MODE);
  const chrome = applyChartNextMode(CHART_NEXT_INSTANCE_ID, mode);
  // 过渡门的 ready 信号（plugin-ui U4）：图表源载入结束就算首帧可见。
  useModeSwitchReady(!editor.loading);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportBusyRef = useRef(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeNotices, setCodeNotices] = useState<string[]>([]);
  const [previewOption, setPreviewOption] = useState<ChartOption | null>(null);
  const codeTouchedRef = useRef(false);
  const [conversion, setConversion] = useState<ChartConversionState>(
    editor.carrierState === "legacy-render-only" ? "readonly" : "editable",
  );
  const lastProposalRef = useRef<ReturnType<typeof buildChartReviewProposal>>(
    null,
  );

  useEffect(() => {
    if (editor.carrierState === "legacy-render-only") {
      setConversion("readonly");
    } else if (editor.sourceReady) {
      setConversion((current) =>
        current === "readonly" || current === "failed" ? current : "editable",
      );
    }
  }, [editor.carrierState, editor.sourceReady]);

  useEffect(() => {
    if (!chrome.codeModeVisible || codeTouchedRef.current) return;
    setCode(chartOptionJsonFromDocument(editor.document));
  }, [chrome.codeModeVisible, editor.document]);

  useEffect(() => {
    if (!chrome.codeModeVisible) {
      setPreviewOption(null);
      return;
    }
    const parsed = parseChartOptionJson(code, editor.document);
    if (parsed.ok) {
      setPreviewOption(parsed.option);
      if (codeTouchedRef.current) setCodeError("");
      return;
    }
    if (codeTouchedRef.current) setCodeError(parsed.reason);
  }, [chrome.codeModeVisible, code, editor.document]);

  const setMode = useCallback((next: EditorMode) => {
    const applied = applyChartNextMode(CHART_NEXT_INSTANCE_ID, next);
    setModeState(applied.mode);
    if (applied.codeModeVisible) {
      codeTouchedRef.current = false;
      setCodeError("");
    }
  }, []);

  const exportUnavailable =
    editor.loading ||
    !editor.sourceReady ||
    Boolean(editor.error && !editor.dirty);
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
      : {
          ok: false as const,
          error:
            editor.error ||
            (!editor.sourceReady
              ? "图表源未成功载入，未保存示例回退内容。"
              : "图表保存失败"),
        };
  }, [buildSavedItem, editor]);
  const importLocalData = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setExportError("");
      if (/\.xlsx$/i.test(file.name)) {
        try {
          await editor.importXlsx(await file.arrayBuffer());
        } catch (caught) {
          setExportError(
            caught instanceof Error ? caught.message : "Excel 读取失败",
          );
        }
        return;
      }
      const plan = visualImportPlan("chart-editor@1", file.name);
      if (plan.action !== "accept") {
        setExportError(plan.message || `图表读不了 .${plan.extension} 文件。`);
        return;
      }
      try {
        editor.importCsv(await file.text());
      } catch (caught) {
        setExportError(
          caught instanceof Error ? caught.message : "图表数据读取失败",
        );
      }
    },
    [editor],
  );
  const exportImage = useCallback(
    async (format: "png" | "svg") => {
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
        chart.setOption(chartExportOption(snapshot.option), {
          notMerge: true,
          lazyUpdate: false,
        });
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
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
    },
    [editor.document, item.title],
  );
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
  const exportHtml = useCallback(() => {
    setExportError("");
    try {
      const artifact = chartTypedArtifactFromDocument(editor.document);
      downloadText(
        `${item.title || "chart"}.chart.html`,
        wrapChartArtifactHtml(artifact),
        "text/html;charset=utf-8",
      );
    } catch (caught) {
      setExportError(
        caught instanceof Error ? caught.message : "图表 HTML 导出失败",
      );
    }
  }, [editor.document, item.title]);
  const deliver = useCallback(
    async (format: string) => {
      if (format === "json") {
        exportJson();
        return;
      }
      if (format === "html") {
        exportHtml();
        return;
      }
      await exportImage(format === "svg" ? "svg" : "png");
    },
    [exportHtml, exportImage, exportJson],
  );
  usePluginCommandSurface(
    useMemo(
      () => createChartCommandSurface({ editor, deliver }),
      [deliver, editor],
    ),
  );

  const applyCode = useCallback(() => {
    const parsed = parseChartOptionJson(code, editor.document);
    if (!parsed.ok) {
      setCodeError(parsed.reason);
      lastProposalRef.current = buildChartReviewProposal({
        proposalId: `chart-option-${editor.editRevision}`,
        commandId: "chart.apply-option",
        before: chartOptionJsonFromDocument(editor.document),
        after: code,
        revision: editor.editRevision,
      });
      return;
    }
    lastProposalRef.current = buildChartReviewProposal({
      proposalId: `chart-option-${editor.editRevision}`,
      commandId: "chart.apply-option",
      before: chartOptionJsonFromDocument(editor.document),
      after: chartOptionJsonFromDocument(parsed.document),
      revision: editor.editRevision,
    });
    editor.loadDocument(parsed.document);
    codeTouchedRef.current = false;
    setCodeError("");
    setCodeNotices([]);
  }, [code, editor]);

  const runAdvise = useCallback(async () => {
    setExportError("");
    const { adviseChartFromTable, lintChartFromTable, applyAvaAdviceToChartDocument } =
      await import("./chart-next-ava-advisor");
    const advised = adviseChartFromTable(editor.table);
    const applied = applyAvaAdviceToChartDocument(editor.document, advised);
    if (!applied.ok) {
      setExportError(applied.reason);
      return;
    }
    editor.loadDocument(applied.document);
    const linted = lintChartFromTable(editor.table);
    setCodeNotices(linted.notes.map((note) => note.message));
  }, [editor]);

  const convertLegacy = useCallback(() => {
    setConversion((current) => nextChartConversionState(current, { type: "request" }));
    const planned = planChartLegacyConversion({
      carrierState: editor.carrierState,
      document: editor.sourceReady ? editor.document : undefined,
    });
    if (!planned.ok) {
      setConversion((current) =>
        nextChartConversionState(current, { type: "reject" }),
      );
      setExportError(planned.reason);
      return;
    }
    editor.loadDocument(planned.document);
    setConversion((current) =>
      nextChartConversionState(current, { type: "resolve" }),
    );
  }, [editor]);

  const readonly =
    conversion === "readonly" ||
    conversion === "converting" ||
    conversion === "failed";

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
          content: (
            <ChartControls
              editor={editor}
              onAdvise={readonly ? undefined : () => void runAdvise()}
            />
          ),
        },
        contextToolbar: readonly ? null : (
          <ChartContextToolbar editor={editor} accent={accent} />
        ),
        history: {
          canUndo: editor.canUndo,
          canRedo: editor.canRedo,
          undo: editor.undo,
          redo: editor.redo,
        },
        mode: {
          current: chrome.mode,
          setMode,
        },
        pages: { proLabel: "专业编辑" },
        directDownload: {
          id: "chart-download-png",
          label: "PNG 图片 (.png)",
          icon: "download",
          busy: exporting,
          busyLabel: "导出中…",
          disabled: exporting || exportUnavailable,
          onTrigger: () => exportImage("png"),
        },
        actions: [
          {
            id: "chart-download-svg",
            label: "SVG 矢量图 (.svg)",
            icon: "download",
            group: "download",
            busy: exporting,
            disabled: exporting || exportUnavailable,
            onTrigger: () => exportImage("svg"),
          },
          {
            id: "chart-download-json",
            label: "图表数据 (.json)",
            icon: "download",
            group: "download",
            disabled: exporting || exportUnavailable,
            onTrigger: exportJson,
          },
          {
            id: "chart-download-html",
            label: "嵌页 HTML (.html)",
            icon: "download",
            group: "download",
            disabled: exporting || exportUnavailable,
            onTrigger: exportHtml,
          },
          ...(readonly
            ? [
                {
                  id: "chart-convert-legacy",
                  label: "转换为新图表",
                  disabled: conversion === "converting",
                  onTrigger: convertLegacy,
                },
              ]
            : []),
        ],
        upload: {
          accept:
            ".csv,.tsv,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          onFiles: importLocalData,
        },
        stage:
          !editor.loading && !editor.sourceReady ? (
            <div
              role="alert"
              className="mx-auto flex h-full max-w-xl flex-col items-center justify-center gap-2 bg-[var(--awb-stage-bg,#fafaf9)] p-8 text-center text-sm text-[var(--awb-danger,#be123c)]"
            >
              <p className="font-semibold">
                {editor.carrierState === "legacy-render-only"
                  ? "此历史图表只有渲染产物，不能编辑"
                  : "图表源未成功载入，编辑器已停止"}
              </p>
              <p className="text-xs leading-relaxed text-[var(--awb-muted,#57534e)]">
                {editor.error ||
                  (editor.carrierState === "legacy-render-only"
                    ? CHART_LEGACY_READONLY_NOTICE
                    : "未取得 oceanleo.chart.v1 结构化源；不会从 HTML、脚本或 PNG 逆向伪恢复。")}
              </p>
              {editor.carrierState === "legacy-render-only" ? (
                <button
                  type="button"
                  onClick={convertLegacy}
                  className="mt-2 rounded-xl border border-[var(--border,#e7e5e4)] px-3 py-2 text-xs"
                >
                  转换为新图表
                </button>
              ) : null}
            </div>
          ) : (
            <div
              className="flex h-full min-h-[420px] w-full"
              data-chart-next-stage=""
              data-chart-next-mode={chrome.mode}
            >
              <div className="min-w-0 flex-1">
                <ChartStage
                  editor={editor}
                  optionOverride={
                    chrome.codeModeVisible ? previewOption : null
                  }
                />
              </div>
              {chrome.codeModeVisible ? (
                <ChartOptionCodePanel
                  value={code}
                  error={codeError}
                  notices={codeNotices}
                  onChange={(next) => {
                    codeTouchedRef.current = true;
                    setCode(next);
                  }}
                  onApply={applyCode}
                />
              ) : null}
            </div>
          ),
        status:
          exportError ||
          editor.error ||
          editor.notice ||
          (toolsManifest.chips.length
            ? editor.loading
              ? "正在载入结构化图表…"
              : ""
            : "") ||
          (editor.loading ? "正在载入结构化图表…" : ""),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("chart-editor@1", item),
            ready: !editor.loading,
            capture: () =>
              editor.sourceReady ? structuredClone(editor.document) : null,
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
