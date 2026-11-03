"use client";

import { useEffect, useRef, useState } from "react";
import { deviceSettingsClient as defaultSettingsClient, type DeviceControllerGrant, type DevicePreferences, type DeviceRemoteAccessSettings, type DeviceSettings, type DeviceSettingsClient } from "../../api/device-settings";
import { devicesFacade, type Device, type DevicesFacade } from "../../facades/devices";
import { portalHref } from "../../contracts/domain-family";
import { Switch, ConfirmDialog } from "../../ui";
import { CARD, CARD_DESC, CARD_TITLE, PRIMARY, QUIET } from "./personalization/parts";
import { useUI } from "../../i18n/ui/useUI";
import { DeviceIcon, DeviceStatus, isComputer, type DeviceAvailability } from "../devices/DeviceCard";
import { DeviceFolderPicker, FolderIcon } from "../devices/DeviceFolderPicker";
import { formatDeviceTime } from "../devices/DeviceTasksDialog";
import { deviceSettingsErrorCopy, runDeviceRequest, runDeviceSettingsOperation } from "../devices/device-settings-state";
import { readDeviceUser, readLocalDeviceId } from "../devices/local-device";

export function DeviceSettingsPanel({ device, availability, client, isLocalDevice = false, onControl, onRename, onRevoke }: {
  device: Device;
  availability: DeviceAvailability;
  client: DeviceSettingsClient;
  isLocalDevice?: boolean;
  onControl: () => void;
  onRename: (name: string) => Promise<boolean>;
  onRevoke: () => void;
}) {
  const tt = useUI();
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(device.device_name);
  const [busy, setBusy] = useState(false);
  const [revokingAgent, setRevokingAgent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState<"default" | "shortcut" | null>(null);
  const busyRef = useRef(false);
  const revision = useRef(0);
  const lifetime = useRef<AbortController | null>(null);

  async function refresh(signal: AbortSignal) {
    try {
      const ticket = revision.current;
      const result = await runDeviceRequest((requestSignal) => client.getSettings(device.device_id, requestSignal), signal);
      if (signal.aborted || ticket !== revision.current) return;
      if (result.ok && result.data) { setSettings(result.data); setError(null); }
      else setError(deviceSettingsErrorCopy(result.error));
    } catch { if (!signal.aborted) setError(deviceSettingsErrorCopy("network_error")); }
    finally { if (!signal.aborted) setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    lifetime.current = controller;
    setSettings(null); setLoading(true); setError(null);
    async function poll() { if (!document.hidden && !busyRef.current) await refresh(controller.signal); if (!controller.signal.aborted) timer = setTimeout(poll, 5000); }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
    // The section keys this panel by account revision and selected device.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.device_id, client]);

  async function saveName() {
    if (!name.trim() || busyRef.current) return;
    busyRef.current = true; revision.current += 1; setBusy(true);
    const signal = lifetime.current!.signal;
    try {
      const result = await runDeviceRequest(async () => ({ ok: await onRename(name.trim()) }), signal);
      if (!signal.aborted && result.ok) setEditing(false);
      else if (!signal.aborted) setError(deviceSettingsErrorCopy(result.error));
    } finally { if (!signal.aborted) { busyRef.current = false; revision.current += 1; setBusy(false); } }
  }
  async function revokeController(grant: DeviceControllerGrant) {
    if (busyRef.current) return;
    const signal = lifetime.current!.signal;
    busyRef.current = true; revision.current += 1; setBusy(true);
    setError(null);
    try {
      const result = await runDeviceRequest((requestSignal) => client.revokeController(device.device_id, grant.grant_id, requestSignal), signal);
      if (signal.aborted) return;
      if (!result.ok) setError(deviceSettingsErrorCopy(result.error));
      else await refresh(signal);
    } catch { if (!signal.aborted) setError(deviceSettingsErrorCopy("network_error")); }
    finally { if (!signal.aborted) { busyRef.current = false; revision.current += 1; setBusy(false); } }
  }
  async function savePreferences(preferences: DevicePreferences) {
    if (busyRef.current) return;
    const signal = lifetime.current!.signal;
    busyRef.current = true; revision.current += 1; setBusy(true);
    setError(null);
    try {
      const result = await runDeviceSettingsOperation(client, device.device_id, { kind: "preferences.update", ...preferences }, signal);
      if (signal.aborted) return;
      if (result.ok && result.data?.result && "preferences" in result.data.result) {
        setSettings((current) => current ? { ...current, preferences: (result.data!.result as { preferences: DevicePreferences }).preferences } : current);
      } else setError(deviceSettingsErrorCopy(result.error));
    } catch { if (!signal.aborted) setError(deviceSettingsErrorCopy("network_error")); }
    finally { if (!signal.aborted) { busyRef.current = false; revision.current += 1; setBusy(false); } }
  }
  async function saveRemoteAccess(remoteAccess: DeviceRemoteAccessSettings) {
    if (busyRef.current) return;
    const signal = lifetime.current!.signal;
    busyRef.current = true; revision.current += 1; setBusy(true);
    const revoking = settings?.remote_access.agent_control_allowed === true && !remoteAccess.agent_control_allowed;
    setRevokingAgent(revoking); setError(null); setNotice(null);
    try {
      const { enabled, input_allowed, agent_control_allowed, agent_always_ask } = remoteAccess;
      const operation = { kind: "remote_access.update" as const, enabled, input_allowed, agent_control_allowed, agent_always_ask };
      const result = await runDeviceSettingsOperation(client, device.device_id, operation, signal);
      if (signal.aborted) return;
      if (result.ok && result.data?.result && "remote_access" in result.data.result) {
        const saved = result.data.result.remote_access;
        setSettings((current) => current ? { ...current, remote_access: saved } : current);
        if (revoking) {
          if (!saved.agent_control_allowed) setNotice("Agent 控制已撤销。");
          else setError(deviceSettingsErrorCopy("operation_failed"));
        }
      } else setError(deviceSettingsErrorCopy(result.error));
    } catch { if (!signal.aborted) setError(deviceSettingsErrorCopy("network_error")); }
    finally { if (!signal.aborted) { busyRef.current = false; revision.current += 1; setBusy(false); setRevokingAgent(false); } }
  }
  const preferences = settings?.preferences;
  const remoteAccess: DeviceRemoteAccessSettings = { enabled: false, input_allowed: true, expires_at: null, agent_control_allowed: false, agent_always_ask: true, ...(settings?.remote_access ?? {}) };
  const effectiveAvailability = availability === "unknown" ? settings?.availability ?? "unknown" : availability;
  const folderReady = effectiveAvailability === "online" && settings?.preferences_available;

  return <div className="space-y-5" data-device-settings-panel={device.device_id}>
    <section className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-neutral-200/70 text-neutral-700"><DeviceIcon phone={!isComputer(device)} className="h-8 w-8" /></span>
        <div className="min-w-0">
          {editing ? <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void saveName(); }}>
            <input aria-label={tt("设备名称")} autoFocus maxLength={80} value={name} onInput={(event) => setName(event.currentTarget.value)} className="w-48 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-500" />
            <button type="submit" disabled={busy || !name.trim()} className={PRIMARY}>{tt("保存")}</button><button type="button" onClick={() => setEditing(false)} className={QUIET}>{tt("取消")}</button>
          </form> : <button type="button" onClick={() => { setName(device.device_name); setEditing(true); }} className="flex max-w-full items-center gap-2 text-left text-lg font-semibold" aria-label={tt("修改设备名称")}><span className="truncate">{device.device_name}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true"><path d="m15 4 5 5-11 11H4v-5zM13 6l5 5" /></svg></button>}
          <div className="mt-1"><DeviceStatus availability={effectiveAvailability} /></div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{isComputer(device) && !isLocalDevice && <button type="button" className={QUIET} onClick={onControl}>{tt("进入桌面")}</button>}
        <button type="button" className={`${QUIET} text-red-600`} onClick={onRevoke}>{tt("撤销设备")}</button>
      </div>
    </section>

    {error && <div role="alert" className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{tt(error)}<button type="button" className={QUIET} disabled={busy} onClick={() => void refresh(lifetime.current!.signal)}>{tt("重试")}</button></div>}
    {notice && <p role="status" className="rounded-lg bg-neutral-50 px-3 py-2 text-[13px] text-neutral-600">{tt(notice)}</p>}

    {isComputer(device) && <section className={CARD} data-device-access-settings>
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className={CARD_TITLE}>{tt("访问与控制")}</h3>
        <button type="button" className={`${QUIET} text-red-600`} data-revoke-agent-control disabled={busy || !settings || effectiveAvailability !== "online" || !remoteAccess.agent_control_allowed} onClick={() => void saveRemoteAccess({ ...remoteAccess, agent_control_allowed: false })}>{tt(revokingAgent ? "正在撤销…" : "撤销 Agent 控制")}</button>
      </div>
      <p className={CARD_DESC}>{tt("自己的账号访问这台设备会直接连接。远程访问和云端助手的权限在这里设置。")}</p>
      {loading ? <p className="py-3 text-sm text-neutral-400" role="status">{tt("正在加载…")}</p> : settings && <div className="mt-3 divide-y divide-neutral-100">
        <div className="flex items-start justify-between gap-4 py-3">
          <div><p className="text-[13px] font-medium">{tt("允许远程访问")}</p><p className={CARD_DESC}>{tt("自己的账号可以连接；其他人仍需这台电脑确认。")}</p></div>
          <Switch label={tt("允许远程访问")} checked={remoteAccess.enabled} disabled={busy || effectiveAvailability !== "online"} onChange={(enabled) => void saveRemoteAccess({ ...remoteAccess, enabled })} />
        </div>
        <div className="flex items-start justify-between gap-4 py-3">
          <p className="text-[13px] font-medium">{tt("允许操作屏幕（查看、点击、输入）")}</p>
          <Switch label={tt("允许操作屏幕（查看、点击、输入）")} checked={remoteAccess.input_allowed} disabled={busy || effectiveAvailability !== "online" || !remoteAccess.enabled} onChange={(input_allowed) => void saveRemoteAccess({ ...remoteAccess, input_allowed })} />
        </div>
        <div className="flex items-start justify-between gap-4 py-3">
          <div><p className="text-[13px] font-medium">{tt("允许远程 Agent 控制")}</p><p className={CARD_DESC}>{tt("开启即表示同意，直到你关闭。关闭后立即停止 Agent 控制。")}</p></div>
          <Switch label={tt("允许远程 Agent 控制")} checked={remoteAccess.agent_control_allowed} disabled={busy || effectiveAvailability !== "online"} onChange={(agent_control_allowed) => void saveRemoteAccess({ ...remoteAccess, agent_control_allowed })} />
        </div>
        <div className="flex items-start justify-between gap-4 py-3">
          <div><p className="text-[13px] font-medium">{tt("每次询问")}</p><p className={CARD_DESC}>{tt("开启后，Agent 每次申请都会在这台电脑上等待确认。")}</p></div>
          <Switch label={tt("每次询问")} checked={remoteAccess.agent_always_ask} disabled={busy || effectiveAvailability !== "online"} onChange={(agent_always_ask) => void saveRemoteAccess({ ...remoteAccess, agent_always_ask })} />
        </div>
        {effectiveAvailability !== "online" && <p className="pt-3 text-xs text-neutral-400">{tt(effectiveAvailability === "signed_out" ? "这台电脑尚未登录。" : effectiveAvailability === "offline" ? "这台电脑不在线。" : "等待设备同步…")}</p>}
      </div>}
    </section>}

    <section className={CARD}>
      <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{tt("允许远程访问的设备")}</h3>{isComputer(device) && !isLocalDevice && <button type="button" className={QUIET} onClick={onControl}><span aria-hidden="true">＋</span>{tt("添加当前设备")}</button>}</div>
      {loading ? <p className="py-3 text-sm text-neutral-400" role="status">{tt("正在加载…")}</p> : settings?.controllers.length ? <div className="space-y-2">{settings.controllers.map((grant) => <div key={grant.grant_id} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 px-4 py-4" data-controller-grant={grant.grant_id}>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium">{grant.label}</span>{grant.is_current && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-600">{tt("当前设备")}</span>}</div>
          <p className="mt-1 text-xs text-neutral-500">{tt("最近使用：{time}", { time: formatDeviceTime(grant.last_used_at) })}<span className="mx-2" aria-hidden="true">·</span>{grant.expires_at ? tt("有效期至 {time}", { time: formatDeviceTime(grant.expires_at) }) : tt("永不过期")}</p>
        </div>
        <button type="button" className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50" disabled={busy} onClick={() => void revokeController(grant)}>{tt("撤销")}</button>
      </div>)}</div> : settings && <p className="rounded-2xl border border-dashed border-neutral-200 p-5 text-sm text-neutral-400">{tt("暂无已授权设备")}</p>}
    </section>

    <section className={CARD}>
      <h3 className="mb-4 text-sm font-semibold">{tt("默认任务文件夹")}</h3>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 p-4"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600"><FolderIcon /></span>
        <p className="min-w-0 flex-1 break-all text-sm text-neutral-600" data-device-default-folder>{loading ? tt("正在加载…") : !settings?.preferences_available ? "—" : preferences?.default_task_directory ?? tt("默认位置")}</p>
        <button type="button" className={QUIET} disabled={busy || !folderReady || !preferences?.default_task_directory} onClick={() => { if (preferences) void savePreferences({ ...preferences, default_task_directory: null }); }}>{tt("恢复默认")}</button>
        <button type="button" className={QUIET} disabled={busy || !folderReady} onClick={() => setPicker("default")}>{tt("修改")}</button>
      </div>
      {!loading && settings && !folderReady && <p className="mt-2 text-xs text-neutral-400">{tt(effectiveAvailability === "signed_out" ? "这台电脑尚未登录。" : effectiveAvailability === "offline" ? "这台电脑不在线。" : "等待设备同步…")}</p>}
    </section>

    <section className={CARD}>
      <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{tt("任务文件夹")}</h3><button type="button" className={QUIET} disabled={busy || !folderReady} onClick={() => setPicker("shortcut")}><span aria-hidden="true">＋</span>{tt("添加文件夹")}</button></div>
      <div className="space-y-2">{preferences?.task_folders.map((path) => <div key={path} className="flex items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3"><FolderIcon /><span className="min-w-0 flex-1 break-all text-sm text-neutral-600">{path}</span><button type="button" className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100" disabled={busy || !folderReady} onClick={() => void savePreferences({ ...preferences, task_folders: preferences.task_folders.filter((item) => item !== path) })}>{tt("移除")}</button></div>)}</div>
      {settings && !preferences?.task_folders.length && <p className="py-2 text-sm text-neutral-400">{tt("暂无文件夹")}</p>}
    </section>

    {picker && <DeviceFolderPicker deviceId={device.device_id} deviceName={device.device_name} title={tt(picker === "default" ? "默认任务文件夹" : "添加文件夹")} client={client} onClose={() => setPicker(null)} onSelect={(path) => { const mode = picker; setPicker(null); if (preferences) void savePreferences(mode === "default" ? { ...preferences, default_task_directory: path } : { ...preferences, task_folders: [...new Set([...preferences.task_folders, path])] }); }} />}
  </div>;
}

function selectedDeviceFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const id = new URLSearchParams(window.location.search).get("device");
  return id && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}

/** Device controls live in the same Settings pane as the user's other preferences. */
export function DeviceSettingsSection({ client = devicesFacade, settingsClient = defaultSettingsClient, requestTimeoutMs = 15_000, currentUser = readDeviceUser }: {
  client?: DevicesFacade;
  settingsClient?: DeviceSettingsClient;
  requestTimeoutMs?: number;
  currentUser?: typeof readDeviceUser;
} = {}) {
  const tt = useUI();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(selectedDeviceFromLocation);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [accountRevision, setAccountRevision] = useState(0);
  const [confirmRevoke, setConfirmRevoke] = useState<Device | null>(null);
  const [revoking, setRevoking] = useState(false);
  const lifetime = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    let account: string | null | undefined;
    let authRevision = 0;
    void readLocalDeviceId().then((id) => { if (alive) setLocalDeviceId(id); });
    const changed = () => setSelectedId(selectedDeviceFromLocation());
    const clearAccount = () => {
      lifetime.current?.abort();
      setDevices([]); setConfirmRevoke(null); setRevoking(false); setError(null); setLoading(true);
      setAccountRevision((value) => value + 1);
    };
    function discoverAccount() {
      const ticket = authRevision;
      void currentUser().then(({ known, userId }) => { if (alive && ticket === authRevision && known) account = userId; }, () => {});
    }
    const accountChanged = (event: Event) => {
      authRevision += 1;
      const detail = (event as CustomEvent<{ userId?: string | null }>).detail;
      if (detail && "userId" in detail) {
        const next = detail.userId ?? null;
        if (account !== undefined && account === next) return;
        account = next;
        clearAccount();
      } else {
        // An event without identity cannot prove it is only a token refresh.
        account = undefined;
        clearAccount();
        discoverAccount();
      }
    };
    discoverAccount();
    window.addEventListener("popstate", changed);
    window.addEventListener("oceanleo:auth-state", accountChanged);
    return () => {
      alive = false;
      window.removeEventListener("popstate", changed);
      window.removeEventListener("oceanleo:auth-state", accountChanged);
    };
  }, [currentUser]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      const result = await runDeviceRequest((signal) => client.listDevices(signal), controller.signal, requestTimeoutMs);
      if (controller.signal.aborted) return;
      setLoading(false);
      if (result.ok && result.data) { setDevices(result.data); setError(null); }
      else {
        if (result.status === 401) setDevices([]);
        setError(deviceSettingsErrorCopy(result.error));
      }
      timer = setTimeout(() => { void load(); }, 15_000);
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [client, requestTimeoutMs, revision, accountRevision]);

  const selected = selectedId ? devices.find((device) => device.device_id === selectedId) : devices[0];
  function selectDevice(id: string) {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("device", id);
    window.history.replaceState(window.history.state, "", url);
  }
  async function rename(device: Device, name: string) {
    const signal = lifetime.current!.signal;
    const result = await runDeviceRequest((requestSignal) => client.renameDevice(device.device_id, name, requestSignal), signal, requestTimeoutMs);
    if (signal.aborted) return false;
    if (!result.ok) { setError(deviceSettingsErrorCopy(result.error)); return false; }
    setDevices((current) => current.map((item) => item.device_id === device.device_id ? { ...item, device_name: name } : item));
    return true;
  }
  async function revokeDevice(device: Device) {
    if (revoking) return;
    const signal = lifetime.current!.signal;
    setRevoking(true); setConfirmRevoke(null);
    const result = await runDeviceRequest((requestSignal) => client.revokeDevice(device.device_id, requestSignal), signal, requestTimeoutMs);
    if (signal.aborted) return;
    setRevoking(false);
    if (!result.ok) { setError(deviceSettingsErrorCopy(result.error)); return; }
    setDevices((current) => current.filter((item) => item.device_id !== device.device_id));
    setSelectedId(null);
  }

  return <div className="space-y-5" data-settings-pane="device-settings">
    <p className="text-[13px] text-neutral-500">{tt("管理每台设备的访问权限、Agent 控制和任务文件夹。")}</p>
    {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{tt(error)}<button type="button" className={QUIET} onClick={() => setRevision((value) => value + 1)}>{tt("重试")}</button></div>}
    {loading ? <p role="status" className="py-4 text-[13px] text-neutral-400">{tt("正在加载设备")}</p> : devices.length > 0 ? <>
      <label className="block text-[13px] font-medium">{tt("选择设备")}<select aria-label={tt("选择设备")} className="mt-2 block w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[14px]" value={selected?.device_id ?? ""} onChange={(event) => selectDevice(event.currentTarget.value)}>
        {!selected && <option value="" disabled>{tt("选择设备")}</option>}{devices.map((device) => <option key={device.device_id} value={device.device_id}>{device.device_name}</option>)}
      </select></label>
      {selected ? <DeviceSettingsPanel key={`${accountRevision}-${selected.device_id}`} device={selected} availability={selected.availability ?? "unknown"} isLocalDevice={selected.device_id === localDeviceId} client={settingsClient} onControl={() => { window.location.href = portalHref(`/devices?desktop=${encodeURIComponent(selected.device_id)}`); }} onRename={(name) => rename(selected, name)} onRevoke={() => setConfirmRevoke(selected)} /> : <p role="status" className="text-[13px] text-neutral-500">{tt("当前账号找不到这台电脑。")}</p>}
    </> : <p role="status" className="py-4 text-[13px] text-neutral-500">{tt("还没有连接设备。")}</p>}
    {confirmRevoke && <ConfirmDialog title={tt("撤销「{name}」？", { name: confirmRevoke.device_name })} body={tt("撤销后这台电脑立刻不再接收任何任务，需要重新配对。")} confirmLabel={tt("确认撤销")} danger onConfirm={() => revokeDevice(confirmRevoke)} onCancel={() => setConfirmRevoke(null)} />}
  </div>;
}
