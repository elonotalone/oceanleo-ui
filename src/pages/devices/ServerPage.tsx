"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cloudComputerApi, CloudComputerError, COMPUTER_EVENT_KIND_LABEL, COMPUTER_STATUS_LABEL, type CloudComputerClient, type Computer } from "../../lib/cloud-computer-api";
import { serverPageApi, type Diagnosis, type ServerOverview, type ServerPageClient } from "../../lib/server-page-api";
import { computerActivityApi, upgradeConfirmList, type ComputerActivityClient, type ComputerActivity } from "../../lib/computer-activity-api";
import { portalHref } from "../../contracts/domain-family";
import { useUI } from "../../i18n/ui/useUI";
import { formatMinor } from "../../lib/money";
import { DeviceDialog, DEVICE_BUTTON } from "./DeviceDialog";
import { DeviceActivityPanel } from "./DeviceActivityPanel";
import { formatDeviceTime } from "./DeviceTasksDialog";
import { FIELD, OWN_PROVIDER, ResourceView, ServerSection, useServerAction, useServerResource } from "./server-page-shared";
import { serverEventCopy } from "../settings/server-event-copy";
import { ServerMonitoring } from "./ServerMonitoring";
import { ServerCosts } from "./ServerCosts";
import { ServerSnapshots, ServerDiagnosis, ServerFirewall } from "./ServerRescue";

const EVENT_LABEL: Record<string, string> = {...COMPUTER_EVENT_KIND_LABEL, "rescue.rebooted": "已重启服务器", "rescue.snapshot_created": "已创建快照", "rescue.rolled_back": "已回滚磁盘", "rescue.reinstalled": "已重装系统", "rescue.command": "救援命令已执行", "rescue.diagnosed": "已完成诊断", "node.offline_diagnosed": "设备离线诊断", "node.warning": "设备预警"};
const BILLING_LABEL: Record<string, string> = {pay_as_you_go: "按量付费", monthly: "包月", preemptible: "抢占式"};
function bytes(value: number | null | undefined) {return value == null ? "—" : `${(value / 1024 ** 3).toLocaleString(undefined, {maximumFractionDigits: 2})} GiB`;}

function Facts({overview, computer, managed}: {overview: ServerOverview; computer: Computer; managed: boolean}) {
  const tt = useUI();
  const action = useServerAction();
  const node = overview.node;
  const facts: [string, string | number | null | undefined, boolean?][] = managed ? [
    ["状态", tt(COMPUTER_STATUS_LABEL[overview.cloud_status?.toLowerCase() ?? ""] ?? overview.cloud_status ?? "—")], ["地区", overview.region_id], ["可用区", overview.zone_id], ["公网 IP", overview.public_ip, true], ["私网 IP", overview.private_ip, true],
    ["规格", overview.instance_type], ["CPU 核数", overview.vcpu], ["内存", overview.memory_gb == null ? null : `${overview.memory_gb} GiB`], ["系统", overview.os_name],
    ["创建时间", formatDeviceTime(overview.created_at)], ["到期时间", overview.expires_at ? formatDeviceTime(overview.expires_at) : tt("无固定到期时间")], ["计费方式", tt(BILLING_LABEL[overview.billing_mode ?? ""] ?? overview.billing_mode ?? "—")],
  ] : [["系统", [node?.os ?? computer.node_os, node?.os_version].filter(Boolean).join(" ") || null], ["CPU 核数", node?.cpus ?? computer.node_cpus], ["内存", bytes(node?.mem_bytes ?? computer.node_mem_bytes)], ["主机名", node?.hostname ?? computer.node_hostname], ["节点版本", node?.version ?? computer.node_version], ["架构", node?.arch ?? computer.node_arch], ["内核", node?.kernel ?? computer.node_kernel]];
  return <>
    {action.feedback}
    {!managed && <p className="mb-4 text-sm text-neutral-500">{tt(OWN_PROVIDER)}</p>}
    <dl className="grid gap-4 sm:grid-cols-2">{facts.map(([label, value, copy]) => <div key={label} className="min-w-0"><dt className="text-xs text-neutral-500">{tt(label)}</dt><dd className="mt-1 break-all text-sm">{value ?? "—"} {copy && !!value && <button type="button" className="ml-2 underline" aria-label={tt("复制{label}", {label: tt(label)})} onClick={() => action.run(async () => {if (!navigator.clipboard) throw new Error(tt("无法复制，请手动选择地址。")); await navigator.clipboard.writeText(String(value));})}>{tt("复制")}</button>}</dd></div>)}</dl>
    {managed && <div className="mt-4 border-t border-neutral-200 pt-3"><h4 className="mb-2 text-sm font-medium">{tt("磁盘")}</h4>{overview.disks?.length ? <ul className="space-y-1 text-sm">{overview.disks.map((disk, index) => <li key={disk.disk_id ?? index} className="break-all">{tt(disk.kind === "system" ? "系统盘" : "数据盘")} · {disk.size_gb == null ? "—" : `${disk.size_gb} GB`} · {disk.category ?? "—"} · {disk.disk_id ?? "—"}</li>)}</ul> : <p className="text-sm text-neutral-500">{tt("暂无数据")}</p>}</div>}
  </>;
}

function Power({computer, client, api, changed, removed}: {computer: Computer; client: CloudComputerClient; api: ServerPageClient; changed: () => void; removed: () => void}) {
  const tt = useUI();
  const action = useServerAction(changed);
  const [months, setMonths] = useState(1);
  const [quote, setQuote] = useState<{amount_minor: number; currency: string} | null>(null);
  const requestId = useRef("");
  const stable = !["provisioning", "starting", "stopping", "releasing", "released", "removed"].includes(computer.status);
  const paid = computer.charge_status !== "unpaid" && !(computer.expires_at && Date.parse(computer.expires_at) < Date.now());
  const running = stable && paid && ["running", "active"].includes(computer.status);
  return <>
    {action.feedback}
    <div className="flex flex-wrap gap-2">
      {computer.status === "stopped" && paid && <button type="button" className={DEVICE_BUTTON} disabled={action.busy} onClick={() => action.run(() => client.startComputer(computer.id))}>{tt("开机")}</button>}
      {running && <><button type="button" className={DEVICE_BUTTON} disabled={action.busy} onClick={() => action.run(() => client.stopComputer(computer.id), {title: tt("确认停机"), body: tt("停机会中断正在运行的程序和连接；磁盘会保留并继续计费。")})}>{tt("停机")}</button><button type="button" className={DEVICE_BUTTON} disabled={action.busy} onClick={() => action.run(() => api.reboot(computer.id, false), {title: tt("重启服务器"), body: tt("重启会中断正在运行的程序和连接。")})}>{tt("重启")}</button><button type="button" className={DEVICE_BUTTON} disabled={action.busy} onClick={() => action.run(() => api.reboot(computer.id, true), {title: tt("强制重启"), body: tt("强制重启会中断程序，未保存的数据可能丢失。")})}>{tt("强制重启")}</button></>}
      {stable && <button type="button" className={DEVICE_BUTTON} disabled={action.busy} onClick={() => action.run(async () => {await client.deleteComputer(computer.id); removed();}, {title: tt("确认释放"), body: tt("释放会删除服务器及其磁盘，数据不可恢复。")})}>{tt("释放")}</button>}
      {!stable && <p className="text-sm text-neutral-500">{tt("服务器正在变更状态，请稍后刷新。")}</p>}
    </div>
    {stable && computer.billing_mode === "monthly" && client.getServerRenewalQuote && client.renewServer && <div className="mt-4 flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">{tt("续费月数")}<input className={`${FIELD} w-24`} type="number" min={1} max={9} disabled={action.busy} value={months} onChange={(event) => {setMonths(Number(event.target.value)); setQuote(null); requestId.current = "";}} /></label><button type="button" className={DEVICE_BUTTON} disabled={action.busy || !Number.isInteger(months) || months < 1 || months > 9} onClick={() => action.run(async () => {setQuote(await client.getServerRenewalQuote!(computer.id, months));})}>{tt("查看续费价格")}</button>{quote && <><span className="text-sm">{tt("本次费用")} {formatMinor(quote.amount_minor, quote.currency)}</span><button type="button" className={DEVICE_BUTTON} disabled={action.busy} onClick={() => action.run(async () => {requestId.current ||= crypto.randomUUID(); await client.renewServer!(computer.id, {request_id: requestId.current, period_months: months}); setQuote(null); requestId.current = "";})}>{tt("确认支付并续费")}</button></>}</div>}
  </>;
}

function Events({client, api, id, managed, revision}: {client: CloudComputerClient; api: ServerPageClient; id: string; managed: boolean; revision: number}) {
  const tt = useUI();
  const load = useCallback(() => client.listComputerEvents(id), [client, id, revision]);
  const local = useServerResource(load);
  const loadCloud = useCallback(() => managed ? api.getSystemEvents(id) : Promise.resolve({items: []}), [api, id, managed, revision]);
  const cloud = useServerResource(loadCloud);
  const merged = [...(local.data?.items ?? []).map((event) => ({id: `local:${event.id}`, at: event.created_at, text: EVENT_LABEL[event.kind] ? tt(EVENT_LABEL[event.kind]) : serverEventCopy(event, tt), detail: typeof event.detail.text === "string" ? event.detail.text : typeof event.detail.message === "string" ? event.detail.message : ""})), ...(cloud.data?.items ?? []).map((event, index) => ({id: `cloud:${event.id ?? index}`, at: event.at, text: event.text || event.type, detail: event.status}))].sort((a, b) => (b.at ? Date.parse(b.at) : 0) - (a.at ? Date.parse(a.at) : 0));
  return <ServerSection title="事件" id="events">
    {!managed && <p className="mb-3 text-sm text-neutral-500">{tt(OWN_PROVIDER)}</p>}
    <ResourceView resource={local}>{() => null}</ResourceView>
    {managed && <ResourceView resource={cloud}>{() => null}</ResourceView>}
    {!local.loading && !cloud.loading && !local.error && !cloud.error && !merged.length && <p className="text-sm text-neutral-500">{tt("暂无事件")}</p>}
    <ol className="space-y-3">{merged.map((event) => <li key={event.id} className="text-sm"><time className="text-xs text-neutral-500">{formatDeviceTime(event.at)}</time><p className="break-words">{event.text}{event.detail && ` · ${event.detail}`}</p></li>)}</ol>
  </ServerSection>;
}

function CustomInfo({api, id, revision, needsUpgrade, upgrade}: {api: ServerPageClient; id: string; revision: number; needsUpgrade: boolean; upgrade: () => void}) {
  const tt = useUI();
  const load = useCallback(() => api.getCustomInfo(id), [api, id, revision]);
  const resource = useServerResource(load);
  return <ServerSection title="设备自行上报" id="custom-info">{needsUpgrade && <p className="mb-3 text-sm text-amber-700">{tt("需要升级设备程序")} <button type="button" className={DEVICE_BUTTON} onClick={upgrade}>{tt("升级节点")}</button></p>}<p className="mb-3 text-sm text-neutral-500">{tt("以下信息由设备自行上报，OceanLeo 未验证，不用于计费或控制。")}</p><ResourceView resource={resource}>{(data) => <>{data.reported_at && <p className="mb-3 text-xs text-neutral-500">{formatDeviceTime(data.reported_at)}</p>}{data.items.length ? <dl className="grid gap-3 sm:grid-cols-2">{data.items.map((item) => <div key={item.key} className="min-w-0 text-sm"><dt className="text-neutral-500">{item.label}</dt><dd className="whitespace-pre-wrap break-words">{item.value}</dd></div>)}</dl> : <p className="text-sm text-neutral-500">{tt("尚未上报额外信息，可以让 agent 在这台设备上设置。")}</p>}</>}</ResourceView></ServerSection>;
}

export function ServerPage({computer: initial, client = cloudComputerApi, api = serverPageApi, activityClient = computerActivityApi, initialActivity, onActivity, onUpdated, onClose, onNavigate}: {
  onNavigate?: (href: string) => void;
  computer: Computer; client?: CloudComputerClient; api?: ServerPageClient; activityClient?: ComputerActivityClient;
  initialActivity?: ComputerActivity | null; onActivity?: (activity: ComputerActivity) => void; onUpdated?: () => void; onClose: () => void;
}) {
  const tt = useUI();
  const [computer, setComputer] = useState(initial);
  const [revision, setRevision] = useState(0);
  const [upgradingTo, setUpgradingTo] = useState<string | null>(null);
  const [awaitingEnrolment, setAwaitingEnrolment] = useState<string | null>(null);
  const [reinstallPending, setReinstallPending] = useState(false);
  const updated = useRef(onUpdated); updated.current = onUpdated;
  const refresh = useCallback(() => {setRevision((v) => v + 1); updated.current?.();}, []);
  const loadComputer = useCallback(() => client.getComputer(initial.id), [client, initial.id, revision]);
  const current = useServerResource(loadComputer);
  useEffect(() => {if (current.data) setComputer(current.data);}, [current.data]);
  useEffect(() => {
    if (awaitingEnrolment === null) return;
    if (current.data?.node_online && current.data.enrolled_at && current.data.enrolled_at !== awaitingEnrolment) {setAwaitingEnrolment(null); return;}
    const timer = setInterval(current.refresh, 5_000);
    return () => clearInterval(timer);
  }, [awaitingEnrolment, current.data, current.refresh]);
  const loadOverview = useCallback(() => api.getOverview(initial.id), [api, initial.id, revision]);
  const overview = useServerResource(loadOverview);
  const managed = computer.source === "aliyun" && overview.data?.managed !== false;
  const loadNode = useCallback(() => api.getNode(initial.id), [api, initial.id, revision]);
  const node = useServerResource(loadNode);
  const upgradeAction = useServerAction();
  useEffect(() => {
    if (!upgradingTo) return;
    if (node.data?.version === upgradingTo) {setUpgradingTo(null); refresh(); return;}
    const timer = setTimeout(node.retry, 10_000);
    return () => clearTimeout(timer);
  }, [upgradingTo, node.data, node.retry, refresh]);
  function upgrade() {
    upgradeAction.run(async (confirmed) => {
      try {const result = await activityClient.upgradeNode(computer.id, confirmed ? {confirm: true} : {}); setUpgradingTo(result.to); refresh();}
      catch (error) {const list = upgradeConfirmList(error); if (!list) throw error; throw new CloudComputerError("needs_confirmation", "", 409, undefined, {loses: [tt("升级会结束这些程序和终端"), ...list.programs.map((p) => `${p.program} · ${p.task_title ?? p.task_id ?? p.slot}`), ...list.terminals.map((t) => t.title ?? t.session_id)].join("\n")});}
    });
  }
  async function agent(diagnosis: Diagnosis | null) {
    const prompt = [tt("请检查并处理服务器「{name}」（{id}）的问题。涉及丢失数据或中断服务的操作，请先征得我的确认。", {name: computer.name, id: computer.id}), ...(diagnosis?.findings.map((finding) => finding.text) ?? []), ...(diagnosis?.suggested.map((suggestion) => suggestion.text) ?? [])].join("\n");
    const {createTask} = await import("../../lib/agent");
    const result = await createTask({prompt, mode: "agent", siteId: "oceanleo", executionTarget: {kind: "cloud"}});
    if (!result.ok || !result.data?.task_id) throw new Error(result.error || tt("操作未完成，请重试。"));
    const href = portalHref(`/tasks/${encodeURIComponent(result.data.task_id)}`);
    if (onNavigate) onNavigate(href); else window.location.assign(href);
    onClose();
  }
  return <DeviceDialog title={computer.name} onClose={onClose} testId="server-page">
    <div className="space-y-4" data-server-page={computer.id}>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm">{awaitingEnrolment !== null ? tt("服务器已重装，正在等待设备程序重新连接。") : <>{tt(COMPUTER_STATUS_LABEL[computer.status] ?? computer.status)} · {tt(computer.node_online ? "在线" : "离线")}</>}</p><button type="button" className={DEVICE_BUTTON} onClick={refresh}>{tt("刷新")}</button></div>
      {current.error != null && <ResourceView resource={current}>{() => null}</ResourceView>}
      <ServerSection title="基本信息" id="facts"><ResourceView resource={overview}>{(data) => <Facts overview={data} computer={computer} managed={managed} />}</ResourceView></ServerSection>
      <ServerSection title="电源与续费" id="power">{managed ? <Power computer={computer} client={client} api={api} changed={refresh} removed={() => {refresh(); onClose();}} /> : <p className="text-sm text-neutral-500">{tt(OWN_PROVIDER)}</p>}</ServerSection>
      <ServerSection title="设备程序" id="node">
        {upgradeAction.feedback}
        <ResourceView resource={node}>{(data) => <div className="space-y-3 text-sm"><p>{tt("节点版本")} {data.version || "—"}{data.latest_version && ` → ${data.latest_version}`}</p>{data.needs_upgrade && <p className="text-amber-700">{tt("需要升级设备程序")}</p>}{(data.needs_upgrade || upgradingTo) && <button type="button" className={DEVICE_BUTTON} disabled={upgradeAction.busy || !!upgradingTo || !computer.node_online} onClick={upgrade}>{tt(upgradingTo ? "正在升级…" : "升级节点")}</button>}<label className="flex items-center gap-2"><input type="checkbox" role="switch" checked={data.auto_upgrade} disabled={upgradeAction.busy || data.auto_upgrade_available !== true} onChange={(event) => {const enabled = event.target.checked; upgradeAction.run(async () => {await api.setAutoUpgrade(computer.id, enabled); node.retry();});}} />{tt("自动升级设备程序")}</label>{data.auto_upgrade_available !== true && <p className="text-neutral-500">{tt("自动升级设置尚未在当前服务端开通。")}</p>}</div>}</ResourceView>
      </ServerSection>
      <ServerMonitoring api={api} id={computer.id} managed={managed} online={computer.node_online} revision={revision} upgrade={upgrade} />
      <ServerCosts api={api} client={client} id={computer.id} revision={revision} changed={refresh} />
      {managed ? <ServerSnapshots api={api} id={computer.id} revision={revision} changed={refresh} pending={reinstallPending} /> : <ServerSection title="快照" id="snapshots"><p className="text-sm text-neutral-500">{tt(OWN_PROVIDER)}</p></ServerSection>}
      <ServerDiagnosis api={api} id={computer.id} managed={managed} changed={refresh} onAgent={agent} awaitingReconnect={awaitingEnrolment !== null} onReinstalled={(result) => {if (result.node_status === "awaiting_enrolment") setAwaitingEnrolment(computer.enrolled_at ?? "");}} onReinstallPending={setReinstallPending} />
      {managed ? <ServerFirewall api={api} id={computer.id} revision={revision} changed={refresh} /> : <ServerSection title="防火墙" id="firewall"><p className="text-sm text-neutral-500">{tt(OWN_PROVIDER)}</p></ServerSection>}
      <Events api={api} client={client} id={computer.id} managed={managed} revision={revision} />
      <ServerSection title="正在运行的程序" id="programs"><DeviceActivityPanel embedded computerId={computer.id} name={computer.name} client={activityClient} initial={initialActivity} onActivity={onActivity} onClose={onClose} /></ServerSection>
      <CustomInfo api={api} id={computer.id} revision={revision} needsUpgrade={!!node.data?.needs_upgrade && !node.data.caps.includes("custom_info")} upgrade={upgrade} />
    </div>
  </DeviceDialog>;
}
