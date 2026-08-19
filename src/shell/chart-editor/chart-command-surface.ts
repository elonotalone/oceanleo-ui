/**
 * 图表编辑器的指令面（合同 §3.1，editorId = 编辑栏适配器 id `chart-editor@1`）。
 *
 * agent 能换图表类型、改标题、改某一列数据、增删系列、导出。数据参数只能是
 * 一段文字（合同的参数类型里没有数组），所以约定用逗号分隔的数字串，解析不出来
 * 就明说哪一格不对，不许把认不出的格子当 0 悄悄填进去。
 */

import type { PluginCommandSurfaceInput } from "../plugin-command/types";
import {
  createVisualCommandSurface,
  fail,
  ok,
  type VisualCommandDefinition,
} from "../media-editors/visual-command-kit";
import { visualDownloadFormats } from "../media-editors/visual-formats";
import type { ChartSeriesType } from "./chart-schema";
import type { ChartWorkbenchState } from "./use-chart-workbench";

const EDITOR_ID = "chart-editor@1";

const SERIES_TYPES: readonly { value: ChartSeriesType; label: string }[] = [
  { value: "bar", label: "柱状图" },
  { value: "line", label: "折线图" },
  { value: "pie", label: "饼图" },
  { value: "scatter", label: "散点图" },
  { value: "radar", label: "雷达图" },
  { value: "funnel", label: "漏斗图" },
  { value: "gauge", label: "仪表盘" },
];

/** "12, 20, 16" → [12,20,16]；有一格不是数字就整条不收。 */
export function parseChartValues(
  input: string,
): { ok: true; values: number[] } | { ok: false; message: string } {
  const cells = input
    .split(/[,，\s]+/)
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (!cells.length) {
    return { ok: false, message: "数据是空的，请给一串用逗号分开的数字。" };
  }
  if (cells.length > 200) {
    return {
      ok: false,
      message: `一次最多改 200 个数，收到了 ${cells.length} 个。`,
    };
  }
  const values: number[] = [];
  for (const [index, cell] of cells.entries()) {
    const value = Number(cell);
    if (!Number.isFinite(value)) {
      return {
        ok: false,
        message: `第 ${index + 1} 个值「${cell}」不是数字。`,
      };
    }
    values.push(value);
  }
  return { ok: true, values };
}

export interface ChartCommandDeps {
  editor: ChartWorkbenchState;
  /** 由路由提供：png / svg / json 三种交付。 */
  deliver: (format: string) => Promise<void>;
}

export function chartCommandDefinitions(
  deps: ChartCommandDeps,
): VisualCommandDefinition[] {
  const { editor } = deps;
  // 源没载入成功时编辑器本身就是停的，这时候一条指令都不该列出来。
  if (editor.loading || !editor.sourceReady) return [];
  const revision = () => editor.editRevision;
  const seriesEnum = editor.document.option.series.map((series) => ({
    value: series.id,
    label: series.name || series.id,
  }));
  const definitions: VisualCommandDefinition[] = [];

  definitions.push({
    spec: {
      id: "chart-editor@1.set-chart-type",
      label: "换图表类型",
      summary: "把某个数据系列换成柱状、折线、饼图等另一种画法。",
      mutates: true,
      params: [
        {
          key: "type",
          label: "图表类型",
          type: "enum",
          required: true,
          enumValues: SERIES_TYPES,
        },
        {
          key: "seriesId",
          label: "数据系列",
          type: "enum",
          enumValues: seriesEnum,
          hint: "不填就改当前选中的系列",
        },
      ],
    },
    run: (params) => {
      const seriesId =
        (params.seriesId as string) ||
        editor.activeSeriesId ||
        editor.document.option.series[0]?.id ||
        "";
      if (!seriesId) return fail("这张图表里没有可改的数据系列。");
      editor.patchSeries(seriesId, { type: params.type as ChartSeriesType });
      if (editor.error) return fail(editor.error);
      return ok(`「${seriesId}」已换成${String(params.type)}。`, revision());
    },
  });

  definitions.push({
    spec: {
      id: "chart-editor@1.set-title",
      label: "改图表标题",
      summary: "换掉图表上方那行标题文字。",
      mutates: true,
      params: [
        {
          key: "title",
          label: "标题",
          type: "string",
          required: true,
          hint: "最多 160 个字",
        },
      ],
    },
    bounds: { title: { maxLength: 160 } },
    run: (params) => {
      editor.setTitle(String(params.title));
      return ok(`标题已改成「${String(params.title).slice(0, 20)}」。`, revision());
    },
  });

  definitions.push({
    spec: {
      id: "chart-editor@1.set-series-values",
      label: "改一列数据",
      summary: "把某个数据系列的数值整列替换掉。",
      mutates: true,
      params: [
        {
          key: "values",
          label: "数值",
          type: "string",
          required: true,
          hint: "用逗号分开，例如 12,20,16",
        },
        {
          key: "seriesId",
          label: "数据系列",
          type: "enum",
          enumValues: seriesEnum,
          hint: "不填就改当前选中的系列",
        },
      ],
    },
    bounds: { values: { maxLength: 2000, nonEmpty: true } },
    run: (params) => {
      const parsed = parseChartValues(String(params.values));
      if (!parsed.ok) return fail(parsed.message);
      const seriesId =
        (params.seriesId as string) ||
        editor.activeSeriesId ||
        editor.document.option.series[0]?.id ||
        "";
      if (!seriesId) return fail("这张图表里没有可改的数据系列。");
      const categories = editor.document.option.xAxis.data.length;
      if (categories && parsed.values.length !== categories) {
        return fail(
          `这张图表有 ${categories} 个分类，需要 ${categories} 个数，收到的是 ${parsed.values.length} 个。`,
        );
      }
      editor.patchSeries(seriesId, { data: parsed.values });
      if (editor.error) return fail(editor.error);
      return ok(`「${seriesId}」已换成 ${parsed.values.length} 个数。`, revision());
    },
  });

  definitions.push({
    spec: {
      id: "chart-editor@1.toggle-legend",
      label: "显示或隐藏图例",
      summary: "控制图表上那排系列名要不要显示。",
      mutates: true,
      params: [
        {
          key: "show",
          label: "显示图例",
          type: "boolean",
          required: true,
        },
      ],
    },
    run: (params) => {
      editor.setLegend({ show: params.show === true });
      return ok(params.show === true ? "图例已显示。" : "图例已隐藏。", revision());
    },
  });

  definitions.push({
    spec: {
      id: "chart-editor@1.add-series",
      label: "加一个数据系列",
      summary: "在当前图表里新增一条数据系列，初始值全是 0。",
      mutates: true,
      params: [
        {
          key: "type",
          label: "图表类型",
          type: "enum",
          enumValues: SERIES_TYPES,
          hint: "不填按柱状图加",
        },
      ],
    },
    run: (params) => {
      editor.addSeries((params.type as ChartSeriesType) || "bar");
      if (editor.error) return fail(editor.error);
      return ok("已新增一个数据系列。", revision());
    },
  });

  if (editor.document.option.series.length > 1) {
    definitions.push({
      spec: {
        id: "chart-editor@1.remove-series",
        label: "删掉一个数据系列",
        summary: "把指定的数据系列从图表里去掉；至少保留一个。",
        mutates: true,
        params: [
          {
            key: "seriesId",
            label: "数据系列",
            type: "enum",
            required: true,
            enumValues: seriesEnum,
          },
        ],
      },
      run: (params) => {
        editor.removeSeries(String(params.seriesId));
        if (editor.error) return fail(editor.error);
        return ok(`已删掉「${String(params.seriesId)}」。`, revision());
      },
    });
  }

  definitions.push({
    spec: {
      id: "chart-editor@1.export",
      label: "导出图表",
      summary: "把当前图表按选定格式下载下来；不改图表本身。",
      mutates: false,
      params: [
        {
          key: "format",
          label: "文件格式",
          type: "enum",
          required: true,
          enumValues: visualDownloadFormats(EDITOR_ID).map((entry) => ({
            value: entry.format,
            label: entry.label,
          })),
        },
      ],
    },
    run: async (params) => {
      try {
        await deps.deliver(String(params.format));
      } catch (caught) {
        return fail(
          caught instanceof Error && caught.message.trim()
            ? caught.message.trim()
            : "导出失败。",
        );
      }
      return ok(`已按 ${String(params.format).toUpperCase()} 导出。`);
    },
  });

  return definitions;
}

export function chartCommandState(
  editor: ChartWorkbenchState,
): Record<string, unknown> {
  const option = editor.document.option;
  return {
    editor: "图表",
    title: option.title.text,
    categories: option.xAxis.data.slice(0, 24),
    categoryCount: option.xAxis.data.length,
    // 数值本身可能很长；这里只报形状，agent 要具体数字可以先导出 JSON。
    series: option.series.slice(0, 12).map((series) => ({
      id: series.id,
      name: series.name,
      type: series.type,
      pointCount: series.data.length,
    })),
    activeSeriesId: editor.activeSeriesId,
    legendVisible: option.legend.show,
    sourceReady: editor.sourceReady,
    carrierState: editor.carrierState,
    unsaved: editor.dirty,
  };
}

export function createChartCommandSurface(
  deps: ChartCommandDeps,
): PluginCommandSurfaceInput {
  return createVisualCommandSurface({
    editorId: EDITOR_ID,
    commands: () => chartCommandDefinitions(deps),
    state: () => chartCommandState(deps.editor),
  });
}
