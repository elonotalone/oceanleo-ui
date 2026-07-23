"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useUI } from "../../i18n/ui/useUI";
import type {
  EditorManifestV1,
  LibraryItem,
} from "../library-data";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";
import {
  appendChartSeries,
  chartDataTable,
  chartDocumentFromCsv,
  normalizeChartDocument,
  patchChartAxis,
  patchChartSeries,
  patchChartTooltip,
  replaceChartData,
  type ChartAxis,
  type ChartDataTable,
  type ChartDocumentV1,
  type ChartSeries,
} from "./chart-schema";
import { ChartDocumentHistory } from "./chart-history";
import {
  CHART_EDITOR_ID,
  CHART_OPTION_FORMAT,
  loadChartDocument,
  resolveChartSource,
} from "./chart-source";
import {
  saveChartRevision,
  type ChartSaveResult,
} from "./chart-persistence";
import { renderChartPreviewBlob } from "./chart-render";
export type { ChartSaveResult } from "./chart-persistence";

const EMPTY_DOCUMENT = normalizeChartDocument({
  title: { text: "新图表" },
  xAxis: { type: "category", data: ["A", "B", "C"] },
  yAxis: { type: "value" },
  series: [{ id: "series-1", name: "系列 1", type: "bar", data: [12, 20, 16] }],
});

export interface ChartWorkbenchState {
  document: ChartDocumentV1;
  table: ChartDataTable;
  activeSeriesId: string;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  editRevision: number;
  error: string;
  notice: string;
  saved: ChartSaveResult | null;
  canUndo: boolean;
  canRedo: boolean;
  selectSeries: (id: string) => void;
  setTitle: (title: string) => void;
  setColors: (colors: string[]) => void;
  setLegend: (patch: Partial<ChartDocumentV1["option"]["legend"]>) => void;
  setTooltip: (patch: Partial<ChartDocumentV1["option"]["tooltip"]>) => void;
  setAxis: (axis: "x" | "y", patch: Partial<ChartAxis>) => void;
  patchSeries: (id: string, patch: Partial<ChartSeries>) => void;
  addSeries: (type?: ChartSeries["type"]) => void;
  removeSeries: (id: string) => void;
  replaceData: (table: ChartDataTable) => void;
  importCsv: (csv: string) => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<ChartSaveResult | null>;
  restoreRecovery: (payload: unknown) => boolean;
}

export function chartEditorManifest(): EditorManifestV1 {
  return {
    schema: "oceanleo.editor-manifest.v1",
    id: CHART_EDITOR_ID,
    version: 1,
    capabilities: ["load", "mutate", "save", "reopen"],
    source: { kind: "inline", format: CHART_OPTION_FORMAT },
  };
}

function chartArtifactInputIdentity(item: LibraryItem): string {
  if (item.artifactId && item.revisionId) {
    return `${item.key}:${item.artifactId}:${item.revisionId}`;
  }
  return `${item.key}:${item.id}:${String(
    item.meta.editor_version_id ||
      item.meta.editor_project_url ||
      item.content ||
      "",
  )}`;
}

export function useChartWorkbench(
  item: LibraryItem,
  siteId = "",
): ChartWorkbenchState {
  const tt = useUI();
  const aliveRef = useRef(true);
  const revisionRef = useRef(0);
  const documentRef = useRef<ChartDocumentV1>(EMPTY_DOCUMENT);
  const historyRef = useRef(new ChartDocumentHistory());
  const saveBusyRef = useRef(false);
  const dirtyRef = useRef(false);
  const artifactHeadRef = useRef(item);
  const artifactInputIdentityRef = useRef(chartArtifactInputIdentity(item));
  const workingHeadUrlRef = useRef(item.url || item.previewUrl || "");
  const [document, setDocument] = useState<ChartDocumentV1>(EMPTY_DOCUMENT);
  const [activeSeriesId, setActiveSeriesId] = useState(
    EMPTY_DOCUMENT.option.series[0]?.id || "",
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<ChartSaveResult | null>(null);
  const nextInputIdentity = chartArtifactInputIdentity(item);
  if (artifactInputIdentityRef.current !== nextInputIdentity) {
    artifactInputIdentityRef.current = nextInputIdentity;
    artifactHeadRef.current = item;
  }
  const updateDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirty(value);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setNotice("");
    setSaved(null);
    updateDirty(false);
    revisionRef.current = 0;
    historyRef.current.reset();
    workingHeadUrlRef.current = String(
      item.meta.editor_working_head_url || item.url || item.previewUrl || "",
    );
    void loadChartDocument(item, { signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) {
          documentRef.current = next;
          setDocument(next);
          setActiveSeriesId(next.option.series[0]?.id || "");
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : tt("图表源读取失败"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    nextInputIdentity,
    tt,
    updateDirty,
  ]);

  const mutate = useCallback((producer: (value: ChartDocumentV1) => ChartDocumentV1) => {
    try {
      const before = documentRef.current;
      const next = normalizeChartDocument(producer(before));
      if (!historyRef.current.record(before, next)) return;
      documentRef.current = next;
      revisionRef.current += 1;
      setDocument(next);
      updateDirty(true);
      setSaved(null);
      setNotice("");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "图表修改失败");
    }
  }, [updateDirty]);

  useEffect(() => {
    if (document.option.series.some((series) => series.id === activeSeriesId)) {
      return;
    }
    setActiveSeriesId(document.option.series[0]?.id || "");
  }, [activeSeriesId, document.option.series]);

  const applyHistoryDocument = useCallback((next: ChartDocumentV1 | null) => {
    if (!next) return;
    documentRef.current = next;
    revisionRef.current += 1;
    setDocument(next);
    updateDirty(true);
    setSaved(null);
    setNotice("");
    setError("");
  }, [updateDirty]);

  const undo = useCallback(() => {
    applyHistoryDocument(historyRef.current.undo(documentRef.current));
  }, [applyHistoryDocument]);

  const redo = useCallback(() => {
    applyHistoryDocument(historyRef.current.redo(documentRef.current));
  }, [applyHistoryDocument]);

  const replaceFromMaterial = useCallback(
    async (action: "insert" | "replace" | "apply" | "merge", material: LibraryItem) => {
      const incoming = await loadChartDocument(material);
      mutate((current) => {
        if (action === "replace" || action === "apply") return incoming;
        let next = current;
        for (const series of incoming.option.series) {
          next = appendChartSeries(next, {
            ...series,
            id: `${series.id}-${next.option.series.length + 1}`,
          });
        }
        return next;
      });
      setNotice(tt(action === "replace" ? "已替换为素材副本" : "已插入素材系列副本"));
    },
    [mutate, tt],
  );

  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "chart-editor@1",
      actions: ["insert", "replace"],
      accepts: (material) => {
        const isChart =
          String(
            material.descriptor?.contentType ||
              material.meta.content_type ||
              material.meta.asset_type ||
              "",
          ).toLowerCase() === "chart";
        if (!isChart) return false;
        try {
          resolveChartSource(material);
          return true;
        } catch {
          return false;
        }
      },
      mutate: (action, material) => replaceFromMaterial(action, material),
    }),
    [replaceFromMaterial],
  );
  useWorkbenchMaterialAdapter(materialAdapter);

  const save = useCallback(async (): Promise<ChartSaveResult | null> => {
    if (saveBusyRef.current || loading || !dirtyRef.current) return null;
    saveBusyRef.current = true;
    setSaving(true);
    setError("");
    try {
      const snapshot = normalizeChartDocument(documentRef.current);
      const savingRevision = revisionRef.current;
      const previewBlob = await renderChartPreviewBlob(snapshot.option);
      if (revisionRef.current !== savingRevision) {
        throw new Error("preview 渲染期间图表已变化，本次旧快照未提交");
      }
      const title = `${snapshot.option.title.text || item.title || tt("图表")}-${tt("编辑版")}`;
      const result = await saveChartRevision({
        item: artifactHeadRef.current,
        siteId,
        editRevision: savingRevision,
        document: snapshot,
        workingHeadUrl: workingHeadUrlRef.current,
        title,
        previewBlob,
      });
      if (result.item) artifactHeadRef.current = result.item;
      workingHeadUrlRef.current = result.url;
      if (aliveRef.current) {
        setSaved(result);
        if (revisionRef.current === savingRevision) {
          updateDirty(false);
        }
        setNotice("");
      }
      return result;
    } catch (caught) {
      if (aliveRef.current) {
        setError(caught instanceof Error ? caught.message : tt("图表保存失败"));
      }
      return null;
    } finally {
      saveBusyRef.current = false;
      if (aliveRef.current) setSaving(false);
    }
  }, [item.title, loading, siteId, tt, updateDirty]);
  const table = useMemo(() => chartDataTable(document), [document]);
  const restoreRecovery = useCallback(
    (payload: unknown): boolean => {
      if (
        !payload ||
        typeof payload !== "object" ||
        (payload as { schema?: unknown }).schema !== "oceanleo.chart.v1"
      ) {
        return false;
      }
      mutate(() => normalizeChartDocument(payload));
      setNotice(tt("已恢复上次未同步的本地草稿"));
      return true;
    },
    [mutate, tt],
  );

  return {
    document,
    table,
    activeSeriesId,
    loading,
    saving,
    dirty,
    editRevision: revisionRef.current,
    error,
    notice,
    saved,
    canUndo: historyRef.current.canUndo,
    canRedo: historyRef.current.canRedo,
    selectSeries: (id) => {
      if (documentRef.current.option.series.some((series) => series.id === id)) {
        setActiveSeriesId(id);
      }
    },
    setTitle: (title) =>
      mutate((current) => ({
        ...current,
        option: {
          ...current.option,
          title: {
            ...current.option.title,
            text: title.slice(0, 160),
          },
        },
      })),
    setColors: (colors) =>
      mutate((current) => ({
        ...current,
        option: { ...current.option, color: colors },
      })),
    setLegend: (patch) =>
      mutate((current) => ({
        ...current,
        option: {
          ...current.option,
          legend: { ...current.option.legend, ...patch },
        },
      })),
    setAxis: (axis, patch) =>
      mutate((current) => patchChartAxis(current, axis, patch)),
    patchSeries: (id, patch) =>
      mutate((current) => patchChartSeries(current, id, patch)),
    addSeries: (type = "bar") =>
      mutate((current) => {
        const usedIds = new Set(
          current.option.series.map((series) => series.id),
        );
        let ordinal = current.option.series.length + 1;
        while (usedIds.has(`series-${ordinal}`)) ordinal += 1;
        return appendChartSeries(current, {
          id: `series-${ordinal}`,
          name: `系列 ${ordinal}`,
          type,
          data: current.option.xAxis.data.map(() => 0),
          label: { show: false },
        });
      }),
    removeSeries: (id) =>
      mutate((current) => {
        if (current.option.series.length <= 1) {
          throw new Error(tt("至少保留一个系列"));
        }
        return {
          ...current,
          option: {
            ...current.option,
            series: current.option.series.filter((series) => series.id !== id),
          },
        };
      }),
    setTooltip: (patch) =>
      mutate((current) => patchChartTooltip(current, patch)),
    replaceData: (table) =>
      mutate((current) => replaceChartData(current, table)),
    importCsv: (csv) =>
      mutate((current) => replaceChartData(current, chartDocumentFromCsv(csv))),
    undo,
    redo,
    save,
    restoreRecovery,
  };
}
