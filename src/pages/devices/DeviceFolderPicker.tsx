"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DeviceFolderListing, DeviceSettingsClient } from "../../api/device-settings";
import { useUI } from "../../i18n/ui/useUI";
import { DEVICE_BUTTON, DEVICE_PRIMARY_BUTTON, DeviceDialog } from "./DeviceDialog";
import { DeviceIcon } from "./DeviceCard";
import { deviceSettingsErrorCopy, runDeviceSettingsOperation } from "./device-settings-state";

export function DeviceFolderPicker({ deviceId, deviceName, title, client, onSelect, onClose }: {
  deviceId: string;
  deviceName: string;
  title: string;
  client: DeviceSettingsClient;
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const tt = useUI();
  const [listing, setListing] = useState<DeviceFolderListing | null>(null);
  const [inputPath, setInputPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grantPath, setGrantPath] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const request = useRef<AbortController | null>(null);

  async function navigate(path: string | null, { offerGrant = true }: { offerGrant?: boolean } = {}) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    setGrantPath(null);
    setListing(null);
    try {
      const result = await runDeviceSettingsOperation(client, deviceId, { kind: "folders.list", path }, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok && result.data?.result && "entries" in result.data.result) {
        setListing(result.data.result);
        setInputPath(result.data.result.path ?? "");
        // An empty listing is still actionable: the caller may grant the path
        // and retry the same navigation. The root page has no candidate path.
        const candidate = result.data.result.path ?? inputPath.trim();
        if (offerGrant && result.data.result.entries.length === 0 && candidate) setGrantPath(candidate);
      } else {
        const code = result.error;
        setError(deviceSettingsErrorCopy(code));
        if ((code === "path_outside_grant" || code === "grant_missing") && path) setGrantPath(path);
      }
    } catch {
      if (!controller.signal.aborted) setError(deviceSettingsErrorCopy("network_error"));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  async function grantFolder() {
    const path = grantPath?.trim();
    const controller = request.current;
    if (!path || !controller || granting || loading) return;
    setGranting(true);
    setError(null);
    try {
      const result = await runDeviceSettingsOperation(client, deviceId, { kind: "folders.grant", path }, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok && result.data?.result && "grant" in result.data.result) {
        const grantedPath = result.data.result.grant.path;
        // Retry the original Go action against the canonical path returned by
        // the device; the existing "Use this folder" action then saves it as
        // the default or shortcut without changing that flow.
        setGranting(false);
        await navigate(grantedPath, { offerGrant: false });
      } else {
        setError(deviceSettingsErrorCopy(result.error));
      }
    } catch {
      if (!controller.signal.aborted) setError(deviceSettingsErrorCopy("network_error"));
    } finally {
      if (!controller.signal.aborted) setGranting(false);
    }
  }
  useEffect(() => {
    void navigate(null);
    return () => request.current?.abort();
    // A picker is bound to its target for its entire lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, client]);

  function go(event: FormEvent) { event.preventDefault(); if (inputPath.trim()) void navigate(inputPath.trim()); }

  return <DeviceDialog title={title} compact onClose={onClose} testId="folder-picker" footer={
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 flex-1 truncate text-xs text-neutral-500" title={listing?.path ?? ""}>{listing?.path ?? ""}</span>
      <button type="button" className={DEVICE_BUTTON} onClick={onClose}>{tt("取消")}</button>
      <button type="button" className={DEVICE_PRIMARY_BUTTON} disabled={loading || !listing?.path} onClick={() => { if (listing?.path) onSelect(listing.path); }}>{tt("使用此文件夹")}</button>
    </div>
  }>
    <div className="mb-4 flex items-center gap-2 text-sm text-neutral-600"><DeviceIcon className="h-5 w-5" />{deviceName}</div>
    <form className="mb-4 flex items-center gap-2" onSubmit={go}>
      <button type="button" className={`${DEVICE_BUTTON} h-10 w-10 shrink-0 p-0`} aria-label={tt("主页")} onClick={() => void navigate(null)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" aria-hidden="true"><path d="m3 10 9-7 9 7v11H3zM9 21V12h6v9" /></svg>
      </button>
      <button type="button" className={`${DEVICE_BUTTON} h-10 w-10 shrink-0 p-0`} aria-label={tt("上一级")} disabled={loading || !listing?.parent} onClick={() => { if (listing?.parent) void navigate(listing.parent); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" aria-hidden="true"><path d="m5 11 7-7 7 7M12 4v17" /></svg>
      </button>
      <input aria-label={tt("文件夹路径")} value={inputPath} onInput={(event) => { const value = event.currentTarget.value; setInputPath(value); if (listing?.entries.length === 0) setGrantPath(value.trim() || null); }} className="h-10 min-w-0 flex-1 rounded-xl bg-neutral-100 px-3 text-sm outline-none focus:ring-1 focus:ring-neutral-400" />
      <button type="submit" className={DEVICE_BUTTON} disabled={loading || !inputPath.trim()}>{tt("前往")}</button>
    </form>
    <div className="min-h-[260px] rounded-2xl border border-neutral-200 bg-white p-2" aria-busy={loading || granting} data-device-folder-list>
      {loading || granting ? <p role="status" className="p-4 text-sm text-neutral-500">{tt(granting ? "正在授权这个文件夹…" : "正在读取文件夹…")}</p> : error ? <div className="p-4"><p role="alert" className="text-sm text-red-600">{tt(error)}</p>{grantPath && <button type="button" className={`${DEVICE_PRIMARY_BUTTON} mt-3`} onClick={() => void grantFolder()}>{tt("授权这个文件夹")}</button>}<button type="button" className={`${DEVICE_BUTTON} mt-3 ml-2`} onClick={() => void navigate(null)}>{tt("重试")}</button></div> : <>
        {listing?.path && <div className="mb-1 flex items-center gap-2 rounded-xl bg-neutral-100 px-3 py-3 text-sm font-medium"><FolderIcon />{listing.path.split(/[\\/]/).filter(Boolean).at(-1) ?? listing.path}</div>}
        {listing?.entries.map((entry) => <button type="button" key={entry.path} onClick={() => void navigate(entry.path)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-neutral-700 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2" data-device-folder-path={entry.path}>
          <span aria-hidden="true" className="text-neutral-400">›</span><FolderIcon /><span className="truncate">{entry.name}</span>
        </button>)}
        {listing?.entries.length === 0 && <div className="p-4"><p className="text-sm text-neutral-400">{tt("没有子文件夹")}</p>{grantPath && <button type="button" className={`${DEVICE_PRIMARY_BUTTON} mt-3`} onClick={() => void grantFolder()}>{tt("授权这个文件夹")}</button>}</div>}
      </>}
    </div>
  </DeviceDialog>;
}

export function FolderIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true"><path d="M3 7V4h7l2 3h9v14H3zM3 10h18" /></svg>;
}
