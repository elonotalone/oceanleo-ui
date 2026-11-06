"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { deviceErrorCopy } from "../api/device-error-copy";
import { deviceSettingsClient as defaultSettingsClient, type DeviceSettingsClient } from "../api/device-settings";
import { remoteDesktopClient as defaultRemoteDesktopClient, type RemoteDesktopClient, type RemoteDesktopStatus } from "../api/remote-desktop";
import { devicesFacade, type Device, type DevicesFacade } from "../facades/devices";
import { cloudComputerApi, type CloudComputerClient } from "../lib/cloud-computer-api";
import { useUI } from "../i18n/ui/useUI";
import { CreateComputerDialog } from "../shell/cloud-computer/CreateComputerDialog";
import { ConnectServerDialog } from "../shell/cloud-computer/ConnectServerDialog";
import { CloudDeviceGrid } from "./devices/CloudDeviceGrid";
import { AuthDialog } from "./AuthDialog";
import { RemoteDesktopPanel, requestRemoteDesktopFullscreen } from "./RemoteDesktopPanel";
import { remoteDesktopTicket, type RemoteDesktopTicket } from "./remote-desktop-ticket";
import { DeviceCard, DeviceIcon, isComputer, type DeviceAvailability } from "./devices/DeviceCard";
import { DEVICE_BUTTON, DEVICE_PRIMARY_BUTTON, DeviceDialog } from "./devices/DeviceDialog";
import { openSettingsModal } from "./settings/settings-tabs";
import { readLocalDeviceId } from "./devices/local-device";
import { deviceRevocationNotice, deviceSettingsErrorCopy, runDeviceRequest, runDeviceSettingsOperation } from "./devices/device-settings-state";
import { DeviceTasksDialog } from "./devices/DeviceTasksDialog";
import { deviceCloudAgentClient, useDeviceCloudAgent, type DeviceCloudAgentClient } from "./devices/use-device-cloud-agent";
import { legacyImportErrorCopy, type LegacyImportErrorCode } from "../lib/computer-task-import-state";

export type DevicesPageTab = "devices" | "cloud";
export interface DevicesPageProps {
  /** Legacy `/computers/<id>` adapter result, supplied by a portal route when available. */
  legacyImportError?: LegacyImportErrorCode | null;
  client?: DevicesFacade;
  cloudClient?: CloudComputerClient;
  settingsClient?: DeviceSettingsClient;
  remoteDesktopClient?: RemoteDesktopClient;
  /** The cloud assistant's live session and takeover consent for the open remote desktop (C11 contracts §2, §4). */
  cloudAgentClient?: DeviceCloudAgentClient;
  remoteStatusIntervalMs?: number;
  /** How often the device list is re-read. */
  listIntervalMs?: number;
  /** Bound a stalled device-list/status read, including authentication. */
  requestTimeoutMs?: number;
  /** Who is signed in now (`getUserIdSnapshot`); `known` false when that cannot be read. */
  currentUser?: () => Promise<{ known: boolean; userId: string | null }>;
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

function legacyImportErrorFromLocation(): LegacyImportErrorCode | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("legacyImportError");
  return value === "forbidden" || value === "not-found" || value === "try-again" ? value : null;
}

/** The desktop host exposes its own device id through a read-only bridge status.
 * Web pages have no such id and keep the normal remote entry for every owned device. */
export { readLocalDeviceId } from "./devices/local-device";

/**
 * The card order while the page is open. The gateway lists devices in storage
 * order, which changes whenever a heartbeat rewrites a row, so cards used to
 * swap places between polls and a click aimed a moment earlier landed on
 * another computer (W, 2026-10-27). The first load puts online computers first
 * (then computers before phones, then by name); every later load keeps each
 * known card where it is, drops removed ones and appends new ones by the same rule.
 */
export function stableDeviceOrder(previous: readonly string[], devices: readonly Device[]): Device[] {
  const position = new Map(previous.map((id, index) => [id, index]));
  const known = devices.filter((device) => position.has(device.device_id))
    .sort((a, b) => position.get(a.device_id)! - position.get(b.device_id)!);
  const added = devices.filter((device) => !position.has(device.device_id)).sort((a, b) =>
    Number(deviceAvailability(b) === "online") - Number(deviceAvailability(a) === "online")
    || Number(isComputer(b)) - Number(isComputer(a))
    || a.device_name.localeCompare(b.device_name)
    || (a.device_id < b.device_id ? -1 : a.device_id > b.device_id ? 1 : 0));
  return [...known, ...added];
}

/** Who is signed in right now; `known` false when that cannot be read. */
async function signedInUser(): Promise<{ known: boolean; userId: string | null }> {
  try {
    const auth = await import("../lib/auth/client");
    if (typeof auth.getUserIdSnapshot !== "function") return { known: false, userId: null };
    const snapshot = await auth.getUserIdSnapshot();
    return { known: snapshot.available, userId: snapshot.userId };
  } catch {
    return { known: false, userId: null };
  }
}

export function DevicesPage({ legacyImportError: legacyImportErrorProp, client = devicesFacade, cloudClient = cloudComputerApi, settingsClient = defaultSettingsClient,
  remoteDesktopClient = defaultRemoteDesktopClient, cloudAgentClient = deviceCloudAgentClient, remoteStatusIntervalMs = 10_000,
  listIntervalMs = 15_000, requestTimeoutMs = 15_000, currentUser = signedInUser, initialTab, variant = "page" }: DevicesPageProps) {
  const tt = useUI();
  const [legacyImportError, setLegacyImportError] = useState<LegacyImportErrorCode | null>(() =>
    legacyImportErrorProp !== undefined ? legacyImportErrorProp : legacyImportErrorFromLocation(),
  );
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(() => legacyImportError ? legacyImportErrorCopy(legacyImportError) : null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const loginRequiredRef = useRef(false);
  const [showAuth, setShowAuth] = useState(false);
  const [loginRevision, setLoginRevision] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pairCode, setPairCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState<string | null>(null);
  const [tasksId, setTasksId] = useState<string | null>(null);
  const [remoteOpenId, setRemoteOpenId] = useState<string | null>(desktopFromLocation);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
  // Set only by a click on 进入桌面. A desktop restored from the URL (reload,
  // back/forward) has none, so it waits for 连接 instead of asking the computer.
  const [desktopTicket, setDesktopTicket] = useState<RemoteDesktopTicket | null>(null);
  const [remoteStatus, setRemoteStatus] = useState<Record<string, RemoteDesktopStatus>>({});
  const [revokingAgentId, setRevokingAgentId] = useState<string | null>(null);
  const revokingAgent = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const [authRevision, setAuthRevision] = useState(0);
  const [createCloud, setCreateCloud] = useState(false);
  const [connectServer, setConnectServer] = useState(false);
  const [cloudRevision, setCloudRevision] = useState(0);
  useEffect(() => {
    // The `/computers/<id>` adapter uses router.replace, so this page can be
    // retained across the client transition. Keep the visible error in sync
    // with the route-provided value instead of reading location only at mount.
    setLegacyImportError(
      legacyImportErrorProp !== undefined ? legacyImportErrorProp : legacyImportErrorFromLocation(),
    );
  }, [legacyImportErrorProp]);
  const generation = useRef(0);
  const order = useRef<string[]>([]);
  /** Apply a fresh list in the page's stable card order. */
  function showDevices(list: Device[]) {
    const ordered = stableDeviceOrder(order.current, list);
    order.current = ordered.map((device) => device.device_id);
    setDevices(ordered);
  }
  useEffect(() => {
    let alive = true;
    void readLocalDeviceId().then((id) => { if (alive) setLocalDeviceId(id); });
    return () => { alive = false; };
  }, []);
  function clearPrivateViews() {
    generation.current += 1;
    order.current = [];
    setDevices([]); setRemoteStatus({}); setTasksId(null); setRemoteOpenId(null); setDesktopTicket(null);
    setRevokingAgentId(null); revokingAgent.current = false; setAdding(false); setConnecting(false); setCreateCloud(false); setConnectServer(false);
    setPairCode(""); setPairing(false); setPairError(null);
    setPageNotice(null);
    const url = new URL(window.location.href); url.searchParams.delete("desktop");
    window.history.replaceState(window.history.state, "", url);
    setAuthRevision((value) => value + 1);
  }
  function applyDeviceResult(result: Awaited<ReturnType<DevicesFacade["listDevices"]>>) {
    if (!result.ok && (result.status === 401 || (!result.status && result.error === "unauthorized"))) {
      clearPrivateViews(); loginRequiredRef.current = true; setLoginRequired(true); setPageError(legacyImportError ? legacyImportErrorCopy(legacyImportError) : null);
    } else if (result.ok && result.data) {
      showDevices(result.data); loginRequiredRef.current = false; setLoginRequired(false); setPageError(legacyImportError ? legacyImportErrorCopy(legacyImportError) : null);
    } else setPageError(result.error === "request_expired" ? deviceSettingsErrorCopy(result.error) : deviceErrorCopy(result.error, { limit: result.limit }));
  }

  useEffect(() => {
    // Back/forward may show or hide the desktop; it never requests a session (no ticket).
    const changed = () => setRemoteOpenId(desktopFromLocation());
    window.addEventListener("popstate", changed);
    return () => window.removeEventListener("popstate", changed);
  }, []);

  async function refreshDevices() {
    const ticket = generation.current;
    const result = await runDeviceRequest((signal) => client.listDevices(signal), lifetime.current!.signal, requestTimeoutMs);
    if (ticket !== generation.current) return result;
    applyDeviceResult(result);
    return result;
  }
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    lifetime.current = controller;
    let loadTicket = 0;
    // The account whose devices this page shows. Learned at mount: an auth event
    // for the same person (a token refresh) is not a switch. Treating the first
    // one as a switch closed an open remote desktop (W, 2026-10-27 13:37:05).
    let account: string | null | undefined;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      const ticket = ++loadTicket;
      const accountTicket = generation.current;
      try {
        const result = await runDeviceRequest((signal) => client.listDevices(signal), controller.signal, requestTimeoutMs);
        if (!alive || ticket !== loadTicket || accountTicket !== generation.current) return;
        applyDeviceResult(result);
      } catch { if (alive && ticket === loadTicket && accountTicket === generation.current) setPageError(deviceErrorCopy("network_error")); }
      finally { if (alive && ticket === loadTicket) { setLoading(false); timer = setTimeout(load, listIntervalMs); } }
    }
    function reset(signedOut = false) {
      loadTicket += 1;
      clearTimeout(timer);
      clearPrivateViews(); setShowAuth(false); setPageError(legacyImportError ? legacyImportErrorCopy(legacyImportError) : null); loginRequiredRef.current = signedOut; setLoginRequired(signedOut); setLoading(!signedOut);
      if (!signedOut) void load();
    }
    function settle(userId: string | null) {
      if (!alive) return;
      // Not learned yet: a sign-in names the account already shown; a sign-out clears it.
      if (account === undefined && userId !== null) { account = userId; if (loginRequiredRef.current) reset(); return; }
      if (userId === account) { if (userId !== null && loginRequiredRef.current) reset(); return; }
      account = userId;
      reset(userId === null);
    }
    function onAccountChange(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string | null }>).detail;
      if (detail && "userId" in detail) { settle(detail.userId ?? null); return; }
      // No account in the event: ask who is signed in; if that cannot be read, reload this account's view.
      void currentUser().then(({ known, userId }) => {
        if (!alive) return;
        if (known) settle(userId);
        else reset();
      }, () => { if (alive) reset(); });
    }
    void currentUser().then(({ known, userId }) => { if (alive && known && account === undefined) account = userId; }, () => {});
    void load();
    window.addEventListener("oceanleo:auth-state", onAccountChange);
    return () => { alive = false; controller.abort(); generation.current += 1; clearTimeout(timer); window.removeEventListener("oceanleo:auth-state", onAccountChange); };
    // `showDevices` only writes a ref and a setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, listIntervalMs, requestTimeoutMs, currentUser, loginRevision]);

  const remoteTargetKey = useMemo(() => devices.filter(isComputer).slice(0, 20).map((item) => item.device_id).join(","), [devices]);
  useEffect(() => {
    if (!remoteTargetKey) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!document.hidden) await Promise.all(remoteTargetKey.split(",").map(async (deviceId) => {
        try {
          const result = await runDeviceRequest((signal) => remoteDesktopClient.getStatus(deviceId, { signal }), controller.signal, requestTimeoutMs);
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
  }, [remoteTargetKey, remoteDesktopClient, remoteStatusIntervalMs, requestTimeoutMs, authRevision]);

  async function pair(event: FormEvent) {
    event.preventDefault();
    const code = pairCode.trim();
    if (code.length !== 8 || pairing) return;
    const ticket = generation.current;
    setPairing(true); setPairError(null);
    try {
      const result = await runDeviceRequest((signal) => client.pairDevice(code, signal), lifetime.current!.signal, requestTimeoutMs);
      if (ticket !== generation.current) return;
      if (!result.ok) setPairError(deviceErrorCopy(result.error, { limit: result.limit }));
      else { setPairCode(""); setConnecting(false); await refreshDevices(); }
    } catch { if (ticket === generation.current) setPairError(deviceErrorCopy("network_error")); }
    finally { if (ticket === generation.current) setPairing(false); }
  }
  async function revokeAgentControl(device: Device) {
    if (revokingAgent.current) return;
    const ticket = generation.current;
    const signal = lifetime.current!.signal;
    revokingAgent.current = true; setRevokingAgentId(device.device_id); setPageError(null); setPageNotice(null);
    try {
      const result = await runDeviceSettingsOperation(settingsClient, device.device_id, { kind: "remote_access.update", agent_control_allowed: false }, signal);
      if (ticket !== generation.current) return;
      const notice = result.ok && result.data ? deviceRevocationNotice(result.data) : null;
      if (notice) setPageNotice(notice);
      else setPageError(deviceSettingsErrorCopy(result.error));
    } catch {
      if (ticket === generation.current) setPageError(deviceSettingsErrorCopy("network_error"));
    } finally {
      if (ticket === generation.current) { revokingAgent.current = false; setRevokingAgentId(null); }
    }
  }
  /** Only from a click on 进入桌面: the one place on this page that may request a session. */
  function openDesktop(deviceId: string) {
    requestRemoteDesktopFullscreen();
    const url = new URL(window.location.href);
    if (url.searchParams.get("desktop") !== deviceId) {
      url.searchParams.set("desktop", deviceId);
      window.history.pushState({ ...window.history.state, oceanleoDesktopEntry: deviceId }, "", url);
    }
    setTasksId(null); setDesktopTicket(remoteDesktopTicket()); setRemoteOpenId(deviceId);
  }
  function closeDesktop() {
    const id = remoteOpenId;
    setRemoteOpenId(null);
    setDesktopTicket(null);
    if (id && window.history.state?.oceanleoDesktopEntry === id) window.history.back();
    else {
      const url = new URL(window.location.href); url.searchParams.delete("desktop");
      window.history.replaceState(window.history.state, "", url);
    }
  }
  const selectedTasks = devices.find((item) => item.device_id === tasksId);
  const selectedRemote = devices.find((item) => item.device_id === remoteOpenId && isComputer(item));
  // The same AI banner and 交还给 AI as from the task page, found through the computer's live session.
  const remoteAgent = useDeviceCloudAgent(selectedRemote?.device_id ?? null, settingsClient, cloudAgentClient);
  const accountGeneration = generation.current;

  return <div className={variant === "pane" ? "min-h-0" : "mx-auto flex min-h-full w-full max-w-7xl flex-col px-5 py-7 sm:px-8"} data-oceanleo-devices-page data-devices-pane={variant === "pane" ? "" : undefined}>
    <header className="flex items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{tt("我的设备")}</h1><p className="mt-2 text-sm text-neutral-500">{tt("你的电脑与云电脑")}</p></div>{!loginRequired && <button type="button" className={DEVICE_BUTTON} onClick={() => setAdding(true)}><span aria-hidden="true">＋</span>{tt("添加设备")}</button>}</header>
    {loginRequired && <div role="status" className="mt-5 flex items-center gap-3 rounded-xl bg-neutral-100 px-4 py-3 text-sm"><span>{tt("请先登录")}</span><button type="button" className={DEVICE_PRIMARY_BUTTON} onClick={() => setShowAuth(true)}>{tt("登录")}</button></div>}
    {pageError && <p role="alert" data-device-import-error={legacyImportError || undefined} className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{tt(pageError)}</p>}
    {pageNotice && <p role="status" className="mt-5 rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-600">{tt(pageNotice)}</p>}
    {remoteOpenId && !selectedRemote && !loading && !loginRequired && !pageError && <div role="status" className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-neutral-100 px-4 py-3 text-sm text-neutral-600"><span>{tt("当前账号找不到这台电脑。")}</span><button type="button" onClick={closeDesktop} className="underline underline-offset-4">{tt("返回设备")}</button></div>}
    <div className="mt-7 grid items-start gap-5 sm:grid-cols-2 xl:grid-cols-3" data-device-grid data-all-offline={devices.length > 0 && devices.every((item) => deviceAvailability(item, remoteStatus[item.device_id]) !== "online") ? "true" : "false"}>
      {loading ? <div className="min-h-[300px] animate-pulse rounded-[20px] bg-neutral-100" aria-label={tt("正在加载设备")} /> : devices.map((device) => <DeviceCard key={`${authRevision}-${device.device_id}`} device={device} client={settingsClient} isLocalDevice={device.device_id === localDeviceId} availability={deviceAvailability(device, remoteStatus[device.device_id])} onSettings={() => openSettingsModal("device-settings", { deviceId: device.device_id })} onTasks={() => setTasksId(device.device_id)} onControl={() => openDesktop(device.device_id)} onRevokeAgent={() => void revokeAgentControl(device)} revokingAgent={revokingAgentId === device.device_id} />)}
      {!loading && !loginRequired && <CloudDeviceGrid key={`${authRevision}-${cloudRevision}`} client={cloudClient} onUnauthorized={() => { if (accountGeneration === generation.current) applyDeviceResult({ ok: false, status: 401 }); }} autoFocus={initialTab === "cloud" || (typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("tab") === "cloud" || window.location.hash === "#cloud"))} />}
      {!loading && !loginRequired && devices.length === 0 && <div className="flex min-h-[300px] flex-col items-center justify-center rounded-[20px] border border-dashed border-neutral-200 px-5 py-10 text-center" data-device-connect-card>
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
    {selectedTasks && <DeviceTasksDialog key={`${authRevision}-${selectedTasks.device_id}`} deviceId={selectedTasks.device_id} deviceName={selectedTasks.device_name} client={settingsClient} onClose={() => setTasksId(null)} />}
    {selectedRemote && <RemoteDesktopPanel key={`${authRevision}-${selectedRemote.device_id}`} deviceId={selectedRemote.device_id} deviceName={selectedRemote.device_name} client={remoteDesktopClient} onClose={closeDesktop} agent={remoteAgent.agent} consent={remoteAgent.consent} ticket={desktopTicket} />}
    {createCloud && <CreateComputerDialog client={cloudClient} onClose={() => setCreateCloud(false)} onCreated={() => { setCreateCloud(false); setCloudRevision((value) => value + 1); }} />}
    {connectServer && <ConnectServerDialog client={cloudClient} onClose={() => setConnectServer(false)} onCreated={() => { setConnectServer(false); setCloudRevision((value) => value + 1); }} />}
    {showAuth && <AuthDialog onClose={() => setShowAuth(false)} onSuccess={() => { setShowAuth(false); setLoginRevision((value) => value + 1); }} />}
  </div>;
}
