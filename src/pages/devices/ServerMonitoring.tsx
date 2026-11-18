"use client";

import { useCallback, useState } from "react";
import type { CloudMetric, CloudMonitoring, MetricRange, ServerPageClient } from "../../lib/server-page-api";
import { useUI } from "../../i18n/ui/useUI";
import { DEVICE_BUTTON } from "./DeviceDialog";
import { ErrorNotice, ResourceView, ServerSection, useServerResource } from "./server-page-shared";

export function ServerCurve({title, unit, points}: {title: string; unit: string; points: {t: string; v: number | null}[]}) {
  const tt = useUI();
  const valid = points.filter((point): point is {t: string; v: number} => point.v !== null && Number.isFinite(point.v) && Number.isFinite(Date.parse(point.t)));
  const max = Math.max(1, ...valid.map((p) => p.v));
  const start = valid.length ? Date.parse(valid[0].t) : 0;
  const span = valid.length ? Math.max(1, Date.parse(valid[valid.length - 1].t) - start) : 1;
  const coords = valid.map((p) => `${10 + (Date.parse(p.t) - start) / span * 280},${85 - p.v / max * 70}`).join(" ");
  return <figure className="min-w-0 rounded-xl bg-neutral-50 p-3" data-server-curve={title}>
    <figcaption className="flex justify-between gap-2 text-sm"><span>{tt(title)}</span><span>{valid.length ? `${valid[valid.length - 1].v.toLocaleString(undefined, {maximumFractionDigits: 2})} ${unit}` : "—"}</span></figcaption>
    {valid.length ? <><svg role="img" aria-label={`${tt(title)} (${unit})`} viewBox="0 0 300 100" className="mt-2 w-full"><title>{tt(title)} · 0–{max.toLocaleString()} {unit}</title><path d="M10 10V85H290" fill="none" stroke="currentColor" opacity=".2" /><polyline points={coords} fill="none" stroke="currentColor" strokeWidth="2" className="text-sky-600" />{valid.length === 1 && <circle cx="10" cy={85 - valid[0].v / max * 70} r="3" />}</svg><p className="flex justify-between gap-2 text-xs text-neutral-500"><time>{new Date(valid[0].t).toLocaleString()}</time><time>{new Date(valid[valid.length - 1].t).toLocaleString()}</time></p></> : <p className="py-6 text-sm text-neutral-500">{tt("所选时段暂无监测数据")}</p>}
  </figure>;
}

const CLOUD_METRICS: {metric: CloudMetric; title: string}[] = [{metric: "cpu", title: "CPU"}, {metric: "memory", title: "内存"}, {metric: "disk", title: "磁盘"}, {metric: "net_in", title: "网络接收"}, {metric: "net_out", title: "网络发送"}];
function CloudCurve({api, id, range, metric, title}: {api: ServerPageClient; id: string; range: MetricRange; metric: CloudMetric; title: string}) {
  const load = useCallback(() => api.getCloudMonitor(id, metric, range), [api, id, metric, range]);
  const resource = useServerResource<CloudMonitoring>(load);
  const tt = useUI();
  return <div>{(resource.loading || !!resource.error) && <h4 className="mb-2 text-sm">{tt(title)}</h4>}<ResourceView resource={resource}>{(data) => <ServerCurve title={title} unit={data.unit} points={data.points} />}</ResourceView></div>;
}

export function ServerMonitoring({api, id, managed, online, revision, upgrade}: {api: ServerPageClient; id: string; managed: boolean; online: boolean; revision: number; upgrade: () => void}) {
  const tt = useUI();
  const [range, setRange] = useState<MetricRange>("1h");
  const load = useCallback(() => api.getMetrics(id, range), [api, id, range, revision]);
  const resource = useServerResource(load);
  const fallback = managed && (!online || !!resource.error || resource.data?.needs_node_upgrade === true);
  const points = resource.data?.points ?? [];
  const needsUpgrade = resource.data?.needs_node_upgrade === true;
  return <ServerSection title="监测" id="monitoring">
    <div className="mb-3 flex flex-wrap items-center gap-2">{(["1h", "6h", "24h", "7d"] as MetricRange[]).map((value) => <button type="button" className={DEVICE_BUTTON} aria-pressed={range === value} key={value} onClick={() => setRange(value)}>{value}</button>)}</div>
    {needsUpgrade && <p className="mb-3 text-sm text-amber-700">{tt("需要升级设备程序")} <button type="button" className={DEVICE_BUTTON} onClick={upgrade}>{tt("升级节点")}</button></p>}
    {fallback ? <>
      <p className="mb-3 text-sm text-neutral-500">{tt("数据来源：阿里云监控（设备离线或未提供监测数据）")}</p>
      {!!resource.error && <ErrorNotice error={resource.error} retry={resource.retry} />}
      <div className="grid gap-3 sm:grid-cols-2">{CLOUD_METRICS.map((entry) => <CloudCurve key={`${entry.metric}:${revision}`} api={api} id={id} range={range} {...entry} />)}</div>
    </> : <ResourceView resource={resource}>{() => <>
      <p className="mb-3 text-sm text-neutral-500">{tt("数据来源：设备程序")}</p>
      {!online && <p className="mb-3 text-sm text-neutral-500">{tt("设备已离线，显示最后上报的数据")}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <ServerCurve title="CPU" unit="%" points={points.map((p) => ({t: p.t, v: p.cpu_percent}))} />
        <ServerCurve title="内存" unit="%" points={points.map((p) => ({t: p.t, v: p.mem_used_bytes != null && p.mem_total_bytes != null && p.mem_total_bytes > 0 ? p.mem_used_bytes / p.mem_total_bytes * 100 : null}))} />
        <ServerCurve title="磁盘（最高占用）" unit="%" points={points.map((p) => {const disks = p.disks.filter((disk) => disk.total_bytes > 0); return {t: p.t, v: disks.length ? Math.max(...disks.map((d) => d.used_bytes / d.total_bytes * 100)) : null};})} />
        <ServerCurve title="网络接收" unit="B/s" points={points.map((p) => ({t: p.t, v: p.net_rx_bps}))} />
        <ServerCurve title="网络发送" unit="B/s" points={points.map((p) => ({t: p.t, v: p.net_tx_bps}))} />
      </div>
    </>}</ResourceView>}
  </ServerSection>;
}
