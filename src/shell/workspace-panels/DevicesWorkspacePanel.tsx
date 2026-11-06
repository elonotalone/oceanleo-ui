"use client";

import { useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { CloudBrowserPanel } from "../CloudBrowserPanel";
import { DevicesPage, type DevicesPageTab } from "../../pages/DevicesPage";

/** Devices in the sidebar: the existing device page plus its cloud-browser child. */
export function DevicesWorkspacePanel({ section, deviceId, taskId }: { section?: string; deviceId?: string; taskId?: string | null }) {
  const tt = useUI();
  const initial: DevicesPageTab = section === "cloud" ? "cloud" : "devices";
  const [tab, setTab] = useState<"devices" | "browser">(section === "cloud-browser" ? "browser" : "devices");
  return (
    <section data-workspace-devices-panel className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-4 py-2">
        <button type="button" data-devices-panel-tab="devices" aria-current={tab === "devices" ? "page" : undefined} onClick={() => setTab("devices")} className="rounded-lg px-3 py-1.5 text-[12px] font-medium hover:bg-neutral-100">{tt("Devices")}</button>
        <button type="button" data-devices-panel-tab="browser" aria-current={tab === "browser" ? "page" : undefined} onClick={() => setTab("browser")} className="rounded-lg px-3 py-1.5 text-[12px] font-medium hover:bg-neutral-100">{tt("云端浏览器")}</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {tab === "browser" ? <CloudBrowserPanel taskId={taskId} /> : <DevicesPage variant="pane" initialTab={initial} />}
      </div>
      {deviceId ? <span data-devices-panel-device={deviceId} className="sr-only" /> : null}
    </section>
  );
}

