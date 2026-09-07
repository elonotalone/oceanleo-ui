"use client";

/**
 * 表格件的唯一舞台（Univer Sheets 0.25.1），由 `GridRoute` 经
 * `dynamic(..., { ssr: false })` 拉起。自研旧表格已删（core-swap:delete grid）。
 *
 * 本文件是唯一 `createUniver` / `@univerjs/preset-sheets-*` 运行时 import 的地方
 * （`W01-deps.md` §4）。判定、chrome、命令端口全在 `grid-univer/stage-plan.ts`，
 * 那些测试能直接跑；这里只负责挂载。
 *
 * 两种模式、一个实例：普通 = 这个 Univer 关掉 ribbon / 公式栏，专业 = 打开它们。
 * 模式直接读 L0 store（`usePluginMode("grid")`），页面行点「Univer」→ store 变 →
 * `useLayoutEffect` 里 `applyChrome` 在同一帧内落到 DOM。`applyGridUniverMode`
 * 走 `buildSetModeMessage` 校验闭集，再 `setUIVisible` + DOM `display:none`。
 * 不 `postMessage`，不 `dispose` 重建。`dispose` 只在卸载时跑，而且推到 React
 * 提交之外（见挂载 effect 的 cleanup 注释）。
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import type { EditorMode } from "../hosted-editor/index";
import type { SelectionCommand } from "../selection-context";
import { usePluginMode } from "../plugin-chrome/plugin-mode";
import { WorkbenchRouteLoading } from "../advanced-routes/WorkbenchRouteLoading";
import { buildGridDocumentActions } from "./grid-univer/document-actions";
import {
  GRID_EDITOR_CAPABILITY,
  GRID_SOURCE_FORMAT,
  GRID_SOURCE_MEDIA_TYPE,
} from "./grid-shared";
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
import {
  GRID_PRO_LABEL,
  GRID_UNIVER_RECOVERY_EDITOR_ID,
  isUniverWorkbookSnapshot,
  listUniverSnapshotValues,
  planGridSameDocumentOpen,
  replaceUniverWorkbookWithSnapshot,
  sheetsFromLegacyProjectData,
} from "./grid-univer/same-document";

type UniverHandle = {
  univer: { dispose: () => void };
  api: GridUniverLiveApi;
};

/**
 * 卸载时「停在路边」的实例：`dispose` 已排进下一个宏任务，但还没跑。
 * 同一次提交里若紧接着又挂载（React 开发态 StrictMode 会把 effect 跑两遍：
 * 挂 → 卸 → 挂），第二次挂载**收回**这台实例而不是再造一台——Univer 的 UI 层按
 * 容器元素缓存 React root（`preset-sheets-core` 里的 WeakMap），同一容器上造第二台
 * 会复用第一台的 root，随后第一台的 `dispose` 把第二台的 UI 一并卸掉。
 */
type ParkedUniver = {
  handle: UniverHandle;
  timer: ReturnType<typeof setTimeout>;
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
  const parkedRef = useRef<ParkedUniver | null>(null);
  const snapshotRef = useRef<Partial<IWorkbookData> | null>(null);
  const legacySheetsRef = useRef<ReturnType<typeof emptyGridSheet>[] | null>(
    null,
  );
  /**
   * 模式直接来自 L0 store：页面行、刷新后的记忆、别的标签页改的档位，
   * 全部经同一个 `useSyncExternalStore` 收敛到这里。舞台自己不另存一份 mode。
   */
  const { mode, setMode } = usePluginMode("grid");
  const modeRef = useRef<EditorMode>(mode);
  modeRef.current = mode;
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
        let univerSnapshot: Partial<IWorkbookData> | null = null;
        let legacySheets: ReturnType<typeof sheetsFromLegacyProjectData> = null;
        let officeSheets: ReturnType<typeof emptyGridSheet>[] | null = null;

        if (schema === GRID_UNIVER_PROJECT_SCHEMA && projectUrl) {
          univerSnapshot = await loadEditorProject<Partial<IWorkbookData>>(
            projectUrl,
            GRID_UNIVER_PROJECT_SCHEMA,
          );
        } else if (projectUrl && schema !== GRID_UNIVER_PROJECT_SCHEMA) {
          // 存量用户的旧核工程档（`oceanleo.grid.v1`）：读进来、转成快照、只读打开。
          // 这是旧文档进新核的入口，旧核运行时删了它也必须在。
          try {
            const project = await loadEditorProject<unknown>(
              projectUrl,
              schema || GRID_LEGACY_PROJECT_SCHEMA,
            );
            legacySheets = sheetsFromLegacyProjectData(project);
          } catch {
            legacySheets = null;
          }
        }
        if (!univerSnapshot && !legacySheets) {
          officeSheets = await loadGridSheets(
            officeSource.item,
            undefined,
            officeSource.resourceFailed,
          );
        }
        if (cancelled) return;
        const planned = planGridSameDocumentOpen({
          schema,
          title,
          univerSnapshot,
          legacySheets,
          officeSheets,
        });
        snapshotRef.current = planned.snapshot || emptySnapshot(title);
        if (planned.kind === "legacy-stored") {
          legacySheetsRef.current = planned.sheets;
          setConversion("readonly");
          setConversionNotice(
            planned.snapshot
              ? GRID_LEGACY_READONLY_NOTICE
              : `${GRID_LEGACY_READONLY_NOTICE} ${planned.reason || ""}`.trim(),
          );
        } else {
          legacySheetsRef.current = null;
          setConversion("converted");
          setConversionNotice("");
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
    const parked = parkedRef.current;
    if (parked) {
      // 同一次提交里卸了又挂（StrictMode 双跑）：收回停在路边的那台，不再造。
      clearTimeout(parked.timer);
      parkedRef.current = null;
      handleRef.current = parked.handle;
      applyChrome(modeRef.current);
      return parkForDispose;
    }
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
    const snapshot = structuredClone(
      snapshotRef.current || emptySnapshot(item.title || "工作簿"),
    );
    const painted = replaceUniverWorkbookWithSnapshot(api, snapshot);
    const live = (
      api.getActiveWorkbook?.() as { save?: () => unknown } | null
    )?.save?.();
    (
      globalThis as typeof globalThis & {
        __oceanleoGridUniverPaint?: unknown;
      }
    ).__oceanleoGridUniverPaint = {
      ...painted,
      liveCells: listUniverSnapshotValues(live),
    };
    handleRef.current = { univer: created.univer, api };
    // 首帧就按当前档位收 chrome：普通档 ribbon / 公式栏在 Univer 画出来之前就是 off。
    applyChrome(modeRef.current);
    const workbook = api.getActiveWorkbook?.();
    (workbook as { setEditable?: (value: boolean) => void } | null)?.setEditable?.(
      !readonly,
    );
    return parkForDispose;

    /**
     * 卸载 cleanup：`dispose` **只**在这里，而且推到下一个宏任务。
     *
     * 为什么不能同步：Univer 的 UI 层自建了一个 React root（`createRoot(container)`），
     * `dispose()` 里同步 `root.unmount()`。我们这个 cleanup 跑在 React 的
     * `flushPassiveEffects` 里，此时 React 的 executionContext 带着 CommitContext，
     * 在里面同步卸另一个 root 就是控制台那条
     * `Attempted to synchronously unmount a root while React was already rendering`。
     *
     * 为什么是 `setTimeout(…, 0)` 而不是 `queueMicrotask`：React 18 自己也用微任务
     * （`scheduleMicrotask(flushSyncCallbacks)`）冲 sync lane，我们排的微任务与它的
     * 先后取决于谁先入队，不能证明一定落在提交之外；宏任务开的是一个新的 task，
     * 调用栈为空，React 不可能正处于渲染或提交中。
     *
     * 闪烁：舞台卸载时 React 已把容器 `<div>` 从 DOM 摘掉，Univer 的画布随容器一起
     * 消失；随后的 `dispose` 作用在已分离的节点上，屏幕上没有第二次变化。
     * `handleRef.current = null` 仍同步置空——卸载后任何路径都不该再拿到活句柄。
     */
    function parkForDispose() {
      const live = handleRef.current;
      handleRef.current = null;
      if (!live) return;
      const parked: ParkedUniver = {
        handle: live,
        timer: setTimeout(() => {
          if (parkedRef.current === parked) parkedRef.current = null;
          live.univer.dispose();
        }, 0),
      };
      parkedRef.current = parked;
    }
    // 切 mode 不许走进这个 effect：dispose 只发生在卸载。
  }, [snapshotReady]);

  /**
   * 模式 → chrome，同一帧内可见：`useLayoutEffect` 在 DOM 提交后、浏览器绘制前
   * 同步跑，页面行点「Univer」这一下与 ribbon 出现在同一帧。
   * 这里只切显示/隐藏，不碰实例：没有 `createUniver`、没有 `dispose`、没有 flush。
   */
  useLayoutEffect(() => {
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
          editor_capability: GRID_EDITOR_CAPABILITY,
          content_type: "grid",
          sheet_count: sheets.length,
          sheet_names: sheets.map((sheet) => sheet.name),
          delivery_format: GRID_SOURCE_FORMAT,
          chips: chipsManifest.chips.map((chip) => chip.id).join(","),
        },
        project: {
          schema: GRID_UNIVER_PROJECT_SCHEMA,
          data: snapshot,
        },
        editorManifest: {
          id: GRID_EDITOR_CAPABILITY,
          format: GRID_UNIVER_PROJECT_SCHEMA,
        },
        // 带 artifact identity 的素材保存成**同一件的新 revision**，不是另起一个 creation
        // （W2 保存契约；`tests/w2-editor-save-contract.test.mjs`）。旧核就是这么存的，
        // 旧核删掉后这条契约归 Univer 舞台。
        artifactRevision: {
          artifactType: "grid",
          provenance: {
            editorRevision: editRevision,
            sheetCount: sheets.length,
          },
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
          editor_project_url: saved.projectUrl,
        },
      }),
    };
  }, [item, save, status]);

  /**
   * 「重新计算」（规范 v2 §6 grid 行）。Univer 的公式引擎自己会算，但 `TODAY()` /
   * `NOW()` / `RAND()` 这类易变函数要刷新，得有人显式要求一次全量重算——
   * 这就是编辑栏上那一下：`getFormula().executeCalculation()`（forceCalculation）。
   */
  const recalculate = useCallback(() => {
    const api = handleRef.current?.api;
    const formula = api?.getFormula?.();
    if (!formula?.executeCalculation) {
      setStatus("表格内核还没准备好。");
      return;
    }
    formula.executeCalculation();
    setStatus("已重新计算全部公式。");
    bumpHistory();
  }, [bumpHistory]);

  /**
   * 源文件拿不到（签名 403 / rendition 解析失败）只给**一个**按钮「重新载入表格」，
   * 走 `officeSource.retry`：它换一版 rendition → `officeSource.item` 变 → 载入 effect
   * 重跑。不再同时给「刷新 source/full 后重试」——那是旧核为两条失败路径各配一个
   * 按钮的遗留，这里两条路径汇成一个 retry，两个按钮就是重复。
   */
  const documentActions = useMemo(
    () =>
      buildGridDocumentActions({
        recalculate,
        loading: loading || !snapshotReady,
        readonly,
        sourceFailed: Boolean(officeSource.error),
        reload: officeSource.retry,
      }),
    [
      loading,
      officeSource.error,
      officeSource.retry,
      readonly,
      recalculate,
      snapshotReady,
    ],
  );

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
        pages: { proLabel: GRID_PRO_LABEL },
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
          // 文档段：「重新计算」在最前（规范 v2 §6 grid 行），其后是失败时的重载/重试。
          ...documentActions,
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
          <div className="relative h-full w-full">
            {/*
              容器永远在树上：Univer 只认这个元素，加载态不能替换它，
              否则 snapshot 就位时 `containerRef.current` 还是 null。
            */}
            <div
              ref={containerRef}
              className="h-full w-full"
              {...{ [GRID_UNIVER_STAGE_ATTR]: "true" }}
              {...{ [GRID_UNIVER_MODE_ATTR]: mode }}
            />
            {!snapshotReady && (
              // 首次载入（读工程档 / xlsx、建实例之前）舞台不留白。
              <div
                className="absolute inset-0"
                data-grid-univer-loading="true"
              >
                <WorkbenchRouteLoading />
              </div>
            )}
          </div>
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
            key: advancedRecoveryKey(GRID_UNIVER_RECOVERY_EDITOR_ID, item),
            ready: snapshotReady && !loading,
            capture: () => currentSnapshot(),
            restore: (payload) => {
              // 只认 Univer 工作簿快照：旧核写下的 `{sheets:[…]}` 草稿被拒，不灌进 Univer。
              if (!isUniverWorkbookSnapshot(payload)) return false;
              const api = handleRef.current?.api;
              if (!api) return false;
              // 先建新簿再卸旧簿：先卸会让 Univer 空窗，新表常常不画。
              replaceUniverWorkbookWithSnapshot(api, structuredClone(payload));
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
