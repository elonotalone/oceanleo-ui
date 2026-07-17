"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { MediaType } from "../../lib/database";
import type {
  EditorManifestV1,
  LibraryItem,
} from "../library-data";
import { saveFileToLibrary } from "../doc-editors/doc-io";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";
import {
  appendChartSeries,
  chartDataTable,
  chartDocumentFromCsv,
  chartDocumentFromJson,
  chartDocumentToJson,
  normalizeChartDocument,
  patchChartAxis,
  patchChartSeries,
  replaceChartData,
  type ChartAxis,
  type ChartDataTable,
  type ChartDocumentV1,
  type ChartSeries,
} from "./chart-schema";

const GATEWAY =
  (typeof process !== "undefined" &&
    (process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY_URL ||
      process.env.NEXT_PUBLIC_GATEWAY_URL)) ||
  "https://api.oceanleo.com";

const EMPTY_DOCUMENT = normalizeChartDocument({
  title: { text: "新图表" },
  xAxis: { type: "category", data: ["A", "B", "C"] },
  yAxis: { type: "value" },
  series: [{ id: "series-1", name: "系列 1", type: "bar", data: [12, 20, 16] }],
});

export interface ChartSaveResult {
  url: string;
  json: string;
  document: ChartDocumentV1;
  versionId: string;
  projectUrl: string;
  projectSchema: string;
}

export interface ChartWorkbenchState {
  document: ChartDocumentV1;
  table: ChartDataTable;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  editRevision: number;
  error: string;
  notice: string;
  saved: ChartSaveResult | null;
  setTitle: (title: string) => void;
  setColors: (colors: string[]) => void;
  setLegend: (patch: Partial<ChartDocumentV1["option"]["legend"]>) => void;
  setAxis: (axis: "x" | "y", patch: Partial<ChartAxis>) => void;
  patchSeries: (id: string, patch: Partial<ChartSeries>) => void;
  addSeries: (type?: ChartSeries["type"]) => void;
  removeSeries: (id: string) => void;
  replaceData: (table: ChartDataTable) => void;
  importCsv: (csv: string) => void;
  save: () => Promise<ChartSaveResult | null>;
  restoreRecovery: (payload: unknown) => boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function manifestFor(item: LibraryItem): EditorManifestV1 | null {
  const record = asRecord(item.descriptor?.editor || item.meta.editor);
  const source = asRecord(record?.source);
  if (
    record?.schema !== "oceanleo.editor-manifest.v1" ||
    record.id !== "chart-editor" ||
    record.version !== 1 ||
    !source ||
    (source.kind !== "inline" && source.kind !== "url")
  ) {
    return null;
  }
  return record as unknown as EditorManifestV1;
}

function inlineDocument(item: LibraryItem): ChartDocumentV1 | null {
  if (item.content?.trim()) return chartDocumentFromJson(item.content);
  const value = item.meta.chart_document || item.meta.chart_option;
  return value ? normalizeChartDocument(value) : null;
}

function sourceRequestUrl(url: string): string {
  if (url.startsWith("/")) return `${GATEWAY}${url}`;
  return url;
}

async function loadChartDocument(
  item: LibraryItem,
  signal?: AbortSignal,
): Promise<ChartDocumentV1> {
  const inline = inlineDocument(item);
  if (inline) return inline;
  const manifest = manifestFor(item);
  const sourceUrl =
    manifest?.source.kind === "url" ? manifest.source.url || "" : "";
  if (!sourceUrl) {
    throw new Error(
      "此图表没有 chart-editor@1 结构化 option 源，不能从 HTML/脚本逆向恢复。",
    );
  }
  const response = await fetch(sourceRequestUrl(sourceUrl), {
    signal,
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`图表源读取失败（HTTP ${response.status}）`);
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error("图表源超过 2MB 安全上限");
  return chartDocumentFromJson(text);
}

export function chartEditorManifest(): EditorManifestV1 {
  return {
    schema: "oceanleo.editor-manifest.v1",
    id: "chart-editor",
    version: 1,
    capabilities: ["load", "mutate", "save", "reopen"],
    source: { kind: "inline", format: "echarts-option+json" },
  };
}

export function useChartWorkbench(
  item: LibraryItem,
  siteId = "",
): ChartWorkbenchState {
  const tt = useUI();
  const aliveRef = useRef(true);
  const revisionRef = useRef(0);
  const documentRef = useRef<ChartDocumentV1>(EMPTY_DOCUMENT);
  const saveBusyRef = useRef(false);
  const [document, setDocument] = useState<ChartDocumentV1>(EMPTY_DOCUMENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState<ChartSaveResult | null>(null);

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
    setDirty(false);
    revisionRef.current = 0;
    void loadChartDocument(item, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          documentRef.current = next;
          setDocument(next);
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
  }, [item.content, item.id, item.meta.chart_document, item.meta.chart_option, item.meta.editor, tt]);

  const mutate = useCallback((producer: (value: ChartDocumentV1) => ChartDocumentV1) => {
    try {
      const next = producer(documentRef.current);
      documentRef.current = next;
      revisionRef.current += 1;
      setDocument(next);
      setDirty(true);
      setSaved(null);
      setNotice("");
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "图表修改失败");
    }
  }, []);

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
          return Boolean(manifestFor(material) || inlineDocument(material));
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
    if (saveBusyRef.current || loading) return null;
    saveBusyRef.current = true;
    setSaving(true);
    setError("");
    try {
      const snapshot = normalizeChartDocument(document);
      const json = chartDocumentToJson(snapshot);
      const savingRevision = revisionRef.current;
      const title = `${snapshot.option.title.text || item.title || tt("图表")}-${tt("编辑版")}`;
      const result = await saveFileToLibrary({
        item,
        siteId,
        fallbackSite: "chart",
        file: new File([json], `${title}.chart.json`, {
          type: "application/json",
        }),
        title,
        mediaType: "other" as MediaType,
        kind: "chart",
        idempotencyKey: `chart:${item.id}:${savingRevision}`,
        thumbUrl: item.thumbUrl || item.previewUrl,
        meta: {
          editor: chartEditorManifest(),
          content_type: "chart",
          representation: "echarts-option",
          subtype: String(item.meta.subtype || item.meta.category || ""),
          chart_document: snapshot,
        },
        deliveryProjectSchema: "oceanleo.chart.v1",
      });
      if (!result.ok || !result.url) {
        throw new Error(result.error || tt("图表保存到我的库失败"));
      }
      const next = {
        url: result.url,
        json,
        document: snapshot,
        versionId: result.versionId,
        projectUrl: result.projectUrl,
        projectSchema: result.projectSchema,
      };
      if (aliveRef.current) {
        setSaved(next);
        if (revisionRef.current === savingRevision) {
          setDirty(false);
          setNotice(tt("图表新版本已保存到我的库"));
        } else {
          setNotice(tt("已保存一个版本；之后的修改仍未保存"));
        }
      }
      return next;
    } catch (caught) {
      if (aliveRef.current) {
        setError(caught instanceof Error ? caught.message : tt("图表保存失败"));
      }
      return null;
    } finally {
      saveBusyRef.current = false;
      if (aliveRef.current) setSaving(false);
    }
  }, [document, item, loading, siteId, tt]);
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
    loading,
    saving,
    dirty,
    editRevision: revisionRef.current,
    error,
    notice,
    saved,
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
      mutate((current) =>
        appendChartSeries(current, {
          id: `series-${current.option.series.length + 1}`,
          name: `系列 ${current.option.series.length + 1}`,
          type,
          data: current.option.xAxis.data.map(() => 0),
          label: { show: false },
        }),
      ),
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
    replaceData: (table) =>
      mutate((current) => replaceChartData(current, table)),
    importCsv: (csv) =>
      mutate((current) => replaceChartData(current, chartDocumentFromCsv(csv))),
    save,
    restoreRecovery,
  };
}
