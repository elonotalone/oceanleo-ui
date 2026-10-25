"use client";

import { useEffect, useRef, useState } from "react";
import type { DeviceControllerGrant, DevicePreferences, DeviceSettings, DeviceSettingsClient } from "../../api/device-settings";
import type { Device } from "../../facades/devices";
import { useUI } from "../../i18n/ui/useUI";
import { DEVICE_BUTTON, DEVICE_PRIMARY_BUTTON, DeviceDialog } from "./DeviceDialog";
import { DeviceIcon, DeviceStatus, isComputer, type DeviceAvailability } from "./DeviceCard";
import { DeviceFolderPicker, FolderIcon } from "./DeviceFolderPicker";
import { formatDeviceTime } from "./DeviceTasksDialog";
import { deviceSettingsErrorCopy, runDeviceSettingsOperation } from "./device-settings-state";

export function DeviceSettingsDialog({ device, availability, client, onClose, onControl, onRename, onRevoke }: {
  device: Device;
  availability: DeviceAvailability;
  client: DeviceSettingsClient;
  onClose: () => void;
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
  const [picker, setPicker] = useState<"default" | "shortcut" | null>(null);
  const [expiryGrant, setExpiryGrant] = useState<DeviceControllerGrant | null>(null);
  const [menu, setMenu] = useState(false);
  const lifetime = useRef<AbortController | null>(null);

  async function refresh(signal: AbortSignal) {
    try {
      const result = await client.getSettings(device.device_id, signal);
      if (signal.aborted) return;
      if (result.ok && result.data) { setSettings(result.data); setError(null); }
      else setError(deviceSettingsErrorCopy(result.error));
    } catch { if (!signal.aborted) setError(deviceSettingsErrorCopy("network_error")); }
    finally { if (!signal.aborted) setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    lifetime.current = controller;
    async function poll() { await refresh(controller.signal); if (!controller.signal.aborted) timer = setTimeout(poll, 5000); }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
    // The target is fixed; auth changes unmount the whole modal from DevicesPage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.device_id, client]);

  async function saveName() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const success = await onRename(name.trim());
    if (!lifetime.current?.signal.aborted) { if (success) setEditing(false); setBusy(false); }
  }
  async function revokeController(grant: DeviceControllerGrant) {
    if (busy) return;
    const signal = lifetime.current!.signal;
    setBusy(true);
    setError(null);
    try {
      const result = await client.revokeController(device.device_id, grant.grant_id, signal);
      if (signal.aborted) return;
      if (!result.ok) setError(deviceSettingsErrorCopy(result.error));
      else await refresh(signal);
    } catch { if (!signal.aborted) setError(deviceSettingsErrorCopy("network_error")); }
    finally { if (!signal.aborted) setBusy(false); }
  }
  async function shortenExpiry(expiresAt: string) {
    if (!expiryGrant || busy) return;
    const signal = lifetime.current!.signal;
    setBusy(true);
    try {
      const result = await client.shortenControllerExpiry(device.device_id, expiryGrant.grant_id, expiresAt, signal);
      if (signal.aborted) return;
      if (result.ok) { setExpiryGrant(null); await refresh(signal); }
      else setError(deviceSettingsErrorCopy(result.error));
    } catch { if (!signal.aborted) setError(deviceSettingsErrorCopy("network_error")); }
    finally { if (!signal.aborted) setBusy(false); }
  }
  async function savePreferences(preferences: DevicePreferences) {
    if (busy) return;
    const signal = lifetime.current!.signal;
    setBusy(true);
    setError(null);
    try {
      const result = await runDeviceSettingsOperation(client, device.device_id, { kind: "preferences.update", ...preferences }, signal);
      if (signal.aborted) return;
      if (result.ok && result.data?.result && "preferences" in result.data.result) {
        setSettings((current) => current ? { ...current, preferences: (result.data!.result as { preferences: DevicePreferences }).preferences } : current);
      } else setError(deviceSettingsErrorCopy(result.error));
    } catch { if (!signal.aborted) setError(deviceSettingsErrorCopy("network_error")); }
    finally { if (!signal.aborted) setBusy(false); }
  }
  const preferences = settings?.preferences;
  const effectiveAvailability = availability === "unknown" ? settings?.availability ?? "unknown" : availability;
  const folderReady = effectiveAvailability === "online" && settings?.preferences_available;

  return <DeviceDialog title={tt("设备详情")} onClose={onClose} testId="settings">
    <section className="flex items-center justify-between gap-4 pb-7">
      <div className="flex min-w-0 items-center gap-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-neutral-200/70 text-neutral-700"><DeviceIcon phone={!isComputer(device)} className="h-8 w-8" /></span>
        <div className="min-w-0">
          {editing ? <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void saveName(); }}>
            <input aria-label={tt("设备名称")} autoFocus maxLength={80} value={name} onInput={(event) => setName(event.currentTarget.value)} className="w-48 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-neutral-500" />
            <button type="submit" disabled={busy || !name.trim()} className={DEVICE_PRIMARY_BUTTON}>{tt("保存")}</button><button type="button" onClick={() => setEditing(false)} className={DEVICE_BUTTON}>{tt("取消")}</button>
          </form> : <button type="button" onClick={() => { setName(device.device_name); setEditing(true); }} className="flex max-w-full items-center gap-2 text-left text-lg font-semibold" aria-label={tt("修改设备名称")}><span className="truncate">{device.device_name}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden="true"><path d="m15 4 5 5-11 11H4v-5zM13 6l5 5" /></svg></button>}
          <div className="mt-1"><DeviceStatus availability={effectiveAvailability} /></div>
        </div>
      </div>
      <div className="relative flex shrink-0 items-center gap-2">{isComputer(device) && <button type="button" className={DEVICE_BUTTON} onClick={onControl}>{tt("进入桌面")}</button>}
        <button type="button" aria-label={tt("更多")} aria-expanded={menu} onClick={() => setMenu((open) => !open)} className="flex h-10 w-10 items-center justify-center rounded-xl text-xl text-neutral-500 hover:bg-neutral-200/70">···</button>
        {menu && <div className="absolute right-0 top-full z-10 mt-1 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg"><button type="button" className="whitespace-nowrap rounded-lg px-4 py-2 text-sm text-red-600 hover:bg-red-50" onClick={onRevoke}>{tt("撤销设备")}</button></div>}
      </div>
    </section>

    {error && <div role="alert" className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{tt(error)}<button type="button" className={DEVICE_BUTTON} disabled={busy} onClick={() => void refresh(lifetime.current!.signal)}>{tt("重试")}</button></div>}

    <section className="border-t border-neutral-200 py-7">
      <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{tt("允许远程访问的设备")}</h3>{isComputer(device) && <button type="button" className={DEVICE_BUTTON} onClick={onControl}><span aria-hidden="true">＋</span>{tt("添加当前设备")}</button>}</div>
      {loading ? <p className="py-3 text-sm text-neutral-400" role="status">{tt("正在加载…")}</p> : settings?.controllers.length ? <div className="space-y-2">{settings.controllers.map((grant) => <div key={grant.grant_id} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 px-4 py-4" data-controller-grant={grant.grant_id}>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium">{grant.label}</span>{grant.is_current && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-600">{tt("当前设备")}</span>}</div>
          <p className="mt-1 text-xs text-neutral-500">{tt("最近使用：{time}", { time: formatDeviceTime(grant.last_used_at) })}<span className="mx-2" aria-hidden="true">·</span>{grant.expires_at ? tt("有效期至 {time}", { time: formatDeviceTime(grant.expires_at) }) : tt("永不过期")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1"><button type="button" className="rounded-lg px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100" disabled={busy} onClick={() => setExpiryGrant(grant)}>{tt("有效期")}</button><button type="button" className="rounded-lg px-2 py-1.5 text-xs text-red-600 hover:bg-red-50" disabled={busy} onClick={() => void revokeController(grant)}>{tt("撤销")}</button></div>
      </div>)}</div> : settings && <p className="rounded-2xl border border-dashed border-neutral-200 p-5 text-sm text-neutral-400">{tt("暂无已授权设备")}</p>}
    </section>

    <section className="border-t border-neutral-200 py-7">
      <h3 className="mb-4 text-sm font-semibold">{tt("默认任务文件夹")}</h3>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 p-4"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600"><FolderIcon /></span>
        <p className="min-w-0 flex-1 break-all text-sm text-neutral-600" data-device-default-folder>{loading ? tt("正在加载…") : !settings?.preferences_available ? "—" : preferences?.default_task_directory ?? tt("默认位置")}</p>
        <button type="button" className={DEVICE_BUTTON} disabled={busy || !folderReady || !preferences?.default_task_directory} onClick={() => { if (preferences) void savePreferences({ ...preferences, default_task_directory: null }); }}>{tt("恢复默认")}</button>
        <button type="button" className={DEVICE_BUTTON} disabled={busy || !folderReady} onClick={() => setPicker("default")}>{tt("修改")}</button>
      </div>
      {!loading && settings && !folderReady && <p className="mt-2 text-xs text-neutral-400">{tt(effectiveAvailability === "signed_out" ? "这台电脑尚未登录。" : effectiveAvailability === "offline" ? "这台电脑不在线。" : "等待设备同步…")}</p>}
    </section>

    <section className="border-t border-neutral-200 py-7">
      <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{tt("任务文件夹")}</h3><button type="button" className={DEVICE_BUTTON} disabled={busy || !folderReady} onClick={() => setPicker("shortcut")}><span aria-hidden="true">＋</span>{tt("添加文件夹")}</button></div>
      <div className="space-y-2">{preferences?.task_folders.map((path) => <div key={path} className="flex items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3"><FolderIcon /><span className="min-w-0 flex-1 break-all text-sm text-neutral-600">{path}</span><button type="button" className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-100" disabled={busy || !folderReady} onClick={() => void savePreferences({ ...preferences, task_folders: preferences.task_folders.filter((item) => item !== path) })}>{tt("移除")}</button></div>)}</div>
      {settings && !preferences?.task_folders.length && <p className="py-2 text-sm text-neutral-400">{tt("暂无文件夹")}</p>}
    </section>

    {picker && <DeviceFolderPicker deviceId={device.device_id} deviceName={device.device_name} title={tt(picker === "default" ? "默认任务文件夹" : "添加文件夹")} client={client} onClose={() => setPicker(null)} onSelect={(path) => { const mode = picker; setPicker(null); if (preferences) void savePreferences(mode === "default" ? { ...preferences, default_task_directory: path } : { ...preferences, task_folders: [...new Set([...preferences.task_folders, path])] }); }} />}
    {expiryGrant && <DeviceDialog title={tt("授权有效期")} compact testId="controller-expiry" onClose={() => setExpiryGrant(null)}>
      <p className="mb-4 text-sm text-neutral-500">{expiryGrant.label}</p>
      <div className="grid gap-2">{[["1 小时", 3_600_000], ["24 小时", 86_400_000], ["7 天", 604_800_000], ["30 天", 2_592_000_000]].filter(([, duration]) => !expiryGrant.expires_at || Date.now() + Number(duration) < Date.parse(expiryGrant.expires_at)).map(([label, duration]) => <button key={label} type="button" disabled={busy} className={`${DEVICE_BUTTON} justify-start`} onClick={() => void shortenExpiry(new Date(Date.now() + Number(duration)).toISOString())}>{tt(String(label))}</button>)}</div>
      <p className="mt-4 text-xs text-neutral-400">{tt("延长授权需在这台电脑上确认。")}</p>
    </DeviceDialog>}
  </DeviceDialog>;
}
