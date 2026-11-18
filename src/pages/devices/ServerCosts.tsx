"use client";

import { useCallback, useState } from "react";
import type { CloudComputerClient, UsageRow } from "../../lib/cloud-computer-api";
import type { ServerPageClient, UsageLimit } from "../../lib/server-page-api";
import { useUI } from "../../i18n/ui/useUI";
import { formatMinor } from "../../lib/money";
import { DEVICE_BUTTON } from "./DeviceDialog";
import { FIELD, ResourceView, ServerSection, useServerAction, useServerResource } from "./server-page-shared";

export function monthUsage(items: UsageRow[], now = new Date()): UsageRow[] {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return items.filter((row) => Date.parse(row.hour_start) >= start && Date.parse(row.hour_start) <= now.getTime());
}
export function limitMinor(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const [major, cents = ""] = value.split(".");
  const amount = Number(major) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}
const USAGE_KIND: Record<string, string> = {instance_hour: "服务器", disk_hour: "磁盘", traffic_gb: "流量", snapshot_gb_month: "快照"};

function LimitEditor({data, api, id, changed}: {data: UsageLimit; api: ServerPageClient; id: string; changed: () => void}) {
  const tt = useUI();
  const [enabled, setEnabled] = useState(data.monthly_limit !== null);
  const [amount, setAmount] = useState(data.monthly_limit ? (data.monthly_limit.amount_minor / 100).toFixed(2) : "");
  const action = useServerAction(changed);
  const currency = data.monthly_limit?.currency ?? data.used.currency;
  const minor = limitMinor(amount);
  return <form className="mt-4 space-y-3 border-t border-neutral-200 pt-4" onSubmit={(event) => {event.preventDefault(); if (enabled && minor === null) return; action.run(() => api.setUsageLimit(id, {monthly_limit: enabled ? {amount_minor: minor!, currency} : null, on_reach: "notify"}));}}>
    {action.feedback}
    <p className="text-sm">{tt("本月已用")} {formatMinor(data.used.amount_minor, data.used.currency)} · {data.monthly_limit ? formatMinor(data.monthly_limit.amount_minor, data.monthly_limit.currency) : tt("未设置上限")}{data.reached && <> · {tt("已达到上限")}</>}</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" role="switch" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />{tt("设置每月费用上限")}</label>
    <div className="flex flex-wrap items-end gap-3">
      {enabled && <label className="grid gap-1 text-sm">{tt("每月上限")} ({currency})<input className={FIELD} type="number" min="0" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label>}
      <p className="text-sm text-neutral-500">{tt("设备用量上限仅提醒，不会关闭设备。")}</p>
      <button type="submit" className={DEVICE_BUTTON} disabled={action.busy || (enabled && minor === null)}>{tt("保存")}</button>
    </div>
  </form>;
}

export function ServerCosts({api, client, id, revision, changed}: {api: ServerPageClient; client: CloudComputerClient; id: string; revision: number; changed: () => void}) {
  const tt = useUI();
  // Include a whole month, then trim the rolling API window to this UTC calendar month.
  const loadUsage = useCallback(() => client.getUsage(id, new Date().getUTCDate()), [client, id, revision]);
  const usage = useServerResource(loadUsage);
  const loadLimit = useCallback(() => api.getUsageLimit(id), [api, id, revision]);
  const limit = useServerResource(loadLimit);
  return <ServerSection title="本月费用（UTC）" id="costs">
    <ResourceView resource={usage}>{(data) => {
      const lines = monthUsage(data.items);
      const totals = new Map<string, number>();
      const groups = new Map<string, {kind: string; currency: string; quantity: number; minor: number}>();
      for (const line of lines) {
        totals.set(line.currency, (totals.get(line.currency) ?? 0) + line.amount_minor);
        const key = `${line.kind}:${line.currency}`;
        const group = groups.get(key) ?? {kind: line.kind, currency: line.currency, quantity: 0, minor: 0};
        group.quantity += line.quantity; group.minor += line.amount_minor; groups.set(key, group);
      }
      if (!totals.size) totals.set(data.total.currency, 0);
      return <>
        <p className="mb-3 text-sm font-medium">{tt("合计")} {Array.from(totals, ([currency, minor]) => formatMinor(minor, currency)).join(" · ")}</p>
        {lines.length === 0 ? <p className="text-sm text-neutral-500">{tt("本月暂无费用记录")}</p> : <div className="max-w-full overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["项目", "用量", "费用"].map((label) => <th key={label} className="p-2 font-medium">{tt(label)}</th>)}</tr></thead><tbody>{Array.from(groups, ([key, line]) => <tr key={key} className="border-t border-neutral-200"><td className="p-2">{tt(USAGE_KIND[line.kind] ?? line.kind)}</td><td className="p-2">{line.quantity.toLocaleString()} {({instance_hour: "h", disk_hour: "GB·h", traffic_gb: "GB", snapshot_gb_month: "GB·month"} as Record<string, string>)[line.kind] ?? ""}</td><td className="p-2 whitespace-nowrap">{formatMinor(line.minor, line.currency)}</td></tr>)}</tbody></table></div>}
      </>;
    }}</ResourceView>
    <ResourceView resource={limit}>{(data) => <LimitEditor key={`${id}:${revision}`} data={data} api={api} id={id} changed={changed} />}</ResourceView>
  </ServerSection>;
}
