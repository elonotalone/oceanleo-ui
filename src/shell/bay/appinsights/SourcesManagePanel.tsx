"use client";

import { useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { getBayAppSources, type BayAppSourceRow } from "../../../lib/bay/app-insights";
import { baySiteName } from "../shell/bay-links";
import { PaneLoading } from "../supply/parts";
import { useBayResource } from "../supply/use-bay-resource";
import { ShareLinkButton } from "./ShareLinkButton";
import {
  SOURCE_RANGE_DAYS,
  openRatio,
  sourceLabelKey,
  sourceRangeLabel,
  type SourceRangeDays,
} from "./insights-model";

function siteNameOf(source: string, tt: (zh: string, vars?: Record<string, string | number>) => string): string {
  if (!source.startsWith("site:")) return "";
  const key = source.slice(5);
  return baySiteName(key, tt) || key;
}

function SourceName({ row, tt }: { row: BayAppSourceRow; tt: (zh: string, vars?: Record<string, string | number>) => string }): ReactElement {
  const parts = sourceLabelKey(row.source);
  const vars = parts.vars ?? (row.source.startsWith("site:") ? { name: siteNameOf(row.source, tt) } : undefined);
  return <span>{tt(parts.key, vars)}</span>;
}

export function SourcesManagePanel({ appId }: { appId: string }): ReactElement {
  const tt = useUI();
  const [days, setDays] = useState<SourceRangeDays>(30);
  const resource = useBayResource(appId ? `sources:${appId}:${days}` : null, () => getBayAppSources(appId, days));
  const data = resource.data;
  const empty = Boolean(data && data.totals.views === 0 && data.totals.opens === 0);

  if (resource.loading && !data) return <PaneLoading />;

  return (
    <div data-bay-sources-panel className="space-y-5">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label={tt("近 30 天")}>
        {SOURCE_RANGE_DAYS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={value === days}
            data-bay-sources-range={value}
            onClick={() => setDays(value)}
            className={
              value === days
                ? "rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] text-white"
                : "rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[12px] text-neutral-700"
            }
          >
            {tt(sourceRangeLabel(value))}
          </button>
        ))}
      </div>

      {data ? (
        empty ? (
          <p data-bay-sources-empty className="text-[13px] text-neutral-500">
            {tt("这段时间还没有访客")}
          </p>
        ) : (
          <div className="space-y-4">
            <div data-bay-sources-totals className="flex flex-wrap gap-4 text-[13px] text-neutral-800">
              <span>{tt("浏览 {views} · 打开 {opens}", { views: data.totals.views, opens: data.totals.opens })}</span>
            </div>
            <div className="overflow-x-auto">
              <table data-bay-sources-table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="text-[12px] text-neutral-500">
                    <th className="pb-2 font-medium">{tt("来源")}</th>
                    <th className="pb-2 font-medium">{tt("浏览")}</th>
                    <th className="pb-2 font-medium">{tt("打开")}</th>
                    <th className="pb-2 font-medium">{tt("打开占比")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const ratio = openRatio(row.opens, data.totals.opens);
                    return (
                      <tr key={row.source} data-bay-source-row={row.source} className="border-t border-neutral-100">
                        <td className="py-2 pr-3 text-neutral-800">
                          <SourceName row={row} tt={tt} />
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-neutral-700">{row.views}</td>
                        <td className="py-2 pr-3 tabular-nums text-neutral-700">{row.opens}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <span className="block h-2 min-w-0 flex-1 rounded bg-neutral-100">
                              <span className="block h-2 rounded bg-stone-400" style={{ width: `${ratio}%` }} />
                            </span>
                            <span className="w-10 shrink-0 tabular-nums text-neutral-600">{ratio}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div>
          <p className="text-[13px] text-rose-600">{resource.error || tt("访客来源没读出来，请稍后点「重试」。")}</p>
          <button
            type="button"
            onClick={resource.reload}
            className="mt-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[12px] text-neutral-700"
          >
            {tt("重试")}
          </button>
        </div>
      )}

      <ShareLinkButton appId={appId} />
    </div>
  );
}
