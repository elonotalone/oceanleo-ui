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

import { ensureAdvancedDraftExport } from "../advanced-draft-gates";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createUniver, IUndoRedoService, LocaleType, mergeLocales } from "@univerjs/presets";
import {
  ICanvasColorService,
  IRenderManagerService,
  UniverSheetsCorePreset,
} from "@univerjs/preset-sheets-core";
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
import type { LibraryItem } from "../library-data";
import { advancedSavedItem } from "../advanced-session";
import { useGridMaterialAdapter } from "./grid-univer/use-grid-material";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { downloadBlob, loadEditorProject, saveFileToLibrary } from "./doc-io";
import { renderGridPreviewPng } from "./editor-preview-raster";
import {
  buildGridXlsxFromUniverSnapshot,
  gridXlsxDroppedWarning,
  univerSnapshotToPreviewSheets,
} from "./grid-univer/xlsx-export";
import { emptyGridSheet, loadGridFile, loadGridSheets } from "./grid-model";
import { downloadConvertedCopy } from "./doc-family-download";
import {
  DOC_FAMILY_DOWNLOAD_FORMATS,
  docFamilyAcceptAttribute,
} from "./doc-family-formats";
import { importDocFamilyFile } from "./doc-family-import";
import { useOfficeArtifactSource } from "../office-editor";
import { getArtifactItem } from "../artifact-client";
import { imEnabledHere } from "../../lib/im/client";
import {
  bindJsonState,
  useCollabReadOnly,
  useCollabRoom,
  useCollabSaveGate,
} from "../collab";
import {
  GRID_COLLAB_EDITOR_KIND,
  createGridCollabBinder,
  createGridUniverPort,
  gridCollabPhase,
  gridFromEntities,
  gridToEntities,
  type GridCollabBinder,
  type GridUniverCollabApi,
  type GridWorkbookSnapshot,
} from "../collab/adapters/grid";
import { createGridLayoutStore } from "./grid-univer/collab-layout-store";
import { useUI } from "../../i18n/ui/useUI";
import { editorToolLabel } from "../workbench-routes";
import { usePluginCommandSurface } from "../plugin-command";
import { boundedAgentContent } from "../plugin-command/bounded-agent-content";
import { pluginTargetForLibraryItem } from "../active-agent-file";
import { SelectionToolbar } from "../SelectionToolbar";
import type { EditorMode } from "../hosted-editor/index";
import type { SelectionCommand } from "../selection-context";
import { usePluginMode } from "../plugin-chrome/plugin-mode";
import { usePluginTheme } from "../plugin-theme";
import { useGridUniverLive } from "./grid-univer/use-grid-univer-live";
import { WorkbenchRouteLoading } from "../advanced-routes/WorkbenchRouteLoading";
import {
  buildGridDocumentActions,
  gridSourceFailureMessage,
} from "./grid-univer/document-actions";
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
import { gridStageTopInset } from "./grid-univer/chrome";
import { gridDownloadBaseName, gridDownloadFileName, gridDownloadFormatLabel } from "./grid-univer/download";
import { noteGridProbe, setGridProbe } from "./grid-univer/acceptance-probe";
import { gridRecoveryReady } from "./grid-univer/open-settle";
import {
  GRID_PRO_LABEL,
  GRID_UNIVER_RECOVERY_EDITOR_ID,
  type GridLoadIdentity,
  gridExpectedSourcePresent,
  gridOpenFailedClosed,
  gridProjectSource,
  gridSnapshotIsUsable,
  isUniverWorkbookSnapshot,
  listUniverSnapshotValues,
  planGridSameDocumentOpen,
  gridShouldSkipSourceReload,
  replaceUniverWorkbookWithSnapshot,
  sheetsFromLegacyProjectData,
} from "./grid-univer/same-document";
import { EditorSourceFailurePanel } from "./EditorSourceFailurePanel";
import {
  recordUserMutation,
  userEditItemKey,
  userMutationGeneration,
} from "../user-edit-session";

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

export type GridUserEditOrigin = "person-write" | "collab-activity" | "load";

/**
 * Grid person-write choke used by `bumpHistory`. Collab activity and load
 * may mark dirty in the binder, but they must not open autosave.
 */
export function applyGridUserEditSession(
  item: { key?: string; id?: string } | null | undefined,
  origin: GridUserEditOrigin,
): number {
  const key = userEditItemKey(item);
  if (origin !== "person-write") return userMutationGeneration(key);
  return recordUserMutation(key);
}

function emptySnapshot(title: string): Partial<IWorkbookData> {
  return gridSheetsToUniverSnapshot([emptyGridSheet()], { name: title }).data;
}

/** 协同里别人（AI / 专业模式）存的新版本：读成 Univer 工作簿快照；读不出来返回 null。 */
async function readGridRevisionSnapshot(
  revision: LibraryItem,
  title: string,
): Promise<Partial<IWorkbookData> | null> {
  const { schema, url } = gridProjectSource(revision);
  if (schema === GRID_UNIVER_PROJECT_SCHEMA && url) {
    const snapshot = await loadEditorProject<Partial<IWorkbookData>>(url, GRID_UNIVER_PROJECT_SCHEMA);
    if (!gridSnapshotIsUsable(snapshot)) throw new Error("表格源尚未成功载入，未保存空白表。");
    return snapshot;
  }
  const officeSheets = await loadGridSheets(revision);
  const planned = planGridSameDocumentOpen({
    schema,
    title,
    univerSnapshot: null,
    legacySheets: null,
    officeSheets,
  });
  if (planned.kind === "empty") return null;
  return planned.snapshot || null;
}

export function GridUniverStage({
  item,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const officeSource = useOfficeArtifactSource(item);
  const tt = useUI();
  /**
   * effect 体内用的翻译函数走 ref：`tt` 是 locale provider 所有的函数，进了加载 /
   * 挂载 effect 的依赖数组就是 `tests/effect-tt-dependency.test.mjs` 拦的那条引信。
   */
  const ttRef = useRef(tt);
  ttRef.current = tt;
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
  // D7：主题只跟随站点（`usePluginTheme` 由外壳解析成 light / dark）。
  const dark = usePluginTheme("grid").theme === "dark";
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [sourceFailed, setSourceFailed] = useState(false);
  const [sourceFailureReason, setSourceFailureReason] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [conversion, setConversion] = useState<GridConversionState>("converted");
  const [conversionNotice, setConversionNotice] = useState("");
  const [editRevision, setEditRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  /** 上一次成功载入的文档身份；见 gridShouldSkipSourceReload。 */
  const loadedIdentityRef = useRef<GridLoadIdentity | null>(null);
  const sourceFailedRef = useRef(false);
  const sourceReadyRef = useRef(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [xlsxExporting, setXlsxExporting] = useState(false);
  const [toolbarEpoch, setToolbarEpoch] = useState(0);
  const xlsxExportBusyRef = useRef(false);
  const readonly =
    conversion === "readonly" ||
    conversion === "converting" ||
    conversion === "failed";

  // ── 多人同改（work-chat W12）：房间由 W11 提供，这里只接线 ──
  const collabRoom = useCollabRoom({
    resource: item.artifactId
      ? { kind: "artifact", id: String(item.artifactId) }
      : null,
    editorKind: GRID_COLLAB_EDITOR_KIND,
    enabled: imEnabledHere(),
  });
  const collabSaveGate = useCollabSaveGate(collabRoom);
  const collabViewOnly = useCollabReadOnly(collabRoom);
  const collabViewOnlyRef = useRef(collabViewOnly);
  collabViewOnlyRef.current = collabViewOnly;
  const collabWasLiveRef = useRef(false);
  const collabPhase = gridCollabPhase({
    room: collabRoom,
    wasLive: collabWasLiveRef.current,
  });
  useEffect(() => {
    if (collabPhase === "live") collabWasLiveRef.current = true;
    if (collabPhase === "off") collabWasLiveRef.current = false;
  }, [collabPhase]);
  const collabOn = collabPhase !== "off";
  /** 还在等第一次同步，或者在房间里只有查看权限 / 专业模式锁在别人手里：画布不让改。 */
  const collabBlocked =
    collabOn && (collabPhase === "waiting" || collabViewOnly);
  const editBlocked = readonly || collabBlocked || loading || !snapshotReady || sourceFailed;
  const editBlockedRef = useRef(editBlocked);
  editBlockedRef.current = editBlocked;
  // 撤销栈判据只在真只读时不算本人改动；等首同步时画布仍能打字（实测），打了就是本人的改动。
  const personWriteBlockedRef = useRef(false);
  personWriteBlockedRef.current = readonly || (collabOn && collabViewOnly) || loading || !snapshotReady || sourceFailed;
  const collabOnRef = useRef(collabOn);
  collabOnRef.current = collabOn;
  const collabBinderRef = useRef<GridCollabBinder | null>(null);
  const [collabBound, setCollabBound] = useState(false);
  /** 本标签页自己存出的 revision：房间把它当「别人存的新版本」回送时不许整本换回（会冲掉刚打的字）。 */
  const ownRevisionsRef = useRef(new Set<string>());
  /** 别人存了新版本后，下一次保存要以它为基线（否则版本冲突）。 */
  const externalItemRef = useRef<LibraryItem | null>(null);

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
  const liveItemRef = useRef(item);
  liveItemRef.current = item;

  const bumpHistory = useCallback(() => {
    noteGridProbe("person-write");
    applyGridUserEditSession(liveItemRef.current, "person-write");
    setEditRevision((value) => value + 1);
    setDirty(true);
    setToolbarEpoch((value) => value + 1);
  }, []);

  /**
   * 取源那两样东西走 ref，不进加载 effect 的依赖数组。
   *
   * 台账「正在读取工作簿…」永不消失的那条闭环（`tests/rendition-callback-identity.test.mjs`）：
   * rendition 层每渲染新建一个 `resourceFailed` 回调 → 进依赖数组 → 每渲染重跑一次加载 →
   * 遮罩再也下不来。加载只按**值**起跑（item 的 id / url / 工程档 pin、rendition 的
   * url / version），回调与派生对象从 ref 里现取。
   */
  const officeItemRef = useRef(officeSource.item);
  officeItemRef.current = officeSource.item;
  const resourceFailedRef = useRef(officeSource.resourceFailed);
  resourceFailedRef.current = officeSource.resourceFailed;
  const officeErrorRef = useRef(officeSource.error);
  officeErrorRef.current = officeSource.error;
  const { schema: projectSchema, url: projectUrl } = gridProjectSource(item);
  // 长期库件还在解析签名源（rendition 转圈、url 还是空）时不要先开一张空表：
  // 等 url 到了再起跑一次。有工程档的不等——工程档本身就是源。
  const waitingForSource =
    !projectUrl && officeSource.loading && !officeSource.url;
  const loadKey = [
    item.artifactId || "",
    item.url || "",
    projectSchema,
    projectUrl,
    officeSource.url || "",
    String(officeSource.version ?? ""),
    waitingForSource ? "wait" : "go",
    String(reloadNonce),
  ].join("\u0000");

  useEffect(() => {
    const identity: GridLoadIdentity = {
      artifactId: item.artifactId ? String(item.artifactId) : "",
      revisionId: item.revisionId ? String(item.revisionId) : "",
      nonce: reloadNonce,
    };
    if (waitingForSource) {
      sourceReadyRef.current = sourceReadyRef.current && gridShouldSkipSourceReload({
        loaded: loadedIdentityRef.current, next: identity, dirty: dirtyRef.current,
      });
      setLoading(true);
      setStatus(ttRef.current("正在载入表格"));
      return;
    }
    // 只是签名地址换发（同一 artifact / revision）：不重载、不清未保存的编辑。
    if (
      gridShouldSkipSourceReload({
        loaded: loadedIdentityRef.current,
        next: identity,
        dirty: dirtyRef.current,
      })
    ) {
      return;
    }
    loadedIdentityRef.current = null;
    sourceReadyRef.current = false;
    noteGridProbe("source-reload");
    let cancelled = false;
    const title = item.title || ttRef.current("工作簿");
    setLoading(true);
    setSourceFailed(false);
    sourceFailedRef.current = false;
    setSourceFailureReason("");
    setDirty(false);
    setStatus(ttRef.current("正在载入表格"));
    const failClosed = (reason: string) => {
      sourceReadyRef.current = false;
      loadedIdentityRef.current = null;
      snapshotRef.current = null;
      sourceFailedRef.current = true;
      setSourceFailed(true);
      setSourceFailureReason(reason);
      setSnapshotReady(false);
      setDirty(false);
      setStatus(reason);
    };
    (async () => {
      try {
        const schema = projectSchema;
        let univerSnapshot: Partial<IWorkbookData> | null = null;
        let legacySheets: ReturnType<typeof sheetsFromLegacyProjectData> = null;
        let officeSheets: ReturnType<typeof emptyGridSheet>[] | null = null;

        if (schema === GRID_UNIVER_PROJECT_SCHEMA && projectUrl) {
          univerSnapshot = await loadEditorProject<Partial<IWorkbookData>>(
            projectUrl,
            GRID_UNIVER_PROJECT_SCHEMA,
          );
          if (!gridSnapshotIsUsable(univerSnapshot)) throw new Error(ttRef.current("表格源尚未成功载入，未保存空白表。"));
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
            officeItemRef.current,
            undefined,
            () => resourceFailedRef.current?.(),
          );
        }
        if (cancelled) return;
        // 协同里画布内容归房间管：整本替换会被当成本地改动推给所有人。
        if (collabOnRef.current && handleRef.current) return;
        const planned = planGridSameDocumentOpen({
          schema,
          title,
          univerSnapshot,
          legacySheets,
          officeSheets,
        });
        const expectedSource = gridExpectedSourcePresent({
          artifactId: item.artifactId,
          url: item.url,
          projectUrl,
          officeUrl: officeItemRef.current.url || officeSource.url,
        });
        if (
          gridOpenFailedClosed({
            expectedSource,
            planKind: planned.kind,
          })
        ) {
          failClosed(
            gridSourceFailureMessage(officeErrorRef.current || "", ttRef.current),
          );
          return;
        }
        snapshotRef.current = planned.snapshot || emptySnapshot(title);
        // 实例已在（源晚到、或换了签名版本）：就地重画，不重建 Univer。
        if (handleRef.current) {
          replaceUniverWorkbookWithSnapshot(
            handleRef.current.api,
            structuredClone(snapshotRef.current),
          );
          live.resetBaseline();
        }
        if (planned.kind === "legacy-stored") {
          legacySheetsRef.current = planned.sheets;
          setConversion("readonly");
          setConversionNotice(
            planned.snapshot
              ? ttRef.current(GRID_LEGACY_READONLY_NOTICE)
              : `${ttRef.current(GRID_LEGACY_READONLY_NOTICE)} ${planned.reason || ""}`.trim(),
          );
        } else {
          legacySheetsRef.current = null;
          setConversion("converted");
          setConversionNotice("");
        }
        loadedIdentityRef.current = identity;
        sourceReadyRef.current = true;
        setSnapshotReady(true);
      } catch (caught) {
        if (cancelled) return;
        failClosed(
          gridSourceFailureMessage(
            caught instanceof Error
              ? caught.message
              : ttRef.current("表格载入失败。"),
            ttRef.current,
          ),
        );
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
    // 只按值 key 起跑；`item` / `officeSource.*` 对象与回调不进依赖数组（见 loadKey 注释）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey]);

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
      darkMode: darkRef.current,
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
      snapshotRef.current || emptySnapshot(item.title || ttRef.current("工作簿")),
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
      !editBlockedRef.current,
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

  // 主题、本人改动判据（撤销栈）、编辑栏取值：见 `grid-univer/use-grid-univer-live.ts`。
  const live = useGridUniverLive({
    handleRef,
    containerRef,
    ready: snapshotReady,
    dark,
    ids: {
      undo: IUndoRedoService,
      canvasColor: ICanvasColorService,
      renderManager: IRenderManagerService,
    },
    editBlockedRef: personWriteBlockedRef,
    onPersonWrite: bumpHistory,
  });

  useEffect(() => {
    const workbook = handleRef.current?.api.getActiveWorkbook?.();
    (workbook as { setEditable?: (value: boolean) => void } | null)?.setEditable?.(
      !editBlocked,
    );
  }, [editBlocked]);

  /**
   * 协同绑定：画布建好后把它接进房间。播种 / 同步 / 本地变更 / 选区全在
   * `createGridCollabBinder`（可单测）；这里只给它真实的 Univer 端口。
   * 依赖里只放「是否在协同」，同步状态的变化由绑定器自己订阅房间处理。
   */
  useEffect(() => {
    if (!collabRoom || !collabOn || !snapshotReady) return undefined;
    if (!handleRef.current) return undefined;
    const room = collabRoom;
    const port = createGridUniverPort({
      getApi: () => handleRef.current?.api as unknown as GridUniverCollabApi,
      replaceWorkbook: (next: GridWorkbookSnapshot) => {
        const api = handleRef.current?.api;
        if (!api) return;
        const payload = structuredClone(next) as Partial<IWorkbookData>;
        replaceUniverWorkbookWithSnapshot(api, payload);
        live.resetBaseline();
        snapshotRef.current = payload;
        applyChrome(modeRef.current);
        const workbook = api.getActiveWorkbook?.();
        (
          workbook as { setEditable?: (value: boolean) => void } | null
        )?.setEditable?.(!editBlockedRef.current);
      },
    });
    const binder = createGridCollabBinder({
      room,
      port,
      bind: (opts) =>
        bindJsonState<GridWorkbookSnapshot>({
          ...opts,
          room,
        }) as unknown as ReturnType<
          Parameters<typeof createGridCollabBinder>[0]["bind"]
        >,
      // 行列按 id 存：两个人同时插行、删列、排序互相不冲掉；老格式文档第一次打开时就地迁移。
      layoutStore: createGridLayoutStore({
        doc: room.doc,
        canWrite: () => !collabViewOnlyRef.current,
      }),
      onFullReplace: (reason) => {
        noteGridProbe(`collab-replace:${reason}`);
        setStatus(ttRef.current("别人调整了表格的一部分设置，表格已重新载入。"));
      },
      onActivity: (origin) => {
        noteGridProbe(`collab-${origin}`);
        // 本地那一侧：本人的改动已由撤销栈判据记过（bumpHistory）；其余是 Univer 载入后
        // 自己的回写（公式、换簿），不算改动——否则只是打开就标脏、自动存一版（R2 实测 14 次）。
        if (origin !== "remote") return;
        // The acceptance readback must reflect the post-sync model, not only
        // the snapshot installed before the room's initial apply.
        queueMicrotask(() => setGridProbe("liveCells", listUniverSnapshotValues(currentSnapshot())));
        applyGridUserEditSession(liveItemRef.current, "collab-activity");
        setEditRevision((value) => value + 1);
        setDirty(true);
      },
    });
    collabBinderRef.current = binder;
    setCollabBound(true);
    return () => {
      binder.destroy();
      if (collabBinderRef.current === binder) collabBinderRef.current = null;
      setCollabBound(false);
    };
    // applyChrome 稳定；room 换了或协同开关变了才重绑。
  }, [applyChrome, collabOn, collabRoom, snapshotReady]);

  /** 别人（AI / 专业模式）存了新版本：只有保存者收到；把新版本整本换进画布并写回房间。 */
  useEffect(() => {
    if (!collabRoom || !collabOn) return undefined;
    const artifactId = item.artifactId ? String(item.artifactId) : "";
    if (!artifactId) return undefined;
    let alive = true;
    let ticket = 0;
    const off = collabRoom.onExternalRevision((revisionId) => {
      if (ownRevisionsRef.current.has(String(revisionId))) return;
      ticket += 1;
      const mine = ticket;
      void (async () => {
        const fetched = await getArtifactItem(artifactId, revisionId);
        if (!alive || mine !== ticket || !fetched.ok || !fetched.data) return;
        const revision = fetched.data as LibraryItem;
        const snapshot = await readGridRevisionSnapshot(
          revision,
          revision.title || ttRef.current("工作簿"),
        );
        if (!alive || mine !== ticket || !snapshot) return;
        // 取版本期间本页的保存回来了、正是这一版：画布已经是它（或更新），不换。
        if (ownRevisionsRef.current.has(String(revisionId))) return;
        const binder = collabBinderRef.current;
        if (!binder) return;
        noteGridProbe(`external-adopt:${revisionId}`);
        binder.adopt(snapshot as GridWorkbookSnapshot);
        externalItemRef.current = revision;
        collabRoom.markSaved(revisionId);
        setDirty(false);
      })().catch(() => {
        // 读不出新版本：保持当前画布，下一次有新版本再试。
      });
    });
    return () => {
      alive = false;
      off();
    };
  }, [collabOn, collabRoom, item.artifactId]);

  useEffect(() => {
    externalItemRef.current = null;
  }, [item.revisionId]);

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
      setConversionNotice(tt("找不到可以转换的旧表格。"));
      return;
    }
    const planned = planGridLegacyConversion({
      sheets,
      schema: GRID_LEGACY_PROJECT_SCHEMA,
      title: item.title || tt("工作簿"),
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
  }, [bumpHistory, item.title, tt]);

  const runControl = useCallback(
    (command: SelectionCommand) => {
      if (sourceFailedRef.current) {
        setStatus(sourceFailureReason || tt("表格源尚未成功载入，不能改。"));
        return;
      }
      if (readonly) {
        setStatus(tt(GRID_LEGACY_READONLY_NOTICE));
        return;
      }
      if (collabBlocked) {
        setStatus(tt(collabPhase === "waiting" ? "正在与协作者同步…" : "现在是只读状态，不能修改。"));
        return;
      }
      const port = livePort();
      if (!port) {
        setStatus(tt("表格内核还没准备好。"));
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
    },
    [bumpHistory, collabBlocked, collabPhase, livePort, readonly, sourceFailureReason, tt],
  );

  const undo = useCallback(() => {
    void handleRef.current?.api.undo?.();
    bumpHistory();
  }, [bumpHistory]);
  const redo = useCallback(() => {
    void handleRef.current?.api.redo?.();
    bumpHistory();
  }, [bumpHistory]);

  const workbookBlob = useCallback(
    async () => {
      // 直接从 Univer 快照写 XLSX（不经过只有行/格式/合并的 GridSheet），
      // 写不出去的东西进 dropped，原样告诉用户。
      const { blob, dropped } = await buildGridXlsxFromUniverSnapshot(
        currentSnapshot(),
        { title: item.title },
      );
      return { blob, warning: gridXlsxDroppedWarning(dropped) };
    },
    [currentSnapshot, item.title],
  );

  const exportXlsx = useCallback(async () => {
    if (!await ensureAdvancedDraftExport(item.key || item.id)) return;
    if (xlsxExportBusyRef.current) return;
    xlsxExportBusyRef.current = true;
    setXlsxExporting(true);
    try {
      const { blob, warning } = await workbookBlob();
      downloadBlob(gridDownloadFileName(item.title || "workbook", "xlsx"), blob);
      setStatus(warning);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : tt("导出 XLSX 失败"));
    } finally {
      xlsxExportBusyRef.current = false;
      setXlsxExporting(false);
    }
  }, [item.title, tt, workbookBlob]);

  const downloadAs = useCallback(
    async (extension: string): Promise<string> => {
      if (!await ensureAdvancedDraftExport(item.key || item.id)) return "";
      try {
        if (extension === "xlsx") {
          await exportXlsx();
          return "";
        }
        if (extension === "csv") {
          const sheets = univerSnapshotToGridSheets(currentSnapshot());
          const first = sheets[0];
          if (!first) return tt("没有可导出的工作表。");
          const rows = first.rows.map((row) => row.join(",")).join("\n");
          downloadBlob(
            gridDownloadFileName(item.title || "workbook", "csv"),
            new Blob([`\uFEFF${rows}`], { type: "text/csv;charset=utf-8" }),
          );
          return "";
        }
        if (extension === "pdf") {
          const title = gridDownloadBaseName(item.title || "workbook");
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
        return tt("这里没有 {ext} 这个下载格式。", { ext: extension.toUpperCase() });
      } catch (caught) {
        return caught instanceof Error ? caught.message : tt("导出失败。");
      }
    },
    [currentSnapshot, exportXlsx, item.title, tt, workbookBlob],
  );

  const save = useCallback(async () => {
    if (sourceFailedRef.current || !sourceReadyRef.current || !handleRef.current) {
      setStatus(sourceFailureReason || tt("表格源尚未成功载入，未保存空白表。"));
      return null;
    }
    if (readonly) {
      setStatus(tt(GRID_LEGACY_READONLY_NOTICE));
      return null;
    }
    // 协同里只有房间里的保存者存版本；别人的画布内容会经房间同步给它。
    if (!collabSaveGate) return null;
    const baseItem = externalItemRef.current ?? item;
    const snapshot = currentSnapshot();
    if (!gridSnapshotIsUsable(snapshot)) {
      setStatus(tt("表格源尚未成功载入，未保存空白表。"));
      return null;
    }
    collabBinderRef.current?.flush();
    snapshotRef.current = snapshot;
    // `sheets` 只用来画预览图和写 meta；交付的 XLSX 直接从快照生成。
    const sheets = univerSnapshotToGridSheets(snapshot);
    let xlsxDropped: string[] = [];
    const title = `${item.title || tt("工作簿")}-${tt("编辑版")}`;
    const fileStem =
      title.replace(/[\\/:*?"<>|]/g, "-").trim().slice(0, 180) || "workbook";
    try {
      const result = await saveFileToLibrary({
        item: baseItem,
        siteId,
        fallbackSite: "excel",
        idempotencyKey: `grid-univer:${editRevision}:${String(item.id).slice(-80)}`,
        createFile: async () => {
          const built = await buildGridXlsxFromUniverSnapshot(snapshot, {
            title,
          });
          xlsxDropped = built.dropped;
          return new File([built.blob], `${fileStem}.xlsx`, {
            type: GRID_SOURCE_MEDIA_TYPE,
          });
        },
        createPreview: () =>
          renderGridPreviewPng(univerSnapshotToPreviewSheets(snapshot), {
            headerRow: true,
          }),
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
        setStatus(result.error || tt("保存失败"));
        return null;
      }
      setDirty(false);
      noteGridProbe(`saved:${result.revisionId || ""}`);
      if (result.revisionId) ownRevisionsRef.current.add(String(result.revisionId));
      // Keep the server-confirmed head locally: the host may retain the opening
      // item until navigation, but the next save must not CAS against that head.
      externalItemRef.current = result.item ?? advancedSavedItem(baseItem, {
        url: result.url, versionId: result.versionId, title: result.title,
      });
      if (collabRoom && result.revisionId) collabRoom.markSaved(result.revisionId);
      setStatus(gridXlsxDroppedWarning(xlsxDropped));
      return result;
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : tt("保存失败"));
      return null;
    }
  }, [
    chipsManifest.chips,
    collabRoom,
    collabSaveGate,
    currentSnapshot,
    editRevision,
    item,
    readonly,
    siteId,
    sourceFailureReason,
    tt,
  ]);

  const saveBeforeNewConversation = useCallback(async () => {
    // 协同里不是保存者：没有要存的东西，别拦住「新开一轮对话」。
    if (!collabSaveGate) return { ok: true as const, item };
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
  }, [collabSaveGate, item, save, status]);

  /**
   * 「重新计算」（规范 v2 §6 grid 行）。Univer 的公式引擎自己会算，但 `TODAY()` /
   * `NOW()` / `RAND()` 这类易变函数要刷新，得有人显式要求一次全量重算——
   * 这就是编辑栏上那一下：`getFormula().executeCalculation()`（forceCalculation）。
   */
  const recalculate = useCallback(() => {
    const api = handleRef.current?.api;
    const formula = api?.getFormula?.();
    if (!formula?.executeCalculation) {
      setStatus(tt("表格内核还没准备好。"));
      return;
    }
    formula.executeCalculation();
    setStatus(tt("已重新计算全部公式。"));
    bumpHistory();
  }, [bumpHistory, tt]);

  /**
   * 源文件拿不到（签名 403 / rendition 解析失败）只给**一个**按钮「重新载入表格」，
   * 走 `officeSource.retry`：它换一版 rendition → `officeSource.item` 变 → 载入 effect
   * 重跑。不再同时给「刷新 source/full 后重试」——那是旧核为两条失败路径各配一个
   * 按钮的遗留，这里两条路径汇成一个 retry，两个按钮就是重复。
   */
  const documentActions = useMemo(
    () =>
      buildGridDocumentActions(
        {
          recalculate,
          loading: loading || !snapshotReady,
          readonly: editBlocked,
          sourceFailed: sourceFailed || Boolean(officeSource.error),
          reload: () => {
            officeSource.retry();
            setReloadNonce((value) => value + 1);
          },
        },
        tt,
      ),
    [
      loading,
      officeSource.error,
      officeSource.retry,
      editBlocked,
      recalculate,
      snapshotReady,
      sourceFailed,
      tt,
    ],
  );

  const importLocalFile = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      if (editBlockedRef.current) {
        setStatus(ttRef.current("现在是只读状态，不能修改。"));
        return;
      }
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

  // 素材库：点一张图片 = 在当前格子插浮动图片（`grid-univer/use-grid-material.ts`）。
  useGridMaterialAdapter({ item, getApi: () => handleRef.current?.api, blockedRef: editBlockedRef, tt });

  // agent 指令面：一条 `run` 一条路，写与不写的判断全在 `runGridAgentCommand`
  // 里（V3-red-3）。这里不许再出现任何直接调 Facade 的分支——
  // `tests/grid-univer-agent-review-gate.test.mjs` 会扫这段源码把它钉住。
  usePluginCommandSurface({
    editorId: "grid",
    target: () => pluginTargetForLibraryItem(item, "grid", editRevision),
    agentContext: () => {
      if (loading || !snapshotReady || sourceFailedRef.current) {
        return { ready: false, reason: sourceFailureReason || "Univer 工作簿当前源尚未就绪。" };
      }
      const snapshot = currentSnapshot();
      const rawSheets = snapshot.sheets && typeof snapshot.sheets === "object"
        ? snapshot.sheets as Record<string, unknown>
        : {};
      const sheets = Object.entries(rawSheets).map(([sheetId, value]) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return { sheetId, cells: [] };
        }
        const sheet = value as Record<string, unknown>;
        const cellData = sheet.cellData && typeof sheet.cellData === "object"
          ? sheet.cellData as Record<string, unknown>
          : {};
        const cells = Object.entries(cellData).flatMap(([rowKey, rowValue]) => {
          if (!rowValue || typeof rowValue !== "object" || Array.isArray(rowValue)) return [];
          return Object.entries(rowValue as Record<string, unknown>).flatMap(([columnKey, cellValue]) => {
            if (!cellValue || typeof cellValue !== "object" || Array.isArray(cellValue)) return [];
            const cell = cellValue as Record<string, unknown>;
            return cell.v === undefined && cell.f === undefined ? [] : [{
              row: Number(rowKey) + 1,
              column: Number(columnKey) + 1,
              value: cell.v,
              formula: cell.f,
            }];
          });
        });
        return {
          sheetId,
          name: sheet.name,
          cells,
        };
      });
      return boundedAgentContent({
        title: item.title,
        revision: editRevision,
        sheets,
        currentNonEmptyCells: listUniverSnapshotValues(snapshot),
      }, "这是 Univer 当前实时工作簿快照中的真实单元格值和公式，不是行列计数；只依据已提供的格子修改。");
    },
    describe: gridAgentCommandSpecs,
    state: () => ({
      mode,
      conversion,
      revision: editRevision,
      chips: chipsManifest.chips.map((chip) => chip.id),
      chipCount: GRID_AGENT_CHIPS.length,
    }),
    run: (id, params) =>
      sourceFailedRef.current
        ? {
            ok: false,
            message: sourceFailureReason || "表格源尚未成功载入，指令没有执行。",
          }
        : runGridAgentCommand({
            id,
            params,
            port: livePort(),
            revision: editRevision,
            readonly: editBlocked,
            readonlyNotice: tt(
              readonly ? GRID_LEGACY_READONLY_NOTICE : "现在是只读状态，不能修改。",
            ),
            submit: submitAgentReviewProposal,
            onWrite: bumpHistory,
          }),
  });

  // 恢复草稿等协同首同步把房间内容套进画布之后再开始（`grid-univer/open-settle.ts`）。
  const recoveryReady = gridRecoveryReady({
    snapshotReady, loading, sourceFailed, collabOn, collabPhase, collabBound,
  });
  useEffect(() => {
    setGridProbe("state", { editRevision, dirty, collab: collabPhase, ready: recoveryReady });
  }, [collabPhase, dirty, editRevision, recoveryReady]);

  const selectionContext = useMemo(
    () =>
      ({
        ...gridUniverSelectionContext({
          revision: editRevision + toolbarEpoch,
          kind: "grid-cell",
          tt,
          selection: live.read?.selection,
          sheetId: live.read?.sheetId,
          style: live.read?.style,
          numberType: live.read?.numberType,
        }),
        bar: "text" as const,
      }),
    [editRevision, live.read, toolbarEpoch, tt],
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
        collab: {
          room: collabRoom,
          artifact: item.artifactId
            ? {
                id: String(item.artifactId),
                title: item.title || "",
                editorKind: GRID_COLLAB_EDITOR_KIND,
              }
            : null,
        },
        contextToolbar:
          readonly ? null : (
            <SelectionToolbar
              context={selectionContext}
              onCommand={runControl}
              accent={accent}
            />
          ),
        history: {
          canUndo: live.history.canUndo,
          canRedo: live.history.canRedo,
          undo,
          redo,
        },
        mode: {
          current: mode,
          setMode: (next) => {
            setMode(next);
          },
        },
        pages: { proLabel: GRID_PRO_LABEL },
        directDownload: {
          id: "grid-export-xlsx",
          label: tt("直接下载 {fmt}", { fmt: gridDownloadFormatLabel("xlsx", tt) }),
          icon: "download",
          busyLabel: tt("导出中…"),
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
                  label: tt("转换为新表格"),
                  disabled: conversion === "converting",
                  onTrigger: convertLegacy,
                },
              ]
            : []),
          ...DOC_FAMILY_DOWNLOAD_FORMATS.grid.slice(1).map((format) => ({
            id: `grid-export-${format.extension}`,
            label: tt("下载 {fmt}", { fmt: gridDownloadFormatLabel(format.extension, tt) }),
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
          // 普通模式留出停靠编辑栏的高度，栏不盖列头（`gridStageTopInset`）。
          <div
            className="relative h-full w-full"
            style={{ paddingTop: gridStageTopInset(mode) }}
          >
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
            {sourceFailed ? (
              <EditorSourceFailurePanel
                message={sourceFailureReason || gridSourceFailureMessage("", tt)}
                onReload={() => {
                  officeSource.retry();
                  setReloadNonce((value) => value + 1);
                }}
                variant="overlay"
              />
            ) : !snapshotReady ? (
              // 首次载入（读工程档 / xlsx、建实例之前）舞台不留白。
              <div
                className="absolute inset-0"
                data-grid-univer-loading="true"
              >
                <WorkbenchRouteLoading />
              </div>
            ) : null}
          </div>
        ),
        status:
          conversionNotice ||
          (collabPhase === "waiting" ? tt("正在与协作者同步…") : "") ||
          sourceFailureReason ||
          (officeSource.error
            ? gridSourceFailureMessage(officeSource.error, tt)
            : "") ||
          status ||
          (loading || officeSource.loading ? tt("正在载入表格") : ""),
        persistence: {
          dirty: dirty && !sourceFailed && snapshotReady,
          editRevision,
          // 协同里只有保存者自动存版本；别人的改动由它存。
          autoSave: !readonly && collabSaveGate && !sourceFailed && snapshotReady,
          flush: saveBeforeNewConversation,
          recovery: {
            // 不接草稿层（不给 draftSchema）：草稿层下第 2 次起的改动只写隐藏「草稿」root、
            // 顶栏照报「已保存」却不成新版本（R2 实测，同 W07）。每次保存都走版本提交（D11 §5.5）。
            key: advancedRecoveryKey(GRID_UNIVER_RECOVERY_EDITOR_ID, item),
            ready: recoveryReady,
            capture: () => {
              if (sourceFailedRef.current || !sourceReadyRef.current || !snapshotReady || !handleRef.current) return null;
              const snapshot = currentSnapshot();
              return gridSnapshotIsUsable(snapshot) ? snapshot : null;
            },
            restore: (payload) => {
              // 只认 Univer 工作簿快照：旧核写下的 `{sheets:[…]}` 草稿被拒，不灌进 Univer。
              if (!isUniverWorkbookSnapshot(payload)) return false;
              if (!gridSnapshotIsUsable(payload)) return false;
              const api = handleRef.current?.api;
              if (!api) return false;
              // 先建新簿再卸旧簿：先卸会让 Univer 空窗，新表常常不画。
              replaceUniverWorkbookWithSnapshot(api, structuredClone(payload));
              live.resetBaseline();
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
