"use client";

import { useEffect, useRef } from "react";
import type { EChartsType, EChartsOption } from "echarts";
import { useUI } from "../../i18n/ui/useUI";
import { CHROME } from "../editor-chrome";
import type { ChartOption } from "./chart-schema";
import type { ChartWorkbenchState } from "./use-chart-workbench";

function renderOption(source: ChartOption): EChartsOption {
  const legend = { ...source.legend } as Record<string, unknown>;
  const position = legend.position;
  delete legend.position;
  if (position === "bottom") {
    legend.bottom = 8;
    delete legend.top;
  } else if (position === "left" || position === "right") {
    legend[position] = 8;
    legend.top = "middle";
    legend.orient = "vertical";
  } else {
    legend.top = 8;
  }
  return {
    ...source,
    legend,
    animationDuration: 220,
    animationDurationUpdate: 180,
  } as EChartsOption;
}

export function ChartStage({ editor }: { editor: ChartWorkbenchState }) {
  const tt = useUI();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const optionRef = useRef(editor.document.option);
  const blocked = editor.loading || Boolean(editor.error && !editor.dirty);
  optionRef.current = editor.document.option;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || blocked) return;
    let active = true;
    let observer: ResizeObserver | null = null;

    void import("echarts").then((echarts) => {
      if (!active || !hostRef.current) return;
      const chart = echarts.init(hostRef.current, undefined, {
        renderer: "canvas",
      });
      chartRef.current = chart;
      chart.setOption(renderOption(optionRef.current), {
        notMerge: true,
        lazyUpdate: true,
      });
      observer = new ResizeObserver(() => chart.resize());
      observer.observe(hostRef.current);
    });

    return () => {
      active = false;
      observer?.disconnect();
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [blocked]);

  useEffect(() => {
    chartRef.current?.setOption(renderOption(editor.document.option), {
      notMerge: true,
      lazyUpdate: true,
    });
  }, [editor.document]);

  if (editor.loading) {
    return (
      <div className={`grid h-full min-h-[420px] place-items-center ${CHROME.subtle} text-sm ${CHROME.muted}`}>
        {tt("正在载入结构化图表…")}
      </div>
    );
  }
  if (editor.error && !editor.dirty) {
    return (
      <div className={`grid h-full min-h-[420px] place-items-center ${CHROME.subtle} p-6`}>
        <div
          role="alert"
          className="max-w-lg rounded-xl border border-amber-200 bg-[var(--card,#ffffff)] p-5 text-center"
        >
          <p className="font-semibold text-amber-800">{tt("图表编辑不可用")}</p>
          <p className="mt-2 text-xs leading-relaxed text-amber-700">
            {editor.error}
          </p>
        </div>
      </div>
    );
  }

  const title = editor.document.option.title.text || tt("图表预览");
  return (
    <div className={`flex h-full min-h-0 flex-col ${CHROME.subtle} p-4`}>
      <div className={`mx-auto flex h-full min-h-[420px] w-full max-w-6xl overflow-hidden rounded-xl border ${CHROME.border} bg-[var(--card,#ffffff)] shadow-sm`}>
        <div
          ref={hostRef}
          role="img"
          aria-label={title}
          data-chart-engine="echarts"
          className="h-full min-h-[420px] w-full"
        />
      </div>
    </div>
  );
}
