"use client";

import type { Device } from "../../facades/devices";
import { useUI } from "../../i18n/ui/useUI";

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

/** Decorative cover is CSS/native vector only; never request a desktop frame. */
export function DeviceCard({ device, availability, onSettings, onTasks, onControl }: {
  device: Device;
  availability: DeviceAvailability;
  onSettings: () => void;
  onTasks: () => void;
  onControl: () => void;
}) {
  const tt = useUI();
  return <article className="min-w-0 overflow-hidden rounded-[20px] border border-neutral-200 bg-white" data-device-card={device.device_id}>
    <div className="relative flex min-h-[240px] flex-col overflow-hidden bg-neutral-800 p-5 text-white sm:min-h-[290px]" data-device-cover>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-neutral-600 via-neutral-800 to-black" aria-hidden="true" />
      <svg className="pointer-events-none absolute -bottom-16 right-0 h-[300px] w-[400px] text-white/[0.07]" viewBox="0 0 400 300" fill="none" aria-hidden="true"><circle cx="290" cy="180" r="125" stroke="currentColor" strokeWidth="50" /><circle cx="110" cy="50" r="120" stroke="currentColor" strokeWidth="1" /><path d="M-10 290 400 20M30 330 430 60" stroke="currentColor" strokeWidth="1" /></svg>
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2"><DeviceIcon phone={!isComputer(device)} /><h3 className="truncate text-base font-semibold">{device.device_name}</h3></div>
        <div className="flex shrink-0 items-center gap-2"><DeviceStatus availability={availability} inverse /><button type="button" aria-label={`${device.device_name} · ${tt("设置")}`} onClick={onSettings} className="rounded-lg px-1 text-xl leading-6 text-white/70 hover:bg-white/10">···</button></div>
      </div>
      <div className="relative flex flex-1 items-center justify-center">
        {isComputer(device) ? <button type="button" onClick={onControl} data-remote-device-icon={device.device_id} aria-label={`${device.device_name} · ${tt("进入桌面")}`}
          className="rounded-xl border border-white/25 bg-black/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          {tt("进入桌面")}
        </button> : <DeviceIcon phone className="h-14 w-14 text-white/40" />}
      </div>
      <div className="relative flex items-center gap-2 text-sm font-medium"><DeviceIcon phone={!isComputer(device)} className="h-5 w-5" />{PLATFORMS[device.platform] ?? device.platform}</div>
    </div>
    <div className="grid grid-cols-2 divide-x divide-neutral-200 py-3">
      <button type="button" onClick={onSettings} className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50" data-device-settings={device.device_id}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden="true"><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-2 1-3 3-1 1-4-3-1-2-3-3 1-2-2z" /><circle cx="12" cy="11" r="3" /></svg>{tt("设置")}
      </button>
      <button type="button" onClick={onTasks} className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50" data-device-tasks={device.device_id}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden="true"><path d="m3 6 2 2 3-4M11 6h10M3 13l2 2 3-4M11 13h10M4 20h3M11 20h10" /></svg>{tt("任务")}
      </button>
    </div>
  </article>;
}
