"use client";

import { ensureAdvancedDraftExport, flushAdvancedDraftGate } from "../advanced-draft-gates";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import dynamic from "next/dynamic";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { resolveEditorCore } from "../editor-core-flags";
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
import {
  CHART_COLLAB_ROOT,
  chartFromEntities,
  chartSelectionKeys,
  chartSeriesKey,
  chartToEntities,
} from "../collab/adapters/chart";
import { useEntityCollab } from "../collab/adapters/use-entity-collab";
import { safeSelectionColor, useCollabSelections } from "../collab/adapters/visual-selection";
import type { ChartDocumentV1 } from "../chart-editor/chart-schema";
import { libraryContentDescriptor, type LibraryItem } from "../library-data";
import { editorToolLabel } from "../workbench-routes";
import { usePluginCommandSurface } from "../plugin-command";
import { createChartCommandSurface } from "../chart-editor/chart-command-surface";
import { visualImportPlan } from "../media-editors/visual-formats";
import { usePluginMode } from "../plugin-chrome/plugin-mode";
import { PluginModeSwitchGate, useModeSwitchReady } from "./mode-switch-gate";
import {
  resolveW19Handoff,
  stashW19EnterHandoff,
  useW19ProSavedRevision,
  w19ItemKey,
  w19RemountKey,
} from "./w19-handoff-store";

const ChartNextStage = dynamic(
  () =>
    import("../chart-editor/ChartNextStage").then(
      (module) => module.ChartNextStage,
    ),
  { ssr: false, loading: () => null },
);

export function ChartRoute(props: AdvancedContentWorkbenchProps) {
  if (resolveEditorCore("chart-editor") === "next") {
    return <ChartNextStage {...props} />;
  }
  return <ChartLegacyRoute {...props} />;
}

/** 「编辑 ⇄ 专业编辑」经过渡门：旧面留到新面 ready，中间是舞台内的切换覆盖层。 */
function ChartLegacyRoute(props: AdvancedContentWorkbenchProps) {
  const enterProRef = useRef<(() => Promise<unknown>) | null>(null);
  return (
    <PluginModeSwitchGate
      pluginId="chart-editor"
      beforeEnterPro={() => enterProRef.current?.() ?? Promise.resolve()}
      renderNormal={() => (
        <ChartLegacyFace {...props} enterProRef={enterProRef} />
      )}
      renderPro={() => <ChartNextStage {...props} />}
    />
  );
}

function ChartLegacyFace({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
  enterProRef,
}: AdvancedContentWorkbenchProps & {
  enterProRef: MutableRefObject<(() => Promise<unknown>) | null>;
}) {
  const saved = useW19ProSavedRevision<typeof item>(w19ItemKey("chart-editor", item));
  const liveItem = saved ?? item;
  return (
    <ChartLegacyBody
      key={w19RemountKey(liveItem)}
      item={liveItem}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      onClose={onClose}
      enterProRef={enterProRef}
      sourceItem={item}
    />
  );
}

function ChartLegacyBody({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
  enterProRef,
  sourceItem,
}: AdvancedContentWorkbenchProps & {
  enterProRef: MutableRefObject<(() => Promise<unknown>) | null>;
  sourceItem: AdvancedContentWorkbenchProps["item"];
}) {
  // 多人同改：编辑器先于房间创建（房间要读图表文档），所以「只读」「存成功」走 state / ref 回填。
  const [collabReadOnly, setCollabReadOnly] = useState(false);
  const collabSavedRef = useRef<(revisionId: string) => void>(() => undefined);
  const collabOptions = useMemo(
    () => ({
      readOnly: collabReadOnly,
      onSaved: (revisionId: string) => collabSavedRef.current(revisionId),
    }),
    [collabReadOnly],
  );
  const editor = useChartWorkbench(item, siteId, collabOptions);
  const adoptingRevisionRef = useRef(false);
  const collab = useEntityCollab<ChartDocumentV1>({
    item: { artifactId: item.artifactId, title: item.title },
    editorKind: "chart",
    rootName: CHART_COLLAB_ROOT,
    toEntities: chartToEntities,
    fromEntities: chartFromEntities,
    local: editor.loading || !editor.sourceReady ? null : editor.document,
    applyRemote: (state) => {
      editor.applyRemoteDocument(state);
      if (adoptingRevisionRef.current) {
        adoptingRevisionRef.current = false;
        editor.markCollabSaved();
      }
    },
    loadRevision: async (revisionId) => {
      const loaded = await editor.adoptExternalRevision(String(item.artifactId || ""), revisionId);
      adoptingRevisionRef.current = Boolean(loaded);
      return loaded;
    },
  });
  collabSavedRef.current = collab.markSaved;
  useEffect(() => {
    setCollabReadOnly(collab.readOnly);
  }, [collab.readOnly]);
  const selectionKeys = useMemo(
    () => chartSelectionKeys(editor.activeSeriesId ? [editor.activeSeriesId] : []),
    [editor.activeSeriesId],
  );
  const peerSelections = useCollabSelections(collab.room, selectionKeys);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportBusyRef = useRef(false);
  const exportUnavailable =
    editor.loading ||
    !editor.sourceReady ||
    Boolean(editor.error && !editor.dirty);
  // 本组件只画「编辑」页。切「专业编辑」时 store 变 pro，过渡门在旧面之下挂新核。
  const { setMode: setEditorMode } = usePluginMode("chart-editor");
  // 切回「编辑」时的 ready 信号：图表源载入完（成功或已判定失败）就算首帧可见。
  useModeSwitchReady(!editor.loading);
  useEffect(() => {
    enterProRef.current = async () => {
      const gate = await flushAdvancedDraftGate(item.key || item.id);
      if (gate && !gate.ok) return gate;
      const handoff = editor.sourceReady
        ? {
            kind: "inline" as const,
            json: structuredClone(editor.document),
            revision: String(editor.editRevision),
          }
        : resolveW19Handoff(item, null);
      stashW19EnterHandoff(w19ItemKey("chart-editor", sourceItem), handoff);
      return { ok: true, handoff, item: gate?.item ?? item };
    };
    return () => {
      enterProRef.current = null;
    };
  }, [editor, enterProRef, item, sourceItem]);
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
    [editor.importCsv, editor.importXlsx],
  );
  const exportImage = useCallback(async (format: "png" | "svg") => {
    if (!await ensureAdvancedDraftExport(item.key || item.id)) return;
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
  const exportJson = useCallback(async () => {
    if (!await ensureAdvancedDraftExport(item.key || item.id)) return;
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
  const deliver = useCallback(
    async (format: string) => {
      if (format === "json") {
        exportJson();
        return;
      }
      await exportImage(format === "svg" ? "svg" : "png");
    },
    [exportImage, exportJson],
  );
  usePluginCommandSurface(
    useMemo(
      () => createChartCommandSurface({ editor, deliver }),
      [deliver, editor],
    ),
  );

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
        mode: {
          current: "normal",
          setMode: setEditorMode,
        },
        pages: {},
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
                  "未取得 oceanleo.chart.v1 结构化源；不会从 HTML、脚本或 PNG 逆向伪恢复。"}
              </p>
            </div>
          ) : (
            <div className="relative h-full min-h-0">
              <ChartStage editor={editor} />
              <ChartPeerSelections editor={editor} peers={peerSelections} />
            </div>
          ),
        status:
          exportError ||
          editor.error ||
          editor.notice ||
          (editor.loading ? "正在载入结构化图表…" : ""),
        collab: collab.collab,
        persistence: {
          // 房间里只有存档人自动保存；别的人改了也由存档人那边存
          dirty: editor.dirty && collab.saveGate,
          editRevision: editor.editRevision,
          autoSave: true,
          flush: saveBeforeNewConversation,
          recovery: {
            draftSchema: "oceanleo.chart.edit.v1",
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

/**
 * 多人同改：别人此刻选中了哪个系列。用他的颜色标一个小条（名字 · 系列名），画在图表左上角；
 * 只是画出来，不拦鼠标。
 */
function ChartPeerSelections({
  editor,
  peers,
}: {
  editor: ReturnType<typeof useChartWorkbench>;
  peers: ReadonlyArray<{ userId: string; name: string; color: string; keys: string[] }>;
}) {
  const names = new Map(editor.document.option.series.map((series) => [chartSeriesKey(series.id), series.name || series.id]));
  const rows = peers.flatMap((peer) =>
    peer.keys
      .filter((key) => names.has(key))
      .map((key) => ({ id: `${peer.userId}:${key}`, who: peer.name, color: safeSelectionColor(peer.color), series: String(names.get(key)) })),
  );
  if (!rows.length) return null;
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[60%] flex-col gap-1" aria-hidden="true">
      {rows.map((row) => (
        <span
          key={row.id}
          data-collab-peer-selection={row.id}
          className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] leading-4 text-white shadow"
          style={{ background: row.color }}
        >
          {row.who || "…"} · {row.series}
        </span>
      ))}
    </div>
  );
}
