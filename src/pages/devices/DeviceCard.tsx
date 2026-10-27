"use client";

import type { Device } from "../../facades/devices";
import { useUI } from "../../i18n/ui/useUI";
import { deviceSettingsClient, type DeviceSettingsClient } from "../../api/device-settings";
import { LOCAL_AGENT_COPY } from "../../lib/local-agent-task";
import { DeviceCover } from "./DeviceCover";

export type DeviceAvailability = "online" | "signed_out" | "offline" | "unknown";

export function DeviceIcon({ phone = false, className = "h-6 w-6" }: { phone?: boolean; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" data-device-kind={phone ? "phone" : "computer"}>
    {phone ? <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M10 18.5h4" /></> : <><path d="M5 4h14v12H5zM5 16l-3 4h20l-3-4" /><path d="M9 20h6" /></>}
  </svg>;
}

export function DeviceStatus({ availability, inverse = false }: { availability: DeviceAvailability; inverse?: boolean }) {
  const tt = useUI();
  const label = availability === "online" ? "在线" : availability === "signed_out" ? "未登录" : availability === "unknown" ? "状态未知" : "离线";
  return <span className={`inline-flex items-center gap-1.5 text-sm ${inverse ? "text-white/80" : "text-neutral-500"}`} data-device-availability={availability}>
    <span className={`h-2 w-2 rounded-full ${availability === "online" ? "bg-emerald-500" : availability === "signed_out" ? "bg-amber-400" : "bg-neutral-400"}`} aria-hidden="true" />{tt(label)}
  </span>;
}

const PLATFORMS: Record<string, string> = { windows: "Windows", macos: "macOS", linux: "Linux", android: "Android", ios: "iOS", harmony: "HarmonyOS" };

export function isComputer(device: Device) {
  return ["windows", "macos", "linux"].includes(device.platform);
}

/** Wallpaper comes from OS metadata; a card never requests a desktop frame. */
export function DeviceCard({ device, availability, client = deviceSettingsClient, onSettings, onTasks, onControl }: {
  device: Device;
  availability: DeviceAvailability;
  client?: DeviceSettingsClient;
  onSettings: () => void;
  onTasks: () => void;
  onControl: () => void;
}) {
  const tt = useUI();
  // The computer's own switch, mirrored by its heartbeat: tasks sent from the
  // website or the phone are refused while it is off. Only an explicit false.
  // A short status only; the how-to stays in the tooltip, because this page
  // keeps no explanatory copy (devices-page "不渲染说教文案", 2026-10-25), and
  // the composer picker and the refusal message carry the full sentence.
  const localOff = isComputer(device) && device.local_exec_enabled === false;
  return <article className="min-w-0 overflow-hidden rounded-[20px] border border-neutral-200 bg-white" data-device-card={device.device_id}>
    <DeviceCover deviceId={device.device_id} availability={availability} client={client} phone={!isComputer(device)}>
      {isComputer(device) && <button type="button" onClick={onControl} data-remote-device-icon={device.device_id} aria-label={`${device.device_name} · ${tt("进入桌面")}`} className="absolute bottom-4 left-4 rounded-xl bg-white px-4 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{tt("进入桌面")}</button>}
    </DeviceCover>
    <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
      <div className="flex min-w-0 items-start gap-3"><DeviceIcon phone={!isComputer(device)} className="mt-0.5 h-5 w-5 shrink-0 text-neutral-500" /><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-neutral-900">{device.device_name}</h3><p className="mt-1 text-xs text-neutral-500">{PLATFORMS[device.platform] ?? device.platform}</p>{localOff && <p className="mt-1.5 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700" data-local-exec-off={device.device_id} title={tt(LOCAL_AGENT_COPY.localExecOffHint)}>{tt(LOCAL_AGENT_COPY.localExecOff)}</p>}</div></div>
      <DeviceStatus availability={availability} />
    </div>
    <div className="grid grid-cols-2 border-t border-neutral-100 py-1.5">
      <button type="button" onClick={onSettings} className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50" data-device-settings={device.device_id}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden="true"><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-2 1-3 3-1 1-4-3-1-2-3-3 1-2-2z" /><circle cx="12" cy="11" r="3" /></svg>{tt("设置")}
      </button>
      <button type="button" onClick={onTasks} className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50" data-device-tasks={device.device_id}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden="true"><path d="m3 6 2 2 3-4M11 6h10M3 13l2 2 3-4M11 13h10M4 20h3M11 20h10" /></svg>{tt("任务")}
      </button>
    </div>
  </article>;
}
