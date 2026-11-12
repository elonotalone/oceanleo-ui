"use client";

import { useEffect, useRef, useState } from "react";
import { cloudComputerApi, type CloudComputerClient, type Computer, type ComputerEvent } from "../../lib/cloud-computer-api";
import { computerActivityApi, type ComputerActivityClient } from "../../lib/computer-activity-api";
import { computerDisplayState, isConnectedComputer } from "../../shell/cloud-computer/computer-state";
import { ConnectServerDialog } from "../../shell/cloud-computer/ConnectServerDialog";
import { ConfirmDialog } from "../../ui";
import { useUI } from "../../i18n/ui/useUI";
import { CARD, CARD_DESC, CARD_TITLE, QUIET } from "./personalization/parts";
import { DeviceIcon } from "../devices/DeviceCard";
import { DeviceActivityPanel } from "../devices/DeviceActivityPanel";
import { formatDeviceTime } from "../devices/DeviceTasksDialog";
import { STATE_LABEL } from "../devices/CloudDeviceGrid";
import { serverEventCopy } from "./server-event-copy";
import { formatMinor } from "../../lib/money";
import { SERVER_MODE_COPY } from "./BudgetServerPurchase";
import { EnvironmentCard } from "./server-environments/EnvironmentCard";

/** A connected server (cloud computer) in Settings › Device settings, same cards as the other devices. */
export function ServerSettingsPanel({ computer, client = cloudComputerApi, activityClient = computerActivityApi, onUpdated, onRemoved }: {
  computer: Computer;
  client?: CloudComputerClient;
  activityClient?: ComputerActivityClient;
  onUpdated: () => void;
  onRemoved: () => void;
}) {
  const tt = useUI();
  const state = computerDisplayState(computer);
  const connected = isConnectedComputer(computer);
  const aliyun = computer.source === "aliyun";
  const [name, setName] = useState(computer.name);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [dashboard, setDashboard] = useState(false);
  const [resume, setResume] = useState(false);
  const [renewMonths, setRenewMonths] = useState(1);
  const [renewQuote, setRenewQuote] = useState<{amount_minor: number; currency: string} | null>(null);
  const renewRequest = useRef("");
  const [events, setEvents] = useState<ComputerEvent[]>([]);
  useEffect(() => {
    let alive = true;
    client.listComputerEvents(computer.id).then((result) => { if (alive) setEvents(result.items ?? []); }).catch(() => {});
    return () => { alive = false; };
  }, [client, computer.id]);
  async function renew() {
    if (busy || !client.renewServer || !renewQuote) return;
    setBusy(true); setError(null); renewRequest.current ||= crypto.randomUUID();
    try {
      await client.renewServer(computer.id, {request_id: renewRequest.current, period_months: renewMonths});
      setRenewQuote(null); renewRequest.current = ""; onUpdated();
      const result = await client.listComputerEvents(computer.id); setEvents(result.items);
    } catch (err) { setError(err instanceof Error ? err.message : tt("续费失败")); }
    finally { setBusy(false); }
  }
  async function previewRenewal() {
    if (busy || !client.getServerRenewalQuote) return;
    setBusy(true); setError(null);
    try { setRenewQuote(await client.getServerRenewalQuote(computer.id, renewMonths)); }
    catch (err) { setError(err instanceof Error ? err.message : tt("报价读取失败")); }
    finally { setBusy(false); }
  }
  async function act(operation: "rename" | "start" | "stop" | "remove") {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (operation === "rename") await client.renameComputer(computer.id, name.trim());
      if (operation === "start") await client.startComputer(computer.id);
      if (operation === "stop") await client.stopComputer(computer.id);
      if (operation === "remove") await client.deleteComputer(computer.id);
      setEditing(false); setConfirmRemove(false);
      if (operation === "remove") onRemoved(); else onUpdated();
    } catch { setError("操作未完成，请重试。"); }
    finally { setBusy(false); }
  }
  const info: [string, string][] = [
    ["类型", aliyun ? tt("阿里云") : tt("自有服务器")],
    ["系统", computer.node_os ?? "—"],
    ["主机名", computer.node_hostname ?? "—"],
    ["公网 IP", computer.node_public_ip ?? computer.public_ip ?? "—"],
  ];
  return <div className="space-y-5" data-server-settings={computer.id}>
    <section className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-neutral-200/70 text-neutral-700"><DeviceIcon className="h-8 w-8" /></span>
        <div className="min-w-0">{editing
          ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void act("rename"); }}><input aria-label={tt("设备名称")} maxLength={80} value={name} onInput={(event) => setName(event.currentTarget.value)} className="min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[14px]" /><button type="submit" disabled={busy || !name.trim()} className={QUIET}>{tt("保存")}</button></form>
          : <button type="button" onClick={() => setEditing(true)} className="max-w-full truncate text-[16px] font-semibold" aria-label={tt("修改设备名称")}>{computer.name} <span className="text-neutral-400">✎</span></button>}
          <p className="mt-1 text-[13px] text-neutral-500">{tt("云电脑")} · {tt(STATE_LABEL[state])}</p></div>
      </div>
      {connected && <button type="button" className={QUIET} data-server-dashboard-open={computer.id} onClick={() => setDashboard(true)}>{tt("看板")}</button>}
    </section>
    {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{tt(error)}</p>}
    <section className={CARD}>
      <h3 className={CARD_TITLE}>{tt("设备信息")}</h3>
      <dl className="mt-4 grid gap-4 text-[13px] sm:grid-cols-2">{info.map(([label, value]) => <div key={label}><dt className="text-[12px] text-neutral-400">{tt(label)}</dt><dd className="mt-1 break-all text-neutral-700">{value}</dd></div>)}</dl>
    </section>
    {(state === "pending_install" || state === "pending_confirm" || (aliyun && (state === "stopped" || state === "ready" || state === "offline"))) && <section className={CARD}>
      <h3 className={CARD_TITLE}>{tt("状态")}</h3>
      <div className="mt-4 flex flex-wrap gap-2">
        {(state === "pending_install" || state === "pending_confirm") && <button type="button" className={QUIET} onClick={() => setResume(true)}>{tt(state === "pending_confirm" ? "核对并确认" : "继续连接")}</button>}
        {aliyun && state === "stopped" && <button type="button" className={QUIET} disabled={busy} onClick={() => void act("start")}>{tt("开机")}</button>}
        {aliyun && (state === "ready" || state === "offline") && <button type="button" className={QUIET} disabled={busy} onClick={() => void act("stop")}>{tt("停机")}</button>}
      </div>
    </section>}
    {aliyun && computer.billing_mode && <section className={CARD}>
      <h3 className={CARD_TITLE}>{tt(SERVER_MODE_COPY[computer.billing_mode])}</h3>
      {computer.billing_mode === "preemptible" && <p className={CARD_DESC}>{tt("抢占式服务器可能被阿里云回收，请及时保存工作。")}</p>}
      {computer.expires_at && <p className={CARD_DESC}>{tt("到期时间")} {formatDeviceTime(computer.expires_at)}</p>}
      {computer.billing_mode === "monthly" && client.renewServer && <div className="mt-3 space-y-3">
        <label>{tt("续费月数")}<input aria-label={tt("续费月数")} type="number" min={1} max={9} className="ml-2 w-20 rounded border p-2" value={renewMonths} disabled={busy} onChange={(e) => { setRenewMonths(Number(e.target.value)); setRenewQuote(null); renewRequest.current = ""; }} /></label>
        <button type="button" className={`${QUIET} ml-2`} disabled={busy || renewMonths < 1 || renewMonths > 9 || !Number.isInteger(renewMonths)} onClick={() => void previewRenewal()}>{tt("查看续费价格")}</button>
        {renewQuote && <p>{tt("本次费用")} {formatMinor(renewQuote.amount_minor, renewQuote.currency)} <button type="button" className={QUIET} disabled={busy} onClick={() => void renew()}>{tt("确认支付并续费")}</button></p>}
      </div>}
    </section>}
    {connected && <EnvironmentCard computerId={computer.id} online={state === "ready"} />}
    {events.length > 0 && <section className={CARD}>
      <h3 className={CARD_TITLE}>{tt("最近活动")}</h3>
      <ul className="mt-3 space-y-3">{events.slice(0, 8).map((event) => <li key={event.id} className="flex justify-between gap-3 text-[12px] text-neutral-500"><span>{serverEventCopy(event, tt)}</span><span>{formatDeviceTime(event.created_at)}</span></li>)}</ul>
    </section>}
    <section className={`${CARD} flex items-center justify-between gap-4`}>
      <div><h3 className={CARD_TITLE}>{tt(aliyun ? "释放" : "移除")}</h3><p className={CARD_DESC}>{tt(aliyun ? "按阿里云规则释放，数据不可恢复" : "移除后不再连接这台服务器。")}</p></div>
      <button type="button" className={`${QUIET} text-red-600`} disabled={busy} onClick={() => setConfirmRemove(true)}>{tt(aliyun ? "释放" : "移除")}</button>
    </section>
    {confirmRemove && <ConfirmDialog title={tt(aliyun ? "确认释放" : "确认移除")} body={tt(aliyun ? "按阿里云规则释放，数据不可恢复" : "移除后不再连接这台服务器。")} confirmLabel={tt("确认")} danger onConfirm={() => void act("remove")} onCancel={() => setConfirmRemove(false)} />}
    {dashboard && <DeviceActivityPanel computerId={computer.id} name={computer.name} client={activityClient} initial={null} onActivity={() => {}} onClose={() => setDashboard(false)} />}
    {resume && <ConnectServerDialog client={client} resumeComputer={computer} onClose={() => setResume(false)} onCreated={() => { setResume(false); onUpdated(); }} />}
  </div>;
}
