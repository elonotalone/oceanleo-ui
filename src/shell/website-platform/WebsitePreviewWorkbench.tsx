"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { notifyHistoryChanged } from "../../lib/history-events";
import { websiteRuntimeApi, type WebsiteRuntimeApi, type WebsiteRuntime, type WebsiteLogs } from "../../api/website-runtime";
import { websitePanelsApi, type WebsitePanelsApi } from "../../api/website-panels";
import { websiteConnectorsApi, type WebsiteConnectorsApi } from "../../api/website-connectors";
import { appendRuntimeLogs, fitPreviewViewport, previewPathUrl, RUNTIME_STATES } from "./website-preview-model";
import { WebsiteDashboard } from "./WebsiteDashboard";
import { WebsiteConfiguration } from "./WebsiteConfiguration";
import { WebsitePreviewPicker } from "./WebsitePreviewPicker";
import { useWebsiteUI } from "./website-preview-i18n";

const EMPTY_LOGS: WebsiteLogs = { lines: [], cursor: null };
type WebsiteView = "preview" | "dashboard" | "configuration";
const VIEWS: Array<[WebsiteView, string]> = [["preview", "预览"], ["dashboard", "仪表盘"], ["configuration", "配置"]];

export function WebsitePreviewWorkbench({ projectId, runtimeApi = websiteRuntimeApi, panelsApi = websitePanelsApi, connectorsApi = websiteConnectorsApi }: {
  projectId: string; runtimeApi?: WebsiteRuntimeApi; panelsApi?: WebsitePanelsApi; connectorsApi?: WebsiteConnectorsApi;
}) {
  const tt = useWebsiteUI();
  const [view, setView] = useState<WebsiteView>("preview");
  const [runtime, setRuntime] = useState<WebsiteRuntime | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pathDraft, setPathDraft] = useState("/");
  const [path, setPath] = useState("/");
  const [phone, setPhone] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<WebsiteLogs>(EMPTY_LOGS);
  const [logsError, setLogsError] = useState("");
  const [pending, setPending] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [taskHost, setTaskHost] = useState<HTMLElement | null>(null);
  const [picking, setPicking] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const checkpoint = useRef<{ projectId: string; api: WebsiteRuntimeApi; sent: boolean; mounts: number } | null>(null);

  useEffect(() => {
    if (!checkpoint.current || checkpoint.current.projectId !== projectId) {
      checkpoint.current = { projectId, api: runtimeApi, sent: false, mounts: 0 };
    }
    const lifetime = checkpoint.current;
    lifetime.api = runtimeApi;
    lifetime.mounts++;
    const leave = () => {
      if (lifetime.sent || !lifetime.projectId || !lifetime.api.checkpoint) return;
      lifetime.sent = true;
      void lifetime.api.checkpoint(lifetime.projectId, "leave").catch(() => { /* Best effort: the live workspace remains authoritative. */ });
    };
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      lifetime.mounts--;
      // StrictMode replays effects without leaving the project. Wait for a possible reattachment.
      queueMicrotask(() => { if (lifetime.mounts === 0) leave(); });
    };
  }, [projectId, runtimeApi]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setError("");
    const poll = async () => {
      try {
        const next = await runtimeApi.get(projectId, controller.signal);
        if (!controller.signal.aborted) { setRuntime(next); setError(""); }
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : String(caught)); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 3000); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, runtimeApi, refresh]);

  useEffect(() => {
    if (!logsOpen || view !== "dashboard") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let current = EMPTY_LOGS;
    setLogs(current); setLogsError("");
    const poll = async () => {
      try {
        const next = await runtimeApi.logs(projectId, current.cursor, controller.signal);
        if (!controller.signal.aborted) { current = appendRuntimeLogs(current, next); setLogs(current); setLogsError(""); }
      } catch (caught) { if (!controller.signal.aborted) setLogsError(caught instanceof Error ? caught.message : String(caught)); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 2000); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [logsOpen, view, projectId, runtimeApi]);

  useEffect(() => {
    generation.current++;
    setRuntime(null); setActionError(""); setTaskId(""); setTaskHost(null); setPath("/"); setPathDraft("/");
    setPicking(false); setPending(false); setLogsOpen(false); setPhone(false); setView("preview"); busy.current = false;
    return () => { generation.current++; };
  }, [projectId]);

  const url = previewPathUrl(runtime?.preview_url, path);
  useEffect(() => {
    const element = stage.current;
    if (!element || view !== "preview" || runtime?.state !== "running" || !url || error) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setStageSize({ width: rect.width, height: rect.height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(entries => {
      const size = entries.find(entry => entry.target === element)?.contentRect;
      if (size) setStageSize({ width: size.width, height: size.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [view, runtime?.state, !!url, !!error]);

  const taskCreated = (id: string) => {
    if (!id) throw new Error(tt("请求失败，请重试。"));
    setTaskId(id);
    const host = Array.from(document.querySelectorAll<HTMLElement>("[data-oceanleo-leo-entry-root]"))
      .find(node => node.getClientRects().length > 0);
    setTaskHost(host || null);
    notifyHistoryChanged();
  };
  async function run(action: () => Promise<unknown>, task = false) {
    if (busy.current) return;
    busy.current = true;
    const epoch = generation.current;
    setPending(true); setActionError("");
    try {
      const result = await action();
      if (epoch !== generation.current) return;
      if (task) taskCreated((result as { task_id: string }).task_id);
      else setRefresh(value => value + 1);
    } catch (caught) { if (epoch === generation.current) setActionError(caught instanceof Error ? caught.message : String(caught)); }
    finally { if (epoch === generation.current) { busy.current = false; setPending(false); } }
  }
  const meta = runtime && RUNTIME_STATES[runtime.state];
  const viewport = fitPreviewViewport(stageSize.width, stageSize.height, phone);
  const fix = () => void run(() => runtimeApi.fix(projectId), true);
  const taskNotice = taskId ? <div className="rounded border p-2 text-xs" data-testid="website-agent-task">
    {tt("任务已创建")} · <a className="underline" href={"/tasks/" + encodeURIComponent(taskId)}>{tt("打开 agent 任务")}</a>
  </div> : null;

  return <div className="flex h-full min-h-0 flex-col bg-[var(--awb-stage-bg)] text-[var(--awb-text)]" data-testid="website-preview-workbench">
    <nav role="tablist" aria-label={tt("网站视图")} className="flex shrink-0 gap-1 border-b border-[var(--awb-border)] p-2">
      {VIEWS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={view === id} aria-controls={`website-view-${id}`}
        data-testid={`website-view-${id}`} className={`rounded px-3 py-1.5 text-xs ${view === id ? "bg-[var(--awb-accent-soft)] text-[var(--awb-accent)]" : "hover:bg-[var(--awb-hover)]"}`}
        onClick={() => { setView(id); setPicking(false); setLogsOpen(false); }}>{tt(label)}</button>)}
    </nav>
    {view === "preview" && <div role="toolbar" aria-label={tt("网站预览")} className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b px-2 py-1 text-xs">
      <form className="min-w-0 flex-1" onSubmit={event => {
        event.preventDefault();
        if (!previewPathUrl(runtime?.preview_url, pathDraft)) { setActionError(tt("路径须以 / 开头，且只能在当前网站内跳转。")); return; }
        setActionError(""); setPath(pathDraft); setPicking(false);
      }}>
        <input aria-label={tt("预览路径")} value={pathDraft} onChange={event => setPathDraft(event.target.value)}
          className="h-7 w-full rounded border bg-transparent px-2" placeholder="/" />
      </form>
      <button type="button" aria-pressed={phone} onClick={() => { setPhone(value => !value); setPicking(false); }}>{tt(phone ? "手机" : "电脑")}</button>
      <span className="flex items-center gap-1 whitespace-nowrap" data-testid="website-runtime-badge">
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: error ? "#737373" : meta?.color || "#737373" }} />
        {error ? tt("状态暂不可用") : meta ? tt(meta.label) : tt("加载中…")}
      </span>
      <button type="button" disabled={!url || runtime?.state !== "running" || !!error} aria-pressed={picking}
        onClick={() => setPicking(value => !value)}>{tt(picking ? "取消点选" : "点选元素")}</button>
    </div>}
    {actionError && <p role="alert" className="px-3 py-1 text-xs text-red-600">{actionError}</p>}
    {runtime?.manifest_source === "detected" && view !== "configuration" && <div className="shrink-0 border-b px-3 py-1 text-xs">
      <button type="button" disabled={pending} onClick={() => void run(() => runtimeApi.fix(projectId, tt("请写入 .oceanleo/run.json 运行说明。")), true)}>{tt("让 agent 写入运行说明")}</button>
    </div>}
    {taskHost && taskNotice ? createPortal(taskNotice, taskHost) : taskNotice}
    <div role="tabpanel" id={`website-view-${view}`} className="relative flex min-h-0 flex-1 flex-col">
      {view === "configuration" ? <WebsiteConfiguration key={projectId} projectId={projectId} api={connectorsApi} onTaskCreated={taskCreated} />
        : view === "dashboard" ? <WebsiteDashboard key={projectId} projectId={projectId} runtime={runtime} runtimeError={error} api={panelsApi} pending={pending}
          onWire={panelId => void run(() => panelsApi.wire(projectId, panelId), true)} onLogs={() => setLogsOpen(true)}
          onAction={action => void run(() => runtimeApi.action(projectId, action))} onFix={fix} />
        : error ? <div className="p-5"><p role="alert">{error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>{tt("重试")}</button></div>
        : runtime?.state === "running" && url ? <>
          <div ref={stage} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden" data-testid="website-preview-stage">
            <div className="relative shrink-0 overflow-hidden" style={{ width: viewport.displayWidth, height: viewport.displayHeight }} data-testid="website-preview-viewport">
              <iframe ref={frame} src={url} title={tt("网站预览")} className="absolute left-0 top-0 border-0" referrerPolicy="no-referrer" tabIndex={-1}
                width={viewport.width} height={viewport.height} style={{ width: viewport.width, height: viewport.height, transform: `scale(${viewport.scale})`, transformOrigin: "top left", pointerEvents: "none" }}
                sandbox="allow-forms allow-modals allow-popups allow-presentation allow-scripts" />
              {picking && <WebsitePreviewPicker projectId={projectId} url={url} frame={frame} onClose={() => setPicking(false)} />}
            </div>
          </div>
          <p className="shrink-0 px-3 py-1 text-center text-xs opacity-65">{tt(phone ? "手机" : "电脑")} · {Math.round(viewport.scale * 100)}% · {tt("预览仅用于查看，修改请交给 agent。")}</p>
        </> : <div role="status" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" data-testid="website-runtime-state">
          <strong>{meta ? tt(meta.label) : tt("加载中…")}</strong>
          {meta?.progress !== undefined && <progress aria-label={tt(meta.label)} className="w-48" />}
          <p className="text-sm">{meta ? tt(meta.description) : tt("加载中…")}</p>
          {runtime?.last_error && <pre className="max-w-full overflow-auto whitespace-pre-wrap text-xs text-red-600">{runtime.last_error}</pre>}
          {runtime?.state === "running" && !url && <p>{tt("预览地址尚不可用。")}</p>}
          {runtime && ["stopped", "sleeping", "crashed"].includes(runtime.state) &&
            <button type="button" disabled={pending} onClick={() => void run(() => runtimeApi.action(projectId, "start"))}>{tt(runtime.state === "sleeping" ? "唤醒" : "启动")}</button>}
          {runtime && <button type="button" disabled={pending} onClick={fix}>{tt("让 agent 修复")}</button>}
          {runtime && <button type="button" className="text-xs underline" onClick={() => setView("dashboard")}>{tt("查看仪表盘")}</button>}
        </div>}
      {view === "dashboard" && logsOpen && <aside aria-label={tt("运行日志")} className="absolute inset-y-0 right-0 z-20 flex w-[min(100%,28rem)] flex-col border-l bg-[var(--awb-chrome-bg,#fff)] p-3 shadow" data-testid="website-runtime-logs">
        <div className="flex items-center justify-between text-sm"><strong>{tt("运行日志")}</strong><button type="button" onClick={() => setLogsOpen(false)}>{tt("关闭")}</button></div>
        <button type="button" disabled={pending} className="my-2 self-start text-xs underline" onClick={fix}>{tt("让 agent 修复")}</button>
        {logsError && <p role="alert">{logsError}</p>}
        <div role="log" aria-live="polite" className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
          {!logs.lines.length && <p>{tt("暂无日志")}</p>}
          {logs.lines.map((line, index) => <p key={index} data-stream={line.stream} style={{ color: line.stream === "stderr" ? "#dc2626" : line.stream === "install" ? "#b45309" : undefined }}>
            <time>{line.ts}</time> [{line.stream}] {line.text}
          </p>)}
        </div>
      </aside>}
    </div>
  </div>;
}
