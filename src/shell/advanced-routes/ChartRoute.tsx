"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { advancedSavedItem } from "../advanced-session";
import {
  AdvancedWorkbenchShell,
  type EditorPanelDescriptor,
} from "../AdvancedWorkbenchShell";
import type { TopBarModel } from "../advanced-topbar";
import { useUI } from "../../i18n/ui/useUI";
import { ChartContextToolbar } from "../chart-editor/ChartContextToolbar";
import { ChartControls } from "../chart-editor/ChartControls";
import { ChartStage } from "../chart-editor/ChartStage";
import type { ChartSeriesType } from "../chart-editor/chart-schema";
import {
  chartEditorManifest,
  useChartWorkbench,
  type ChartSaveResult,
} from "../chart-editor/use-chart-workbench";
import { libraryContentDescriptor, type LibraryItem } from "../library-data";
import { editorToolLabel } from "../workbench-routes";

const CHART_TYPE_OPTIONS: Array<{ value: ChartSeriesType; label: string }> = [
  { value: "bar", label: "柱状图" },
  { value: "line", label: "折线图" },
  { value: "pie", label: "饼图" },
  { value: "gauge", label: "仪表盘" },
  { value: "scatter", label: "散点图" },
  { value: "radar", label: "雷达图" },
  { value: "funnel", label: "漏斗图" },
];

export function ChartRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const editor = useChartWorkbench(item, siteId);
  const buildSavedItem = useCallback(
    (saved: ChartSaveResult): LibraryItem => {
      const next = advancedSavedItem(item, {
        url: saved.url,
        previewUrl: item.previewUrl || item.thumbUrl || saved.url,
        thumbUrl: item.thumbUrl || item.previewUrl,
        meta: {
          editor: chartEditorManifest(),
          content_type: "chart",
          representation: "echarts-option",
          subtype: String(item.meta.subtype || item.meta.category || ""),
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
  const savedItem = useMemo(
    () => (editor.saved ? buildSavedItem(editor.saved) : null),
    [buildSavedItem, editor.saved],
  );
  const saveBeforeNewConversation = useCallback(async () => {
    const saved = await editor.save();
    return saved
      ? { ok: true as const, item: buildSavedItem(saved) }
      : { ok: false as const, error: editor.error || "图表保存失败" };
  }, [buildSavedItem, editor]);

  // 统一顶栏：图表类型 · 加系列 · 数据面板 —— 收尾区：保存到我的库。
  const primarySeries = editor.document.option.series[0];
  const topBarModel = useMemo<TopBarModel>(
    () => ({
      groups: [
        {
          id: "type",
          actions: [
            {
              kind: "dropdown",
              id: "chart-type",
              label: tt("图表类型"),
              icon: "grid",
              value: primarySeries?.type || "bar",
              options: CHART_TYPE_OPTIONS.map((entry) => ({
                value: entry.value,
                label: tt(entry.label),
              })),
              onSelect: (value) => {
                if (primarySeries) {
                  editor.patchSeries(primarySeries.id, {
                    type: value as ChartSeriesType,
                  });
                }
              },
            },
          ],
        },
        {
          id: "series",
          actions: [
            {
              kind: "action",
              id: "add-series",
              label: tt("加系列"),
              icon: "plus",
              disabled: editor.loading,
              onRun: () => editor.addSeries("bar"),
            },
          ],
        },
        {
          id: "data",
          actions: [
            {
              kind: "panel",
              id: "data",
              label: tt("数据"),
              icon: "table",
              panelId: "data",
            },
          ],
        },
      ],
      trailing: [
        {
          kind: "action",
          id: "save",
          label: editor.saving ? tt("保存中…") : tt("保存到我的库"),
          icon: "save",
          disabled: editor.loading || editor.saving,
          onRun: () => void editor.save(),
        },
      ],
    }),
    [
      editor.addSeries,
      editor.loading,
      editor.patchSeries,
      editor.save,
      editor.saving,
      primarySeries,
      tt,
    ],
  );

  const editorPanels = useMemo<EditorPanelDescriptor[]>(
    () => [
      {
        id: "data",
        title: tt("图表数据"),
        width: 340,
        content: <ChartControls editor={editor} accent={accent} />,
      },
    ],
    [accent, editor, tt],
  );

  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({
        type: "grid",
        adapter: "chart-editor@1",
      })}
      topBarModel={topBarModel}
      editorPanels={editorPanels}
      editorContextualToolbar={
        <ChartContextToolbar editor={editor} accent={accent} />
      }
      editorStage={<ChartStage editor={editor} />}
      editorStatus={
        editor.error ||
        editor.notice ||
        (editor.loading ? "正在载入结构化图表…" : "")
      }
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={editor.saved?.url || ""}
      onClose={onClose}
    />
  );
}
