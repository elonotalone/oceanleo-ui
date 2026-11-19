"use client";

import { AutoRecovery } from "../AutoRecovery";
import { useEffect, useState } from "react";
import { listDevices, type Device } from "../../api/devices";
import type { WorkPreviewSource } from "../works/model";
import { useWebsiteUI } from "../website-platform/website-preview-i18n";

export function WorkPreviewSourceControl({ source, pending, onChange }: {
  source: WorkPreviewSource; pending: boolean; onChange: (source: WorkPreviewSource) => void;
}) {
  const tt = useWebsiteUI();
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void listDevices({}, abort.signal).then(result => {
      if (!abort.signal.aborted) { setDevices(result.ok ? result.data || [] : []); setError(!result.ok); }
    }).catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => abort.abort();
  }, [retry]);
  const value = source.type === "screen" ? `screen:${source.device_id}` : source.type;
  return <div className="flex flex-wrap items-center gap-2 text-xs">
    <label>{tt("预览来源")} <select aria-label={tt("预览来源")} value={value} disabled={pending} className="rounded border bg-transparent px-2 py-1"
      onChange={event => {
        const next = event.target.value;
        onChange(next.startsWith("screen:") ? { type: "screen", device_id: next.slice(7), display_id: null }
          : next === "none" ? { type: "none" } : { type: "url", path: "/" });
      }}>
      <option value="url">{tt("作品自己的地址")}</option>
      {source.type === "screen" && !devices.some(device => device.device_id === source.device_id) && <option value={value}>{tt("当前服务器画面")}</option>}
      {devices.filter(device => ["linux", "macos", "windows"].includes(device.platform)).map(device => <option key={device.device_id} value={`screen:${device.device_id}`}>{device.device_name}{device.online ? "" : ` · ${tt("离线")}`}</option>)}
      <option value="none">{tt("不接入预览")}</option>
    </select></label>
    {error && <AutoRecovery identity="src/shell/works-workbench/WorkPreviewSourceControl.tsx:0" recover={() => setRetry(value => value + 1)} />}
  </div>;
}
