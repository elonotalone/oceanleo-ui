"use client";

import { useEffect, useState } from "react";
import { websitePanelsApi, type WebsitePanel, type WebsitePanelData, type WebsitePanelsApi } from "../../api/website-panels";
import type { WebsiteRuntime } from "../../api/website-runtime";
import { RUNTIME_STATES } from "./website-preview-model";
import { WebsitePanelView } from "./WebsitePanelView";
import { useWebsiteUI } from "./website-preview-i18n";

const PLATFORM_PANELS = [
  { id: "visits", title: "访问量", kind: "metric" },
  { id: "users", title: "注册用户", kind: "metric" },
  { id: "runtime_cost", title: "运行与费用", kind: "metric" },
  { id: "domain", title: "域名", kind: "metric" },
  { id: "errors", title: "错误", kind: "table" },
] as const;

function DashboardCard({ projectId, panel, api, pending, onWire }: {
  projectId: string; panel: WebsitePanel; api: WebsitePanelsApi; pending: boolean; onWire: () => void;
}) {
  const [data, setData] = useState<WebsitePanelData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(panel.state === "wired");
  useEffect(() => {
    setData(null); setError(""); setLoading(panel.state === "wired");
    if (panel.state !== "wired") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api.data(projectId, panel.id, controller.signal);
        if (!controller.signal.aborted) { setData(next); setError(""); }
      } catch (caught) {
        if (!controller.signal.aborted) { setData(null); setError(caught instanceof Error ? caught.message : String(caught)); }
      } finally {
        if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(poll, 15000); }
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, panel.id, panel.state, api]);
  return <div className="overflow-hidden rounded border border-[var(--awb-border)]" data-testid={`website-dashboard-${panel.id}`}>
    <WebsitePanelView panel={error ? { ...panel, state: "error" } : panel} data={data} loading={loading}
      error={error} pending={pending} onWire={onWire} />
  </div>;
}

export function WebsiteDashboard({ projectId, runtime, runtimeError, api = websitePanelsApi, pending = false, onWire, onLogs, onAction, onFix }: {
  projectId: string; runtime: WebsiteRuntime | null; runtimeError?: string; api?: WebsitePanelsApi; pending?: boolean;
  onWire: (panelId: string) => void; onLogs: () => void; onAction: (action: "start" | "stop" | "restart") => void; onFix: () => void;
}) {
  const tt = useWebsiteUI();
  const [panels, setPanels] = useState<WebsitePanel[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setPanels([]); setError(""); setLoading(true);
    const poll = async () => {
      try {
        const next = await api.list(projectId, controller.signal);
        if (!controller.signal.aborted) { setPanels(next); setError(""); }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(poll, 15000); }
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, api, refresh]);

  const meta = runtime && RUNTIME_STATES[runtime.state];
  const platformPanels: WebsitePanel[] = PLATFORM_PANELS.map(builtin => {
    const provided = panels.find(panel => panel.source === "platform" && panel.id === builtin.id);
    return { ...(provided || { ...builtin, source: "platform", state: "not_wired" }), title: tt(builtin.title) };
  });
  platformPanels.push(...panels.filter(panel => panel.source === "platform" && !PLATFORM_PANELS.some(builtin => builtin.id === panel.id)));
  const appPanels = panels.filter(panel => panel.source === "app");
  return <section className="h-full overflow-auto p-3 text-sm" data-testid="website-dashboard">
    <div className="mb-4 rounded border border-[var(--awb-border)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{tt("网站运行")} · {runtimeError ? tt("状态暂不可用") : meta ? tt(meta.label) : tt("加载中…")}</strong>
        <button type="button" className="text-xs underline" onClick={onLogs}>{tt("运行日志")}</button>
      </div>
      {runtimeError && <p role="alert" className="mt-2 text-xs text-red-600">{runtimeError}</p>}
      {runtime?.last_error && <p role="alert" className="mt-2 whitespace-pre-wrap break-words text-xs text-red-600">{runtime.last_error}</p>}
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {runtime && ["stopped", "sleeping", "crashed"].includes(runtime.state) &&
          <button type="button" disabled={pending} className="underline" onClick={() => onAction("start")}>{tt(runtime.state === "sleeping" ? "唤醒" : "启动")}</button>}
        {runtime && ["running", "crashed"].includes(runtime.state) &&
          <button type="button" disabled={pending} className="underline" onClick={() => onAction("restart")}>{tt("重启")}</button>}
        {runtime && ["installing", "starting", "running"].includes(runtime.state) &&
          <button type="button" disabled={pending} className="underline" onClick={() => onAction("stop")}>{tt("停止")}</button>}
        <button type="button" disabled={pending} className="underline" onClick={onFix}>{tt("让 agent 修复")}</button>
      </div>
    </div>
    <h2 className="font-semibold">{tt("平台看板")}</h2>
    <p className="mb-3 mt-1 text-xs opacity-65">{tt("平台维护的数据看板，agent 无法修改。")}</p>
    {error && <div role="alert" className="mb-3 text-xs text-red-600">{error} <button type="button" className="underline" onClick={() => setRefresh(value => value + 1)}>{tt("重试")}</button></div>}
    {loading ? <p role="status">{tt("加载中…")}</p> : <div className="space-y-3">
      {platformPanels.map(panel => <DashboardCard key={panel.id} projectId={projectId} panel={panel} api={api} pending={pending} onWire={() => {}} />)}
    </div>}
    <h2 className="mt-6 font-semibold">{tt("网站看板")}</h2>
    <p className="mb-3 mt-1 text-xs opacity-65">{tt("由你的网站声明，可让 agent 添加或配置。")}</p>
    {!loading && !appPanels.length && <p className="text-xs opacity-65">{tt("暂无网站看板")}</p>}
    <div className="space-y-3">
      {appPanels.map(panel => <DashboardCard key={panel.id} projectId={projectId} panel={panel} api={api} pending={pending} onWire={() => onWire(panel.id)} />)}
    </div>
  </section>;
}
