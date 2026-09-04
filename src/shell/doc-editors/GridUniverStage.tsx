"use client";

/**
 * 表格新核（Univer Sheets 0.25.1）的叶子 —— flag=`next` 时才被 `GridRoute`
 * 经 `dynamic(..., { ssr: false })` 拉起。
 *
 * 本文件是唯一 `createUniver` / `@univerjs/preset-sheets-*` 运行时 import 的地方
 * （`W01-deps.md` §4）。判定、chrome、命令端口全在 `grid-univer/stage-plan.ts`，
 * 那些测试能直接跑；这里只负责挂载。
 *
 * 专业模式：`applyGridUniverMode` 走 `buildSetModeMessage` 校验闭集，再
 * `setUIVisible` + DOM `display:none`。不 `postMessage`，不 `dispose` 重建。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createUniver, LocaleType, mergeLocales } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreZhCN from "@univerjs/preset-sheets-core/locales/zh-CN";
import "@univerjs/preset-sheets-core/lib/index.css";
import { UniverSheetsFilterPreset } from "@univerjs/preset-sheets-filter";
import UniverPresetSheetsFilterZhCN from "@univerjs/preset-sheets-filter/locales/zh-CN";
import "@univerjs/preset-sheets-filter/lib/index.css";
import { UniverSheetsSortPreset } from "@univerjs/preset-sheets-sort";
import UniverPresetSheetsSortZhCN from "@univerjs/preset-sheets-sort/locales/zh-CN";
import "@univerjs/preset-sheets-sort/lib/index.css";
import { UniverSheetsDataValidationPreset } from "@univerjs/preset-sheets-data-validation";
import UniverPresetSheetsDataValidationZhCN from "@univerjs/preset-sheets-data-validation/locales/zh-CN";
import "@univerjs/preset-sheets-data-validation/lib/index.css";
import { UniverSheetsConditionalFormattingPreset } from "@univerjs/preset-sheets-conditional-formatting";
import UniverPresetSheetsConditionalFormattingZhCN from "@univerjs/preset-sheets-conditional-formatting/locales/zh-CN";
import "@univerjs/preset-sheets-conditional-formatting/lib/index.css";
import { UniverSheetsFindReplacePreset } from "@univerjs/preset-sheets-find-replace";
import UniverPresetSheetsFindReplaceZhCN from "@univerjs/preset-sheets-find-replace/locales/zh-CN";
import "@univerjs/preset-sheets-find-replace/lib/index.css";
import { UniverSheetsHyperLinkPreset } from "@univerjs/preset-sheets-hyper-link";
import UniverPresetSheetsHyperLinkZhCN from "@univerjs/preset-sheets-hyper-link/locales/zh-CN";
import "@univerjs/preset-sheets-hyper-link/lib/index.css";
import { UniverSheetsThreadCommentPreset } from "@univerjs/preset-sheets-thread-comment";
import UniverPresetSheetsThreadCommentZhCN from "@univerjs/preset-sheets-thread-comment/locales/zh-CN";
import "@univerjs/preset-sheets-thread-comment/lib/index.css";
import { UniverSheetsDrawingPreset } from "@univerjs/preset-sheets-drawing";
import UniverPresetSheetsDrawingZhCN from "@univerjs/preset-sheets-drawing/locales/zh-CN";
import "@univerjs/preset-sheets-drawing/lib/index.css";
import { UniverSheetsTablePreset } from "@univerjs/preset-sheets-table";
import UniverPresetSheetsTableZhCN from "@univerjs/preset-sheets-table/locales/zh-CN";
import "@univerjs/preset-sheets-table/lib/index.css";
import { UniverSheetsNotePreset } from "@univerjs/preset-sheets-note";
import UniverPresetSheetsNoteZhCN from "@univerjs/preset-sheets-note/locales/zh-CN";
import "@univerjs/preset-sheets-note/lib/index.css";
import type { IWorkbookData } from "@univerjs/presets";

import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { downloadBlob, loadEditorProject, saveFileToLibrary } from "./doc-io";
import { renderGridPreviewPng } from "./editor-preview-raster";
import { buildGridRouteWorkbookBlob } from "./GridWorkbookExport";
import { emptyGridSheet, loadGridFile, loadGridSheets } from "./grid-model";
import { downloadConvertedCopy } from "./doc-family-download";
import {
  DOC_FAMILY_DOWNLOAD_FORMATS,
  docFamilyAcceptAttribute,
} from "./doc-family-formats";
import { importDocFamilyFile } from "./doc-family-import";
import { useOfficeArtifactSource } from "../office-editor";
import { editorToolLabel } from "../workbench-routes";
import { usePluginCommandSurface } from "../plugin-command";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";
import { SelectionToolbar } from "../SelectionToolbar";
import {
  DEFAULT_EDITOR_MODE,
  type EditorMode,
} from "../hosted-editor/index";
import type { SelectionCommand } from "../selection-context";
import {
  GRID_LEGACY_PROJECT_SCHEMA,
  GRID_LEGACY_READONLY_NOTICE,
  GRID_UNIVER_PROJECT_SCHEMA,
  nextGridConversionState,
  planGridLegacyConversion,
  type GridConversionState,
} from "./grid-univer/legacy-conversion";
import {
  gridSheetsToUniverSnapshot,
  univerSnapshotToGridSheets,
  gridUniverOutboundWarning,
} from "./grid-univer/snapshot";
import { runGridUniverCommand } from "./grid-univer/facade-commands";
import {
  GRID_AGENT_CHIPS,
  gridToolsManifestChips,
} from "./grid-univer/l4-chips";
import {
  gridAgentCommandSpecs,
  runGridAgentCommand,
} from "./grid-univer/agent-write-gate";
import { submitAgentReviewProposal } from "../agent-review/inbox";
import {
  GRID_UNIVER_DEFAULT_MODE,
  GRID_UNIVER_INSTANCE_ID,
  GRID_UNIVER_MODE_ATTR,
  GRID_UNIVER_STAGE_ATTR,
  applyGridUniverChromeDom,
  applyGridUniverChromeToApi,
  applyGridUniverMode,
  gridUniverCommandArgsFromValue,
  gridUniverCorePresetConfig,
  gridUniverSelectionContext,
  univerFacadePortFromLive,
  type GridUniverLiveApi,
} from "./grid-univer/stage-plan";

const GRID_SOURCE_FORMAT = "xlsx";
const GRID_SOURCE_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type UniverHandle = {
  univer: { dispose: () => void };
  api: GridUniverLiveApi;
};

function emptySnapshot(title: string): Partial<IWorkbookData> {
  return gridSheetsToUniverSnapshot([emptyGridSheet()], { name: title }).data;
}

export function GridUniverStage({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const officeSource = useOfficeArtifactSource(item);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<UniverHandle | null>(null);
  const snapshotRef = useRef<Partial<IWorkbookData> | null>(null);
  const legacySheetsRef = useRef<ReturnType<typeof emptyGridSheet>[] | null>(
    null,
  );
  const [mode, setMode] = useState<EditorMode>(DEFAULT_EDITOR_MODE);
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [conversion, setConversion] = useState<GridConversionState>("converted");
  const [conversionNotice, setConversionNotice] = useState("");
  const [editRevision, setEditRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [xlsxExporting, setXlsxExporting] = useState(false);
  const [toolbarEpoch, setToolbarEpoch] = useState(0);
  const xlsxExportBusyRef = useRef(false);
  const readonly =
    conversion === "readonly" ||
    conversion === "converting" ||
    conversion === "failed";

  const chipsManifest = useMemo(() => gridToolsManifestChips(), []);

  const applyChrome = useCallback((next: EditorMode) => {
    const applied = applyGridUniverMode(GRID_UNIVER_INSTANCE_ID, next);
    const root = containerRef.current;
    if (root) applyGridUniverChromeDom(root, applied.chrome);
    applyGridUniverChromeToApi(handleRef.current?.api, applied.chrome);
    return applied;
  }, []);

  const livePort = useCallback(
    () => univerFacadePortFromLive(handleRef.current?.api),
    [],
  );

  const bumpHistory = useCallback(() => {
    setEditRevision((value) => value + 1);
    setDirty(true);
    setToolbarEpoch((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const title = item.title || "工作簿";
    setLoading(true);
    setStatus("正在载入表格");
    (async () => {
      try {
        const schema = String(item.meta.editor_project_schema || "");
        const projectUrl = String(item.meta.editor_project_url || "");
        if (schema === GRID_UNIVER_PROJECT_SCHEMA && projectUrl) {
          const data = await loadEditorProject<Partial<IWorkbookData>>(
            projectUrl,
            GRID_UNIVER_PROJECT_SCHEMA,
          );
          if (cancelled) return;
          snapshotRef.current = data;
          legacySheetsRef.current = null;
          setConversion("converted");
          setConversionNotice("");
          setSnapshotReady(true);
          return;
        }
        const sheets = await loadGridSheets(
          officeSource.item,
          undefined,
          officeSource.resourceFailed,
        );
        if (cancelled) return;
        const isStoredLegacy =
          schema === GRID_LEGACY_PROJECT_SCHEMA ||
          ((Boolean(item.url) || Boolean(item.artifactId)) &&
            schema !== GRID_UNIVER_PROJECT_SCHEMA);
        const planned = planGridLegacyConversion({
          sheets,
          schema: schema || (isStoredLegacy ? GRID_LEGACY_PROJECT_SCHEMA : ""),
          title,
        });
        if (planned.ok) snapshotRef.current = planned.data;
        else snapshotRef.current = emptySnapshot(title);
        if (isStoredLegacy) {
          legacySheetsRef.current = sheets;
          setConversion("readonly");
          setConversionNotice(
            planned.ok
              ? GRID_LEGACY_READONLY_NOTICE
              : `${GRID_LEGACY_READONLY_NOTICE} ${planned.reason}`,
          );
        } else {
          legacySheetsRef.current = null;
          setConversion("converted");
          setConversionNotice(planned.ok ? "" : planned.reason);
        }
        setSnapshotReady(true);
      } catch (caught) {
        if (cancelled) return;
        snapshotRef.current = emptySnapshot(title);
        setConversion("converted");
        setConversionNotice(
          caught instanceof Error ? caught.message : "表格载入失败。",
        );
        setSnapshotReady(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setStatus("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    item.artifactId,
    item.meta.editor_project_schema,
    item.meta.editor_project_url,
    item.title,
    item.url,
    officeSource.item,
    officeSource.resourceFailed,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !snapshotReady) return;
    if (handleRef.current) return;
    const preset = gridUniverCorePresetConfig(GRID_UNIVER_DEFAULT_MODE, container);
    const created = createUniver({
      locale: LocaleType.ZH_CN,
      locales: {
        [LocaleType.ZH_CN]: mergeLocales(
          UniverPresetSheetsCoreZhCN,
          UniverPresetSheetsFilterZhCN,
          UniverPresetSheetsSortZhCN,
          UniverPresetSheetsDataValidationZhCN,
          UniverPresetSheetsConditionalFormattingZhCN,
          UniverPresetSheetsFindReplaceZhCN,
          UniverPresetSheetsHyperLinkZhCN,
          UniverPresetSheetsThreadCommentZhCN,
          UniverPresetSheetsDrawingZhCN,
          UniverPresetSheetsTableZhCN,
          UniverPresetSheetsNoteZhCN,
        ),
      },
      presets: [
        UniverSheetsCorePreset(preset),
        UniverSheetsFilterPreset(),
        UniverSheetsSortPreset(),
        UniverSheetsDataValidationPreset(),
        UniverSheetsConditionalFormattingPreset(),
        UniverSheetsFindReplacePreset(),
        UniverSheetsHyperLinkPreset(),
        UniverSheetsThreadCommentPreset(),
        UniverSheetsDrawingPreset(),
        UniverSheetsTablePreset(),
        UniverSheetsNotePreset(),
      ],
    });
    const api = created.univerAPI as unknown as GridUniverLiveApi;
    api.createWorkbook?.(snapshotRef.current || emptySnapshot(item.title || "工作簿"));
    handleRef.current = { univer: created.univer, api };
    applyChrome(mode);
    const workbook = api.getActiveWorkbook?.();
    (workbook as { setEditable?: (value: boolean) => void } | null)?.setEditable?.(
      !readonly,
    );
    return () => {
      created.univer.dispose();
      handleRef.current = null;
    };
    // 切 mode 不许走进这个 effect：dispose 只发生在卸载。
  }, [snapshotReady]);

  useEffect(() => {
    if (!handleRef.current) return;
    applyChrome(mode);
  }, [applyChrome, mode]);

  useEffect(() => {
    const workbook = handleRef.current?.api.getActiveWorkbook?.();
    (workbook as { setEditable?: (value: boolean) => void } | null)?.setEditable?.(
      !readonly,
    );
  }, [readonly]);

  const currentSnapshot = useCallback((): Partial<IWorkbookData> => {
    const workbook = handleRef.current?.api.getActiveWorkbook?.() as
      | { save?: () => IWorkbookData; getSnapshot?: () => IWorkbookData }
      | null
      | undefined;
    return workbook?.save?.() || workbook?.getSnapshot?.() || snapshotRef.current || {};
  }, []);

  const convertLegacy = useCallback(() => {
    setConversion((state) => nextGridConversionState(state, { type: "request" }));
    const sheets = legacySheetsRef.current;
    if (!sheets || sheets.length === 0) {
      setConversion((state) => nextGridConversionState(state, { type: "reject" }));
      setConversionNotice("找不到可以转换的旧表格。");
      return;
    }
    const planned = planGridLegacyConversion({
      sheets,
      schema: GRID_LEGACY_PROJECT_SCHEMA,
      title: item.title || "工作簿",
    });
    if (!planned.ok) {
      setConversion((state) => nextGridConversionState(state, { type: "reject" }));
      setConversionNotice(planned.reason);
      return;
    }
    snapshotRef.current = planned.data;
    const workbook = handleRef.current?.api.getActiveWorkbook?.();
    (workbook as { setEditable?: (value: boolean) => void } | null)?.setEditable?.(
      true,
    );
    setConversion((state) => nextGridConversionState(state, { type: "resolve" }));
    setConversionNotice(planned.summary);
    bumpHistory();
  }, [bumpHistory, item.title]);

  const runControl = useCallback(
    (command: SelectionCommand) => {
      if (readonly) {
        setStatus(GRID_LEGACY_READONLY_NOTICE);
        return;
      }
      const port = livePort();
      if (!port) {
        setStatus("表格内核还没准备好。");
        return;
      }
      const outcome = runGridUniverCommand(
        command.controlId,
        port,
        gridUniverCommandArgsFromValue(
          command.value as string | number | boolean | null | undefined,
        ),
      );
      if (!outcome.ok) {
        setStatus(outcome.reason);
        return;
      }
      setStatus("");
      bumpHistory();
      setCanUndo(true);
      setCanRedo(false);
    },
    [bumpHistory, livePort, readonly],
  );

  const undo = useCallback(() => {
    void handleRef.current?.api.undo?.();
    setCanRedo(true);
    bumpHistory();
  }, [bumpHistory]);
  const redo = useCallback(() => {
    void handleRef.current?.api.redo?.();
    bumpHistory();
  }, [bumpHistory]);

  const workbookBlob = useCallback(
    async () => {
      const notes = { dropped: [] as string[] };
      const sheets = univerSnapshotToGridSheets(currentSnapshot(), notes);
      const blob = await buildGridRouteWorkbookBlob(sheets, { headerRow: true });
      return { blob, warning: gridUniverOutboundWarning(notes) };
    },
    [currentSnapshot],
  );

  const exportXlsx = useCallback(async () => {
    if (xlsxExportBusyRef.current) return;
    xlsxExportBusyRef.current = true;
    setXlsxExporting(true);
    try {
      const { blob, warning } = await workbookBlob();
      downloadBlob(`${item.title || "workbook"}.xlsx`, blob);
      setStatus(warning);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "导出 XLSX 失败");
    } finally {
      xlsxExportBusyRef.current = false;
      setXlsxExporting(false);
    }
  }, [item.title, workbookBlob]);

  const downloadAs = useCallback(
    async (extension: string): Promise<string> => {
      try {
        if (extension === "xlsx") {
          await exportXlsx();
          return "";
        }
        if (extension === "csv") {
          const sheets = univerSnapshotToGridSheets(currentSnapshot());
          const first = sheets[0];
          if (!first) return "没有可导出的工作表。";
          const rows = first.rows.map((row) => row.join(",")).join("\n");
          downloadBlob(
            `${item.title || "workbook"}.csv`,
            new Blob([`\uFEFF${rows}`], { type: "text/csv;charset=utf-8" }),
          );
          return "";
        }
        if (extension === "pdf") {
          const title = item.title || "workbook";
          const { blob, warning } = await workbookBlob();
          const error =
            (await downloadConvertedCopy({
              source: blob,
              sourceName: `${title}.xlsx`,
              target: "pdf",
              baseName: title,
            })) || "";
          if (!error && warning) setStatus(warning);
          return error;
        }
        return `这里没有 ${extension.toUpperCase()} 这个下载格式。`;
      } catch (caught) {
        return caught instanceof Error ? caught.message : "导出失败。";
      }
    },
    [currentSnapshot, exportXlsx, item.title, workbookBlob],
  );

  const save = useCallback(async () => {
    if (readonly) {
      setStatus(GRID_LEGACY_READONLY_NOTICE);
      return null;
    }
    const snapshot = currentSnapshot();
    snapshotRef.current = snapshot;
    const notes = { dropped: [] as string[] };
    const sheets = univerSnapshotToGridSheets(snapshot, notes);
    const title = `${item.title || "工作簿"}-编辑版`;
    const fileStem =
      title.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 180) || "workbook";
    try {
      const result = await saveFileToLibrary({
        item,
        siteId,
        fallbackSite: "excel",
        idempotencyKey: `grid-univer:${editRevision}:${String(item.id).slice(-80)}`,
        createFile: async () => {
          const delivery = await buildGridRouteWorkbookBlob(sheets, {
            headerRow: true,
          });
          return new File([delivery], `${fileStem}.xlsx`, {
            type: GRID_SOURCE_MEDIA_TYPE,
          });
        },
        createPreview: () => renderGridPreviewPng(sheets, { headerRow: true }),
        sourceFormat: GRID_SOURCE_FORMAT,
        sourceMediaType: GRID_SOURCE_MEDIA_TYPE,
        title,
        mediaType: "sheet",
        kind: "sheet",
        meta: {
          editor: "grid-univer",
          content_type: "grid",
          delivery_format: GRID_SOURCE_FORMAT,
          chips: chipsManifest.chips.map((chip) => chip.id).join(","),
        },
        project: {
          schema: GRID_UNIVER_PROJECT_SCHEMA,
          data: snapshot,
        },
      });
      if (!result.ok) {
        setStatus(result.error || "保存失败。");
        return null;
      }
      setDirty(false);
      setStatus(gridUniverOutboundWarning(notes));
      return result;
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "保存失败。");
      return null;
    }
  }, [chipsManifest.chips, currentSnapshot, editRevision, item, readonly, siteId]);

  const saveBeforeNewConversation = useCallback(async () => {
    const saved = await save();
    if (!saved) {
      return { ok: false as const, error: status || undefined };
    }
    return {
      ok: true as const,
      item: advancedSavedItem(item, {
        url: saved.url,
        versionId: saved.versionId,
        title: saved.title,
        meta: {
          source_format: saved.sourceFormat || GRID_SOURCE_FORMAT,
          source_media_type: saved.sourceMediaType || GRID_SOURCE_MEDIA_TYPE,
          editor_project_schema: GRID_UNIVER_PROJECT_SCHEMA,
        },
      }),
    };
  }, [item, save, status]);

  const importLocalFile = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      const outcome = await importDocFamilyFile(file, "grid");
      if (!outcome.ok) {
        setStatus(outcome.message);
        return;
      }
      const sheets = await loadGridFile(outcome.file);
      const planned = planGridLegacyConversion({
        sheets,
        title: file.name,
      });
      if (!planned.ok) {
        setStatus(planned.reason);
        return;
      }
      const api = handleRef.current?.api;
      const current = api?.getActiveWorkbook?.() as { getId?: () => string } | null;
      const unitId = current?.getId?.();
      if (unitId) api?.disposeUnit?.(unitId);
      api?.createWorkbook?.(planned.data);
      snapshotRef.current = planned.data;
      setConversion("converted");
      setConversionNotice("");
      applyChrome(mode);
      bumpHistory();
    },
    [applyChrome, bumpHistory, mode],
  );

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
        await importLocalFile([
          new File([blob], `${material.title || "table"}.${extension}`, {
            type: blob.type || "application/octet-stream",
          }),
        ]);
      },
    }),
    [importLocalFile],
  );
  useWorkbenchMaterialAdapter(materialAdapter);

  // agent 指令面：一条 `run` 一条路，写与不写的判断全在 `runGridAgentCommand`
  // 里（V3-red-3）。这里不许再出现任何直接调 Facade 的分支——
  // `tests/grid-univer-agent-review-gate.test.mjs` 会扫这段源码把它钉住。
  usePluginCommandSurface({
    editorId: "grid",
    describe: gridAgentCommandSpecs,
    state: () => ({
      mode,
      conversion,
      revision: editRevision,
      chips: chipsManifest.chips.map((chip) => chip.id),
      chipCount: GRID_AGENT_CHIPS.length,
    }),
    run: (id, params) =>
      runGridAgentCommand({
        id,
        params,
        port: livePort(),
        revision: editRevision,
        readonly,
        readonlyNotice: GRID_LEGACY_READONLY_NOTICE,
        submit: submitAgentReviewProposal,
        onWrite: bumpHistory,
      }),
  });

  const selectionContext = useMemo(
    () =>
      gridUniverSelectionContext({
        revision: editRevision + toolbarEpoch,
        kind: "grid-cell",
      }),
    [editRevision, toolbarEpoch],
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
        contextToolbar:
          readonly ? null : (
            <SelectionToolbar
              context={selectionContext}
              onCommand={runControl}
              accent={accent}
            />
          ),
        history: {
          canUndo,
          canRedo,
          undo,
          redo,
        },
        mode: {
          current: mode,
          setMode,
        },
        directDownload: {
          id: "grid-export-xlsx",
          label: `直接下载 ${DOC_FAMILY_DOWNLOAD_FORMATS.grid[0].label}`,
          icon: "download",
          busyLabel: "导出中…",
          busy: xlsxExporting,
          disabled: loading || xlsxExporting || readonly,
          onTrigger: exportXlsx,
        },
        actions: [
          ...(readonly
            ? [
                {
                  id: "grid-convert-legacy",
                  label: "转换为新表格",
                  disabled: conversion === "converting",
                  onTrigger: convertLegacy,
                },
              ]
            : []),
          ...DOC_FAMILY_DOWNLOAD_FORMATS.grid.slice(1).map((format) => ({
            id: `grid-export-${format.extension}`,
            label: `下载 ${format.label}`,
            group: "download" as const,
            disabled: loading || xlsxExporting || readonly,
            onTrigger: () => {
              void downloadAs(format.extension);
            },
          })),
        ],
        upload: {
          accept: docFamilyAcceptAttribute("grid"),
          onFiles: importLocalFile,
        },
        stage: (
          <div
            ref={containerRef}
            className="h-full w-full"
            {...{ [GRID_UNIVER_STAGE_ATTR]: "true" }}
            {...{ [GRID_UNIVER_MODE_ATTR]: mode }}
          />
        ),
        status:
          conversionNotice ||
          status ||
          (loading || officeSource.loading ? "正在载入表格" : ""),
        persistence: {
          dirty,
          editRevision,
          autoSave: !readonly,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("grid", item),
            ready: snapshotReady && !loading,
            capture: () => currentSnapshot(),
            restore: (payload) => {
              if (!payload || typeof payload !== "object") return false;
              const api = handleRef.current?.api;
              const current = api?.getActiveWorkbook?.() as
                | { getId?: () => string }
                | null;
              const unitId = current?.getId?.();
              if (unitId) api?.disposeUnit?.(unitId);
              api?.createWorkbook?.(payload);
              snapshotRef.current = payload as Partial<IWorkbookData>;
              applyChrome(mode);
              return true;
            },
          },
        },
      }}
      onClose={onClose}
    />
  );
}
