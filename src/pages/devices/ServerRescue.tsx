"use client";

import { useCallback, useState } from "react";
import type { Diagnosis, RuleInput, ServerPageClient, SnapshotPolicy } from "../../lib/server-page-api";
import { useUI } from "../../i18n/ui/useUI";
import { formatMinor } from "../../lib/money";
import { DEVICE_BUTTON } from "./DeviceDialog";
import { FIELD, OWN_PROVIDER, ResourceView, ServerSection, useServerAction, useServerResource } from "./server-page-shared";
import { formatDeviceTime } from "./DeviceTasksDialog";

const SNAPSHOT_STATUS: Record<string, string> = {accomplished: "可用", available: "可用", completed: "可用", normal: "可用", ready: "可用", progressing: "创建中", pending: "创建中", failed: "失败"};

export function ServerSnapshots({api, id, revision, changed}: {api: ServerPageClient; id: string; revision: number; changed: () => void}) {
  const tt = useUI();
  const load = useCallback(() => api.getSnapshots(id), [api, id, revision]);
  const resource = useServerResource(load);
  const action = useServerAction(changed);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<SnapshotPolicy | null>(null);
  return <ServerSection title="快照" id="snapshots">
    {action.feedback}
    <ResourceView resource={resource}>{(data) => {
      const policy = draft ?? data.policy;
      return <>
        <p className="mb-3 text-sm">{tt("快照每月费用")} {data.monthly_cost ? formatMinor(data.monthly_cost.amount_minor, data.monthly_cost.currency) : tt("暂无费用数据")}</p>
        <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={(event) => {event.preventDefault(); action.run(async () => {await api.setSnapshotPolicy(id, policy); setDraft(null);});}}>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" role="switch" checked={policy.enabled} onChange={(event) => setDraft({...policy, enabled: event.target.checked})} />{tt("自动快照")}</label>
          <label className="grid gap-1 text-sm">{tt("时间（UTC）")}<select className={FIELD} value={policy.time_utc} onChange={(event) => setDraft({...policy, time_utc: event.target.value})}>{Array.from({length: 24}, (_, i) => `${String(i).padStart(2, "0")}:00`).map((time) => <option key={time}>{time}</option>)}</select></label>
          <label className="grid gap-1 text-sm">{tt("保留天数")}<input className={`${FIELD} w-24`} type="number" required min={1} max={65536} value={policy.retention_days} onChange={(event) => setDraft({...policy, retention_days: Number(event.target.value)})} /></label>
          <button type="submit" className={DEVICE_BUTTON} disabled={action.busy}>{tt("保存")}</button>
        </form>
        <form className="mb-4 flex flex-wrap gap-2" onSubmit={(event) => {event.preventDefault(); action.run(() => api.createSnapshot(id, note));}}><input className={FIELD} aria-label={tt("快照备注")} maxLength={256} value={note} onChange={(event) => setNote(event.target.value)} /><button type="submit" className={DEVICE_BUTTON} disabled={action.busy}>{tt("立即创建")}</button></form>
        {data.items.length === 0 ? <p className="text-sm text-neutral-500">{tt("暂无快照")}</p> : <ul className="divide-y divide-neutral-200">{data.items.map((snapshot) => <li key={snapshot.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0 break-all text-sm"><p>{snapshot.note || snapshot.id} · {tt(snapshot.kind === "auto" ? "自动快照" : "手动快照")}</p><p className="mt-1 text-xs text-neutral-500">{snapshot.disk_id} · {snapshot.size_gb} GB · {formatDeviceTime(snapshot.created_at)} · {tt(SNAPSHOT_STATUS[snapshot.status.toLowerCase()] ?? snapshot.status)}</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" className={DEVICE_BUTTON} disabled={action.busy || !["accomplished", "available", "completed", "normal", "ready"].includes(snapshot.status.toLowerCase())} onClick={() => action.run((confirmed) => api.rollback(id, snapshot.id, confirmed))}>{tt("回滚到此快照")}</button><button type="button" className={DEVICE_BUTTON} disabled={action.busy} onClick={() => action.run(() => api.deleteSnapshot(id, snapshot.id), {title: tt("删除快照"), body: tt("删除后无法再用此快照恢复数据。")})}>{tt("删除")}</button></div>
        </li>)}</ul>}
      </>;
    }}</ResourceView>
  </ServerSection>;
}

export function ServerDiagnosis({api, id, managed, changed, onAgent}: {api: ServerPageClient; id: string; managed: boolean; changed: () => void; onAgent: (diagnosis: Diagnosis | null) => Promise<void>}) {
  const tt = useUI();
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const action = useServerAction();
  return <ServerSection title="救援" id="rescue">
    {!managed && <p className="mb-3 text-sm text-neutral-500">{tt(OWN_PROVIDER)} {tt("设备仍可连接时，agent 可以协助排查。")}</p>}
    {action.feedback}
    <div className="mb-3 flex flex-wrap gap-2"><button type="button" className={DEVICE_BUTTON} disabled={action.busy} onClick={() => action.run(async () => {setDiagnosis(await api.diagnose(id)); changed();})}>{tt("诊断")}</button><button type="button" className={DEVICE_BUTTON} disabled={action.busy} onClick={() => action.run(() => onAgent(diagnosis))}>{tt("让 agent 处理")}</button>
      {managed && <button type="button" className={DEVICE_BUTTON} disabled={action.busy} onClick={() => action.run(async (confirmed) => {await api.reinstall(id, confirmed); changed();})}>{tt("重装系统")}</button>}
    </div>
    {!diagnosis ? <p className="text-sm text-neutral-500">{tt("点击诊断，读取设备状态和建议；不会自动修复。")}</p> : <div className="space-y-2 text-sm" data-server-diagnosis>
      <p>{tt("诊断状态")} · {tt(DIAGNOSIS_LABEL[diagnosis.state])}</p>
      {diagnosis.findings.length === 0 && <p>{tt("未发现问题")}</p>}
      <ul className="space-y-1">{diagnosis.findings.map((finding, i) => <li key={`${finding.code}:${i}`}>{finding.text}</li>)}</ul>
      {diagnosis.suggested.length > 0 && <><h4 className="font-medium">{tt("建议操作")}</h4><ul>{diagnosis.suggested.map((suggestion, i) => <li key={`${suggestion.action}:${i}`}>{suggestion.text}{suggestion.needs_confirmation ? ` · ${tt("需要确认")}` : ""}</li>)}</ul></>}
    </div>}
  </ServerSection>;
}
const DIAGNOSIS_LABEL: Record<Diagnosis["state"], string> = {ok: "正常", node_offline: "设备程序离线", os_down: "系统未响应", stopped: "已停机", unpaid: "欠费", expired: "已到期", network_blocked: "网络受阻", disk_full: "磁盘已满", unknown: "状态未知"};

const INITIAL_RULE: RuleInput = {direction: "in", protocol: "tcp", port_range: "", source: "", policy: "accept", description: ""};
export function ServerFirewall({api, id, revision, changed}: {api: ServerPageClient; id: string; revision: number; changed: () => void}) {
  const tt = useUI();
  const load = useCallback(() => api.getRules(id), [api, id, revision]);
  const resource = useServerResource(load);
  const action = useServerAction(changed);
  const [rule, setRule] = useState<RuleInput>(INITIAL_RULE);
  return <ServerSection title="防火墙" id="firewall">
    {action.feedback}
    <ResourceView resource={resource}>{(data) => <>
      {data.rules.length === 0 ? <p className="mb-3 text-sm text-neutral-500">{tt("暂无防火墙规则")}</p> : <div className="mb-4 max-w-full overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["方向", "协议", "端口范围", "来源或目标", "策略", "说明", "操作"].map((label) => <th key={label} className="whitespace-nowrap p-2 font-medium">{tt(label)}</th>)}</tr></thead><tbody>{data.rules.map((item) => <tr key={item.id} className="border-t border-neutral-200"><td className="p-2">{tt(item.direction === "in" ? "入站" : "出站")}</td><td className="p-2">{item.protocol}</td><td className="p-2">{item.port_range}</td><td className="p-2">{item.source}</td><td className="p-2">{tt(item.policy === "accept" ? "允许" : "拒绝")}</td><td className="p-2">{item.description}</td><td className="p-2"><button type="button" className={DEVICE_BUTTON} disabled={action.busy} onClick={() => action.run((confirmed) => api.deleteRule(id, item.id, confirmed))}>{tt("移除")}</button></td></tr>)}</tbody></table></div>}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {event.preventDefault(); const input = {...rule}; action.run((confirmed) => api.addRule(id, {...input, confirmed}));}}>
        <label className="grid gap-1 text-sm">{tt("方向")}<select className={FIELD} value={rule.direction} onChange={(event) => setRule({...rule, direction: event.target.value as "in" | "out"})}><option value="in">{tt("入站")}</option><option value="out">{tt("出站")}</option></select></label>
        <label className="grid gap-1 text-sm">{tt("协议")}<select className={FIELD} value={rule.protocol} onChange={(event) => setRule({...rule, protocol: event.target.value})}>{["tcp", "udp", "icmp", "gre", "all"].map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="grid gap-1 text-sm">{tt("端口范围")}<input required className={FIELD} value={rule.port_range} onChange={(event) => setRule({...rule, port_range: event.target.value})} /></label>
        <label className="grid gap-1 text-sm">{tt("来源或目标")}<input required className={FIELD} value={rule.source} onChange={(event) => setRule({...rule, source: event.target.value})} /></label>
        <label className="grid gap-1 text-sm">{tt("策略")}<select className={FIELD} value={rule.policy} onChange={(event) => setRule({...rule, policy: event.target.value as "accept" | "drop"})}><option value="accept">{tt("允许")}</option><option value="drop">{tt("拒绝")}</option></select></label>
        <label className="grid gap-1 text-sm">{tt("说明")}<input className={FIELD} maxLength={256} value={rule.description} onChange={(event) => setRule({...rule, description: event.target.value})} /></label>
        <button type="submit" className={DEVICE_BUTTON} disabled={action.busy}>{tt("添加规则")}</button>
      </form>
    </>}</ResourceView>
  </ServerSection>;
}
