"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { currentDomainFamily, currentDomainProfile } from "../../contracts/domain-family";
import { useUI } from "../../i18n/ui/useUI";
import { AnchoredFixedPopover } from "./AnchoredFixedPopover";
import {
  buildDeviceStatusView,
  fetchPairedDevices,
  fetchStatusComputers,
  type ComputerStatusKind,
  type DeviceStatusView,
  type PairedDevice,
  type StatusComputer,
} from "./device-status-api";

const REFRESH_MS = 15000;

function portalHref(path: string) {
  return `${currentDomainProfile().portalOrigin}${path}`;
}

function IconDevice({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </svg>
  );
}

function statusDot(kind: "online" | "offline" | ComputerStatusKind) {
  const on = kind === "online";
  return (
    <span
      className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
        on ? "bg-emerald-500" : "bg-neutral-300"
      }`}
      aria-hidden="true"
    />
  );
}

function lastSeenLabel(
  tt: (zh: string, vars?: Record<string, string | number>) => string,
  iso: string | null,
): string {
  if (!iso) return tt("离线");
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return tt("离线");
  const minutes = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (minutes < 60) return tt("最近 {n} 分钟前", { n: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return tt("最近 {n} 小时前", { n: hours });
  return tt("最近 {n} 天前", { n: Math.round(hours / 24) });
}

function computerKindLabel(
  tt: (zh: string, vars?: Record<string, string | number>) => string,
  kind: ComputerStatusKind,
): string {
  if (kind === "unpaid") return tt("欠费");
  if (kind === "stopped") return tt("已停机");
  if (kind === "online") return tt("在线");
  return tt("离线");
}

const EMPTY_VIEW: DeviceStatusView = buildDeviceStatusView([], []);

export function DeviceStatusPopover({ className = "" }: { className?: string }) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<DeviceStatusView>(EMPTY_VIEW);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    const hideCloud = currentDomainFamily() === "cn";
    const devices: PairedDevice[] = await fetchPairedDevices();
    const computers: StatusComputer[] = hideCloud ? [] : await fetchStatusComputers();
    setView(buildDeviceStatusView(devices, computers));
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [open, load]);

  const closePanel = useCallback((reason: "escape" | "outside") => {
    setOpen(false);
    if (reason === "escape") buttonRef.current?.focus();
  }, []);

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={tt("我的设备")}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="leo-tap-target relative flex items-center justify-center rounded-lg text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-100 hover:text-neutral-800"
      >
        <IconDevice className="h-4 w-4" />
      </button>

      <AnchoredFixedPopover
        open={open}
        anchorRef={buttonRef}
        onClose={closePanel}
        width={300}
        className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg"
      >
        <div data-oceanleo-device-status-panel className="flex flex-col">
          <div className="border-b border-neutral-100 px-3 py-2.5">
            <p className="text-[13px] font-medium text-neutral-800">{tt("我的设备")}</p>
            <p className="mt-0.5 text-[11px] text-neutral-500">
              {tt("你的电脑、手机和云电脑")}
            </p>
          </div>

          <div className="max-h-72 overflow-y-auto px-3 py-2">
            {view.empty ? (
              <p className="py-6 text-center text-[12px] text-neutral-400">
                {tt("还没有连接任何设备")}
              </p>
            ) : (
              <div className="space-y-3">
                {view.devices.length > 0 ? (
                  <ul className="space-y-1.5">
                    {view.devices.map((device, index) => (
                      <li
                        key={device.device_id || `${device.device_name}-${index}`}
                        className="flex items-start gap-2"
                      >
                        {statusDot(device.online ? "online" : "offline")}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] text-neutral-800">
                            {device.device_name}
                          </p>
                          <p className="text-[11px] text-neutral-500">
                            {device.online
                              ? tt("在线")
                              : lastSeenLabel(tt, device.last_seen_at)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {view.computers.length > 0 ? (
                  <ul className="space-y-1.5">
                    {view.computers.map((computer, index) => (
                      <li key={`${computer.name}-${index}`} className="flex items-start gap-2">
                        {statusDot(computer.kind)}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] text-neutral-800">
                            {computer.name}
                          </p>
                          <p className="text-[11px] text-neutral-500">
                            {computerKindLabel(tt, computer.kind)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {view.pendingCount > 0 ? (
                  <Link
                    href={portalHref(view.pendingHref)}
                    className="block text-[11px] text-neutral-400 hover:text-neutral-600"
                    onClick={() => setOpen(false)}
                  >
                    {tt("{n} 台接入中", { n: view.pendingCount })}
                  </Link>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 border-t border-neutral-100 px-3 py-2.5">
            <Link
              href={portalHref(view.downloadHref)}
              onClick={() => setOpen(false)}
              className="flex items-center justify-center rounded-lg bg-neutral-900 px-3 py-2 text-[12px] font-medium text-white"
            >
              {tt("下载 App")}
            </Link>
            <Link
              href={portalHref(view.manageHref)}
              onClick={() => setOpen(false)}
              className="flex items-center justify-center rounded-lg bg-neutral-100 px-3 py-2 text-[12px] font-medium text-neutral-800"
            >
              {tt("管理我的设备")}
            </Link>
          </div>
        </div>
      </AnchoredFixedPopover>
    </div>
  );
}

export default DeviceStatusPopover;
