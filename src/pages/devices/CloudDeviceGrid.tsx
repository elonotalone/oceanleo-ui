"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cloudComputerApi, type CloudComputerClient, type Computer, type ComputerEvent } from "../../lib/cloud-computer-api";
import { useUI } from "../../i18n/ui/useUI";
import { ConnectServerDialog } from "../../shell/cloud-computer/ConnectServerDialog";
import { computerDisplayState, isConnectedComputer, type ComputerDisplayState } from "../../shell/cloud-computer/computer-state";
import { serverPageHref } from "../../shell/cloud-computer/server-page/href";
import { DeviceDialog, DEVICE_BUTTON, DEVICE_PRIMARY_BUTTON } from "./DeviceDialog";
import { DeviceIcon } from "./DeviceCard";
import { formatDeviceTime } from "./DeviceTasksDialog";
import { WallpaperSurface } from "./DeviceCover";

const STATE_LABEL: Record<ComputerDisplayState, string> = { ready: "在线", offline: "离线", stopped: "已停机", unpaid: "欠费", provisioning: "正在开通", pending_install: "等待安装", pending_confirm: "待确认", error: "连接失败", gone: "已移除" };

/** Paired local clients and cloud nodes share a card grid, not their authority. */
export function CloudDeviceGrid({ client = cloudComputerApi, autoFocus = false }: { client?: CloudComputerClient; autoFocus?: boolean }) {
  const tt = useUI();
  const [computers, setComputers] = useState<Computer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resume, setResume] = useState<Computer | null>(null);
  const [revision, setRevision] = useState(0);
  const firstCard = useRef<HTMLElement | null>(null);
  const focused = useRef(false);
  useEffect(() => { if (autoFocus && !focused.current && firstCard.current?.scrollIntoView) { focused.current = true; firstCard.current.scrollIntoView({ block: "start" }); } }, [autoFocus, computers]);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const result = await client.listComputers();
        if (!alive) return;
        setComputers((result.items ?? []).filter((item) => computerDisplayState(item) !== "gone"));
        setError(null);
      } catch { if (alive) setError("云电脑暂时无法加载。"); }
      finally { if (alive) timer = setTimeout(refresh, 15_000); }
    }
    void refresh();
    return () => { alive = false; clearTimeout(timer); };
  }, [client, revision]);
  const selected = computers.find((item) => item.id === selectedId);
  function updated() { setRevision((value) => value + 1); }
  return <>
    {error && <p role="alert" className="col-span-full rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{tt(error)} <button type="button" onClick={updated} className="underline underline-offset-2">{tt("重试")}</button></p>}
    {computers.map((computer, index) => {
      const state = computerDisplayState(computer);
      return <article ref={index === 0 ? firstCard : undefined} key={computer.id} className="min-w-0 overflow-hidden rounded-[20px] border border-neutral-200 bg-white" data-oceanleo-cc-card={computer.id} data-oceanleo-cc-display-state={state}>
        <WallpaperSurface placeholder="此云电脑未提供桌面壁纸">
          {isConnectedComputer(computer) ? <Link className="absolute bottom-4 left-4 rounded-xl bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50" href={serverPageHref(computer.id)}>{tt("打开电脑")}</Link> : (state === "pending_install" || state === "pending_confirm") ? <button type="button" onClick={() => setResume(computer)} className="absolute bottom-4 left-4 rounded-xl bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50">{tt(state === "pending_confirm" ? "核对并确认" : "继续连接")}</button> : null}
        </WallpaperSurface>
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div className="flex min-w-0 items-start gap-3"><DeviceIcon className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" /><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-neutral-900">{computer.name}</h3><p className="mt-1 text-xs text-neutral-500">{tt("云电脑")}{computer.node_os ? ` · ${computer.node_os}` : ""}</p></div></div>
          <span className="flex shrink-0 items-center gap-1.5 text-sm text-neutral-500"><span className={`h-2 w-2 rounded-full ${state === "ready" ? "bg-emerald-500" : state === "error" || state === "unpaid" ? "bg-red-400" : "bg-neutral-400"}`} />{tt(STATE_LABEL[state])}</span>
        </div>
        <div className="grid grid-cols-2 border-t border-neutral-100 py-1.5"><button type="button" onClick={() => setSelectedId(computer.id)} className="px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">{tt("设置")}</button>{isConnectedComputer(computer) ? <Link className="px-3 py-2 text-center text-sm font-medium text-neutral-800 hover:bg-neutral-50" href={serverPageHref(computer.id, { card: "acp" })}>{tt("任务")}</Link> : <button type="button" onClick={() => setSelectedId(computer.id)} className="px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">{tt("详情")}</button>}</div>
      </article>;
    })}
    {selected && <CloudDeviceDetails key={selected.id} computer={selected} client={client} onClose={() => setSelectedId(null)} onUpdated={updated} onResume={() => { setSelectedId(null); setResume(selected); }} />}
    {resume && <ConnectServerDialog key={resume.id} client={client} resumeComputer={resume} onClose={() => setResume(null)} onCreated={() => { setResume(null); updated(); }} />}
  </>;
}

function CloudDeviceDetails({ computer, client, onClose, onUpdated, onResume }: { computer: Computer; client: CloudComputerClient; onClose: () => void; onUpdated: () => void; onResume: () => void }) {
  const tt = useUI();
  const state = computerDisplayState(computer);
  const [name, setName] = useState(computer.name);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [events, setEvents] = useState<ComputerEvent[]>([]);
  useEffect(() => {
    let alive = true;
    client.listComputerEvents(computer.id).then((result) => { if (alive) setEvents(result.items ?? []); }).catch(() => {});
    return () => { alive = false; };
  }, [client, computer.id]);
  async function act(operation: "rename" | "start" | "stop" | "remove") {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (operation === "rename") await client.renameComputer(computer.id, name.trim());
      if (operation === "start") await client.startComputer(computer.id);
      if (operation === "stop") await client.stopComputer(computer.id);
      if (operation === "remove") await client.deleteComputer(computer.id);
      setEditing(false); setConfirmRelease(false); onUpdated();
      if (operation === "remove") onClose();
    } catch { setError("操作未完成，请重试。"); }
    finally { setBusy(false); }
  }
  return <DeviceDialog title={tt("设备详情")} onClose={onClose} testId="cloud-settings">
    <div className="flex items-start justify-between gap-4 pb-7"><div className="flex min-w-0 items-center gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-neutral-200/70"><DeviceIcon className="h-8 w-8" /></div><div className="min-w-0">{editing ? <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void act("rename"); }}><input aria-label={tt("设备名称")} maxLength={80} value={name} onInput={(event) => setName(event.currentTarget.value)} className="min-w-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm" /><button type="submit" disabled={busy || !name.trim()} className={DEVICE_BUTTON}>{tt("保存")}</button></form> : <button type="button" onClick={() => setEditing(true)} className="max-w-full truncate text-lg font-semibold" aria-label={tt("修改设备名称")}>{computer.name} <span className="text-neutral-400">✎</span></button>}<p className="mt-1 text-sm text-neutral-500">{tt(STATE_LABEL[state])}</p></div></div>{isConnectedComputer(computer) && <Link className={DEVICE_BUTTON} href={serverPageHref(computer.id)}>{tt("打开电脑")}</Link>}</div>
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{tt(error)}</p>}
    <section className="border-t border-neutral-200 py-6"><h3 className="mb-4 text-sm font-semibold">{tt("设备信息")}</h3><dl className="grid gap-4 text-sm sm:grid-cols-2">{[["类型", computer.source === "aliyun" ? tt("阿里云") : tt("自有服务器")], ["系统", computer.node_os ?? "—"], ["主机名", computer.node_hostname ?? "—"], ["公网 IP", computer.node_public_ip ?? computer.public_ip ?? "—"]].map(([label, value]) => <div key={label}><dt className="text-xs text-neutral-400">{tt(label)}</dt><dd className="mt-1 break-all text-neutral-700">{value}</dd></div>)}</dl></section>
    <section className="flex flex-wrap gap-2 border-t border-neutral-200 py-6">{(state === "pending_install" || state === "pending_confirm") && <button type="button" className={DEVICE_BUTTON} onClick={onResume}>{tt(state === "pending_confirm" ? "核对并确认" : "继续连接")}</button>}{computer.source === "aliyun" && state === "stopped" && <button type="button" className={DEVICE_BUTTON} disabled={busy} onClick={() => void act("start")}>{tt("开机")}</button>}{computer.source === "aliyun" && (state === "ready" || state === "offline") && <button type="button" className={DEVICE_BUTTON} disabled={busy} onClick={() => void act("stop")}>{tt("停机")}</button>}<button type="button" className={`${DEVICE_BUTTON} text-red-600`} disabled={busy} onClick={() => setConfirmRelease(true)}>{tt(computer.source === "aliyun" ? "释放" : "移除")}</button></section>
    {events.length > 0 && <section className="border-t border-neutral-200 py-6"><h3 className="mb-3 text-sm font-semibold">{tt("最近活动")}</h3><ul className="space-y-3">{events.slice(0, 8).map((event) => <li key={event.id} className="flex justify-between gap-3 text-xs text-neutral-500"><span>{tt(event.kind === "node.confirmed" ? "主人已确认" : event.kind === "node.enrolled" ? "节点已注册" : "设备活动")}</span><span>{formatDeviceTime(event.created_at)}</span></li>)}</ul></section>}
    {confirmRelease && <DeviceDialog title={tt(computer.source === "aliyun" ? "确认释放" : "确认移除")} compact onClose={() => setConfirmRelease(false)} testId="cloud-remove"><p className="text-sm text-neutral-500">{tt(computer.source === "aliyun" ? "按阿里云规则释放，数据不可恢复" : "移除后不再连接这台服务器。")}</p><div className="mt-6 flex justify-end gap-2"><button type="button" className={DEVICE_BUTTON} onClick={() => setConfirmRelease(false)}>{tt("取消")}</button><button type="button" disabled={busy} className={DEVICE_PRIMARY_BUTTON} onClick={() => void act("remove")}>{tt("确认")}</button></div></DeviceDialog>}
  </DeviceDialog>;
}
