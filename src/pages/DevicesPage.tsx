"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { deviceErrorCopy } from "../api/device-error-copy";
import { deviceSettingsClient as defaultSettingsClient, type DeviceSettingsClient } from "../api/device-settings";
import { remoteDesktopClient as defaultRemoteDesktopClient, type RemoteDesktopClient, type RemoteDesktopStatus } from "../api/remote-desktop";
import { devicesFacade, type Device, type DevicesFacade } from "../facades/devices";
import { cloudComputerApi, type CloudComputerClient } from "../lib/cloud-computer-api";
import { useUI } from "../i18n/ui/useUI";
import { ConfirmDialog } from "../ui";
import { CreateComputerDialog } from "../shell/cloud-computer/CreateComputerDialog";
import { ConnectServerDialog } from "../shell/cloud-computer/ConnectServerDialog";
import { CloudComputersSection } from "./CloudComputersPage";
import { RemoteDesktopPanel, requestRemoteDesktopFullscreen } from "./RemoteDesktopPanel";
import { DeviceCard, DeviceIcon, isComputer, type DeviceAvailability } from "./devices/DeviceCard";
import { DEVICE_BUTTON, DEVICE_PRIMARY_BUTTON, DeviceDialog } from "./devices/DeviceDialog";
import { DeviceSettingsDialog } from "./devices/DeviceSettingsDialog";
import { DeviceTasksDialog } from "./devices/DeviceTasksDialog";

export type DevicesPageTab = "devices" | "cloud";
export interface DevicesPageProps {
  client?: DevicesFacade;
  cloudClient?: CloudComputerClient;
  settingsClient?: DeviceSettingsClient;
  remoteDesktopClient?: RemoteDesktopClient;
  remoteStatusIntervalMs?: number;
  initialTab?: DevicesPageTab;
  /** Compatibility for embedding consumers, no longer an account Settings tab. */
  variant?: "page" | "pane";
}

/** Never promote a legacy heartbeat boolean to authenticated availability. */
export function deviceAvailability(device: Device, status?: RemoteDesktopStatus): DeviceAvailability {
  const availability = status?.availability ?? device.availability;
  return availability === "online" || availability === "signed_out" || availability === "offline" ? availability : "unknown";
}

function desktopFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const id = new URLSearchParams(window.location.search).get("desktop");
  return id && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}

export function DevicesPage({ client = devicesFacade, cloudClient = cloudComputerApi, settingsClient = defaultSettingsClient,
  remoteDesktopClient = defaultRemoteDesktopClient, remoteStatusIntervalMs = 10_000, initialTab, variant = "page" }: DevicesPageProps) {
  const tt = useUI();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pairCode, setPairCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [tasksId, setTasksId] = useState<string | null>(null);
  const [remoteOpenId, setRemoteOpenId] = useState<string | null>(desktopFromLocation);
  const [remoteStatus, setRemoteStatus] = useState<Record<string, RemoteDesktopStatus>>({});
  const [confirmRevoke, setConfirmRevoke] = useState<Device | null>(null);
  const [authRevision, setAuthRevision] = useState(0);
  const [createCloud, setCreateCloud] = useState(false);
  const [connectServer, setConnectServer] = useState(false);
  const [cloudRevision, setCloudRevision] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const changed = () => setRemoteOpenId(desktopFromLocation());
    window.addEventListener("popstate", changed);
    return () => window.removeEventListener("popstate", changed);
  }, []);

  async function refreshDevices() {
    const ticket = generation.current;
    const result = await client.listDevices();
    if (ticket !== generation.current) return result;
    if (result.ok && result.data) { setDevices(result.data); setPageError(null); }
    else setPageError(deviceErrorCopy(result.error, { limit: result.limit }));
    return result;
  }
  useEffect(() => {
    let alive = true;
    let loadTicket = 0;
    let account: string | null | undefined;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      const ticket = ++loadTicket;
      try {
        const result = await client.listDevices();
        if (!alive || ticket !== loadTicket) return;
        if (result.ok && result.data) { setDevices(result.data); setPageError(null); }
        else setPageError(deviceErrorCopy(result.error, { limit: result.limit }));
      } catch { if (alive && ticket === loadTicket) setPageError(deviceErrorCopy("network_error")); }
      finally { if (alive && ticket === loadTicket) { setLoading(false); timer = setTimeout(load, 15_000); } }
    }
    function onAccountChange(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string | null }>).detail;
      if (detail && "userId" in detail) { if (detail.userId === account) return; account = detail.userId; }
      generation.current += 1;
      clearTimeout(timer);
      setDevices([]); setRemoteStatus({}); setSettingsId(null); setTasksId(null); setRemoteOpenId(null);
      const url = new URL(window.location.href); url.searchParams.delete("desktop");
      window.history.replaceState(window.history.state, "", url);
      setConfirmRevoke(null); setAdding(false); setConnecting(false); setCreateCloud(false); setConnectServer(false); setPairCode(""); setPairing(false); setLoading(true);
      setAuthRevision((value) => value + 1);
      void load();
    }
    void load();
    window.addEventListener("oceanleo:auth-state", onAccountChange);
    return () => { alive = false; generation.current += 1; clearTimeout(timer); window.removeEventListener("oceanleo:auth-state", onAccountChange); };
  }, [client]);

  const remoteTargetKey = useMemo(() => devices.filter(isComputer).slice(0, 20).map((item) => item.device_id).join(","), [devices]);
  useEffect(() => {
    if (!remoteTargetKey) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!document.hidden) await Promise.all(remoteTargetKey.split(",").map(async (deviceId) => {
        try {
          const result = await remoteDesktopClient.getStatus(deviceId, { signal: controller.signal });
          if (controller.signal.aborted) return;
          setRemoteStatus((current) => {
            if (result.ok && result.data) return { ...current, [deviceId]: result.data };
            const next = { ...current }; delete next[deviceId]; return next;
          });
        } catch { /* Device list retains its separately authenticated availability. */ }
      }));
      if (!controller.signal.aborted) timer = setTimeout(poll, remoteStatusIntervalMs);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [remoteTargetKey, remoteDesktopClient, remoteStatusIntervalMs, authRevision]);

  async function pair(event: FormEvent) {
    event.preventDefault();
    const code = pairCode.trim();
    if (code.length !== 8 || pairing) return;
    const ticket = generation.current;
    setPairing(true); setPairError(null);
    try {
      const result = await client.pairDevice(code);
      if (ticket !== generation.current) return;
      if (!result.ok) setPairError(deviceErrorCopy(result.error, { limit: result.limit }));
      else { setPairCode(""); setConnecting(false); await refreshDevices(); }
    } catch { if (ticket === generation.current) setPairError(deviceErrorCopy("network_error")); }
    finally { if (ticket === generation.current) setPairing(false); }
  }
  async function rename(device: Device, name: string) {
    const ticket = generation.current;
    try {
      const result = await client.renameDevice(device.device_id, name);
      if (ticket !== generation.current) return false;
      if (!result.ok) { setPageError(deviceErrorCopy(result.error, { limit: result.limit })); return false; }
      await refreshDevices();
      return true;
    } catch { if (ticket === generation.current) setPageError(deviceErrorCopy("network_error")); return false; }
  }
  async function revoke(device: Device) {
    const ticket = generation.current;
    setConfirmRevoke(null);
    try {
      const result = await client.revokeDevice(device.device_id);
      if (ticket !== generation.current) return;
      if (!result.ok) setPageError(deviceErrorCopy(result.error, { limit: result.limit }));
      else await refreshDevices();
    } catch { if (ticket === generation.current) setPageError(deviceErrorCopy("network_error")); }
  }
  function openDesktop(deviceId: string) {
    requestRemoteDesktopFullscreen();
    const url = new URL(window.location.href);
    if (url.searchParams.get("desktop") !== deviceId) {
      url.searchParams.set("desktop", deviceId);
      window.history.pushState({ ...window.history.state, oceanleoDesktopEntry: deviceId }, "", url);
    }
    setSettingsId(null); setTasksId(null); setRemoteOpenId(deviceId);
  }
  function closeDesktop() {
    const id = remoteOpenId;
    setRemoteOpenId(null);
    if (id && window.history.state?.oceanleoDesktopEntry === id) window.history.back();
    else {
      const url = new URL(window.location.href); url.searchParams.delete("desktop");
      window.history.replaceState(window.history.state, "", url);
    }
  }
  const selectedSettings = devices.find((item) => item.device_id === settingsId);
  const selectedTasks = devices.find((item) => item.device_id === tasksId);
  const selectedRemote = devices.find((item) => item.device_id === remoteOpenId && isComputer(item));

  return <div className={variant === "pane" ? "min-h-0" : "mx-auto flex min-h-full w-full max-w-7xl flex-col px-5 py-7 sm:px-8"} data-oceanleo-devices-page data-devices-pane={variant === "pane" ? "" : undefined}>
    <header className="flex items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{tt("我的设备")}</h1><p className="mt-2 text-sm text-neutral-500">{tt("你的电脑与云电脑")}</p></div><button type="button" className={DEVICE_BUTTON} onClick={() => setAdding(true)}><span aria-hidden="true">＋</span>{tt("添加设备")}</button></header>
    {pageError && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{tt(pageError)}</p>}
    {remoteOpenId && !selectedRemote && !loading && !pageError && <div role="status" className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-600"><span>{tt("当前账号找不到这台电脑。")}</span><button type="button" onClick={closeDesktop} className="underline underline-offset-4">{tt("返回设备")}</button></div>}
    <div className="mt-7 grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-3" data-device-grid data-all-offline={devices.length > 0 && devices.every((item) => deviceAvailability(item, remoteStatus[item.device_id]) !== "online") ? "true" : "false"}>
      {loading ? <div className="min-h-[300px] animate-pulse rounded-[20px] bg-neutral-100" aria-label={tt("正在加载设备")} /> : devices.map((device) => <DeviceCard key={`${authRevision}-${device.device_id}`} device={device} client={settingsClient} availability={deviceAvailability(device, remoteStatus[device.device_id])} onSettings={() => setSettingsId(device.device_id)} onTasks={() => setTasksId(device.device_id)} onControl={() => openDesktop(device.device_id)} />)}
      <CloudComputersSection key={`${authRevision}-${cloudRevision}`} client={cloudClient} variant="device-grid" autoFocus={initialTab === "cloud" || (typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("tab") === "cloud" || window.location.hash === "#cloud"))} />
      {!loading && devices.length === 0 && <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[20px] border border-dashed border-neutral-200 px-5 py-10 text-center" data-device-connect-card>
        <DeviceIcon className="h-9 w-9 text-neutral-400" /><p className="mb-5 mt-4 text-base text-neutral-600">{tt(!loading && devices.length === 0 ? "连接你的电脑" : "添加设备")}</p>
        <button type="button" className={DEVICE_BUTTON} onClick={() => setConnecting(true)}>{tt("连接我的电脑")}</button>
      </div>}
    </div>
    {adding && <DeviceDialog title={tt("添加设备")} compact onClose={() => setAdding(false)} testId="add">
      <div className="grid gap-2">{[["连接我的电脑", () => setConnecting(true)], ["创建云电脑", () => setCreateCloud(true)], ["连接我的服务器", () => setConnectServer(true)]].map(([label, action]) => <button key={String(label)} type="button" className={`${DEVICE_BUTTON} justify-start py-3`} onClick={() => { setAdding(false); (action as () => void)(); }}><DeviceIcon className="h-4 w-4" />{tt(String(label))}</button>)}</div><a className="mt-5 inline-block text-sm text-neutral-500 underline underline-offset-4" href="/download">{tt("下载客户端")}</a>
    </DeviceDialog>}
    {connecting && <DeviceDialog title={tt("连接我的电脑")} compact onClose={() => setConnecting(false)} testId="connect">
      <form id="device-connect-form" onSubmit={pair}><label className="mb-2 block text-sm text-neutral-500" htmlFor="device-pair-code">{tt("输入客户端的配对码")}</label><div className="flex flex-wrap gap-2"><input id="device-pair-code" aria-label={tt("8 位配对码")} autoComplete="one-time-code" inputMode="text" maxLength={8} value={pairCode} onInput={(event) => { setPairCode(event.currentTarget.value.replace(/\s/g, "")); setPairError(null); }} placeholder={tt("输入 8 位配对码")} className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 font-mono text-base tracking-widest outline-none focus:border-neutral-400" /><button type="submit" disabled={pairing || pairCode.trim().length !== 8} className={DEVICE_PRIMARY_BUTTON}>{tt(pairing ? "正在配对…" : "连接设备")}</button></div>{pairError && <p role="alert" className="mt-3 text-sm text-red-600">{tt(pairError)}</p>}</form><a className="mt-5 inline-block text-sm text-neutral-500 underline underline-offset-4" href="/download">{tt("下载客户端")}</a>
    </DeviceDialog>}
    {selectedSettings && <DeviceSettingsDialog key={`${authRevision}-${selectedSettings.device_id}`} device={selectedSettings} availability={deviceAvailability(selectedSettings, remoteStatus[selectedSettings.device_id])} client={settingsClient} onClose={() => setSettingsId(null)} onControl={() => openDesktop(selectedSettings.device_id)} onRename={(name) => rename(selectedSettings, name)} onRevoke={() => { setSettingsId(null); setConfirmRevoke(selectedSettings); }} />}
    {selectedTasks && <DeviceTasksDialog key={`${authRevision}-${selectedTasks.device_id}`} deviceId={selectedTasks.device_id} deviceName={selectedTasks.device_name} client={settingsClient} onClose={() => setTasksId(null)} />}
    {selectedRemote && <RemoteDesktopPanel key={`${authRevision}-${selectedRemote.device_id}`} deviceId={selectedRemote.device_id} deviceName={selectedRemote.device_name} client={remoteDesktopClient} onClose={closeDesktop} />}
    {confirmRevoke && <ConfirmDialog title={tt("撤销「{name}」？", { name: confirmRevoke.device_name })} body={tt("撤销后这台电脑立刻不再接收任何任务，需要重新配对。")} confirmLabel={tt("确认撤销")} danger onConfirm={() => revoke(confirmRevoke)} onCancel={() => setConfirmRevoke(null)} />}
    {createCloud && <CreateComputerDialog client={cloudClient} onClose={() => setCreateCloud(false)} onCreated={() => { setCreateCloud(false); setCloudRevision((value) => value + 1); }} />}
    {connectServer && <ConnectServerDialog client={cloudClient} onClose={() => setConnectServer(false)} onCreated={() => { setConnectServer(false); setCloudRevision((value) => value + 1); }} />}
  </div>;
}
