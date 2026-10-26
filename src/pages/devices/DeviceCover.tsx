"use client";

import { useEffect, useState, type ReactNode } from "react";
import { parseDeviceCover, type DeviceCover as Cover, type DeviceSettingsClient } from "../../api/device-settings";
import { useUI } from "../../i18n/ui/useUI";
import type { DeviceAvailability } from "./DeviceCard";
import { runDeviceSettingsOperation } from "./device-settings-state";

/** Private component state only: never put a user's wallpaper into storage. */
export function DeviceCover({ deviceId, availability, client, children, phone = false }: {
  deviceId: string;
  availability: DeviceAvailability;
  client: DeviceSettingsClient;
  children?: ReactNode;
  phone?: boolean;
}) {
  const [cover, setCover] = useState<Cover | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { setCover(null); }, [deviceId, client]);
  useEffect(() => {
    if (availability === "signed_out") setCover(null);
    if (phone || availability !== "online") { setLoading(false); return; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (!document.hidden) {
        setLoading(true);
        try {
          const reply = await runDeviceSettingsOperation(client, deviceId, { kind: "cover.read" }, controller.signal);
          if (controller.signal.aborted) return;
          const result = reply.data?.result;
          const next = reply.ok && result && "cover" in result ? parseDeviceCover(result.cover) : null;
          // A current unavailable response supersedes the previous wallpaper.
          // Network failures retain it with its original observed timestamp.
          if (next) setCover(next);
        } catch { /* The card remains usable with an honest placeholder. */ }
        finally { if (!controller.signal.aborted) setLoading(false); }
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 300_000);
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [deviceId, availability, client, phone]);
  return <WallpaperSurface cover={cover} loading={loading} availability={availability} placeholder={phone ? "手机与平板" : undefined}>{children}</WallpaperSurface>;
}

export function WallpaperSurface({ cover = null, loading = false, availability = "unknown", placeholder = "暂无桌面壁纸", children }: {
  cover?: Cover | null;
  loading?: boolean;
  availability?: DeviceAvailability;
  placeholder?: string;
  children?: ReactNode;
}) {
  const tt = useUI();
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = cover?.state === "available" && cover.image !== failedImage ? cover : null;
  const stamp = image ? new Date(image.observed_at * 1000).toLocaleString() : "";
  const lastKnown = image && (availability !== "online" || Date.now() / 1000 - image.observed_at > 360);
  return <div className="relative flex aspect-[16/10] min-h-[180px] items-center justify-center overflow-hidden bg-neutral-100" data-device-cover data-device-cover-state={image ? lastKnown ? "last-known" : "available" : loading ? "loading" : "unavailable"}>
    {image ? <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.image} alt="" width={image.width} height={image.height} className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" draggable={false} onError={() => setFailedImage(image.image)} />
      <span className="absolute right-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[10px] text-white" title={stamp} data-device-cover-timestamp>{tt(lastKnown ? "上次壁纸" : "设备壁纸")} · <time dateTime={new Date(image.observed_at * 1000).toISOString()}>{stamp}</time></span>
    </> : <span className="px-5 text-center text-xs text-neutral-400" role="status">{tt(loading ? "正在读取设备壁纸…" : cover?.state === "unavailable" && cover.reason === "headless" ? "此设备没有桌面壁纸" : placeholder)}</span>}
    {children}
  </div>;
}
