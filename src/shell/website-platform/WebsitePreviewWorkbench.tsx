"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { notifyHistoryChanged } from "../../lib/history-events";
import { websiteRuntimeApi, type WebsiteRuntimeApi, type WebsiteRuntime, type WebsiteLogs } from "../../api/website-runtime";
import { websitePanelsApi, type WebsitePanelsApi, type WebsitePanel, type WebsitePanelData } from "../../api/website-panels";
import { appendRuntimeLogs, previewPathUrl, RUNTIME_STATES } from "./website-preview-model";
import { PANEL_STATE_LABEL, WebsitePanelView } from "./WebsitePanelView";
import { WebsitePreviewPicker } from "./WebsitePreviewPicker";
import { useWebsiteUI } from "./website-preview-i18n";

const EMPTY_LOGS: WebsiteLogs = { lines: [], cursor: null };
export function WebsitePreviewWorkbench({ projectId, runtimeApi = websiteRuntimeApi, panelsApi = websitePanelsApi }: {
  projectId: string; runtimeApi?: WebsiteRuntimeApi; panelsApi?: WebsitePanelsApi;
}) {
  const tt = useWebsiteUI();
  const [runtime, setRuntime] = useState<WebsiteRuntime | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [panelsError, setPanelsError] = useState("");
  const [pathDraft, setPathDraft] = useState("/");
  const [path, setPath] = useState("/");
  const [phone, setPhone] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<WebsiteLogs>(EMPTY_LOGS);
  const [logsError, setLogsError] = useState("");
  const [panels, setPanels] = useState<WebsitePanel[]>([]);
  const [panelId, setPanelId] = useState("");
  const [panelData, setPanelData] = useState<WebsitePanelData | null>(null);
  const [panelError, setPanelError] = useState("");
  const [panelLoading, setPanelLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [taskHost, setTaskHost] = useState<HTMLElement | null>(null);
  const [picking, setPicking] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const generation = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setError("");
    const poll = async () => {
      try {
        const next = await runtimeApi.get(projectId, controller.signal);
        if (!controller.signal.aborted) { setRuntime(next); setError(""); }
      } catch (caught) { if (!controller.signal.aborted) setError(String(caught instanceof Error ? caught.message : caught)); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 3000); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, runtimeApi, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setPanels([]); setPanelsError("");
    const poll = async () => {
      try {
        const next = await panelsApi.list(projectId, controller.signal);
        if (!controller.signal.aborted) { setPanels(next); setPanelsError(""); }
      } catch (caught) { if (!controller.signal.aborted) setPanelsError(String(caught instanceof Error ? caught.message : caught)); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 15000); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, panelsApi]);

  useEffect(() => {
    if (!logsOpen) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let current = EMPTY_LOGS;
    setLogs(current); setLogsError("");
    const poll = async () => {
      try {
        const next = await runtimeApi.logs(projectId, current.cursor, controller.signal);
        if (!controller.signal.aborted) { current = appendRuntimeLogs(current, next); setLogs(current); setLogsError(""); }
      } catch (caught) { if (!controller.signal.aborted) setLogsError(String(caught instanceof Error ? caught.message : caught)); }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 2000); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [logsOpen, projectId, runtimeApi]);

  const panel = panels.find(p => p.id === panelId);
  useEffect(() => {
    setPanelData(null); setPanelError("");
    if (!panel || panel.state !== "wired") { setPanelLoading(false); return; }
    const controller = new AbortController();
    setPanelLoading(true);
    panelsApi.data(projectId, panel.id, controller.signal).then(data => {
      if (!controller.signal.aborted) setPanelData(data);
    }).catch(caught => { if (!controller.signal.aborted) setPanelError(String(caught instanceof Error ? caught.message : caught)); })
      .finally(() => { if (!controller.signal.aborted) setPanelLoading(false); });
    return () => controller.abort();
  }, [projectId, panel?.id, panel?.state, panelsApi]);

  useEffect(() => {
    generation.current++;
    setRuntime(null); setActionError(""); setTaskId(""); setPath("/"); setPathDraft("/");
    setPicking(false); setPanelId(""); setPending(false);
    return () => { generation.current++; };
  }, [projectId]);
  const taskCreated = (id: string) => {
    if (!id) throw new Error(tt("请求失败，请重试。"));
    setTaskId(id);
    const host = Array.from(document.querySelectorAll<HTMLElement>("[data-oceanleo-leo-entry-root]"))
      .find(node => node.getClientRects().length > 0);
    setTaskHost(host || null);
    notifyHistoryChanged();
  };
  async function run(action: () => Promise<unknown>, task = false) {
    if (pending) return;
    const epoch = generation.current;
    setPending(true); setActionError("");
    try {
      const result = await action();
      if (epoch !== generation.current) return;
      if (task) taskCreated((result as { task_id: string }).task_id);
      else setRefresh(value => value + 1);
    } catch (caught) { if (epoch === generation.current) setActionError(String(caught instanceof Error ? caught.message : caught)); }
    finally { setPending(false); }
  }
  const meta = runtime && RUNTIME_STATES[runtime.state];
  const url = previewPathUrl(runtime?.preview_url, path);
  const taskNotice = taskId ? <div className="rounded border p-2 text-xs" data-testid="website-agent-task">
    {tt("任务已创建")} · <a className="underline" href={"/tasks/" + encodeURIComponent(taskId)}>{tt("打开 agent 任务")}</a>
  </div> : null;
  return <div className="flex h-full min-h-0 flex-col bg-[var(--awb-stage-bg)] text-[var(--awb-text)]" data-testid="website-preview-workbench">
    <div role="toolbar" aria-label={tt("网站预览")} className="flex min-h-10 shrink-0 items-center gap-2 border-b px-2 py-1 text-xs">
      <form className="min-w-0 flex-1" onSubmit={event => {
        event.preventDefault();
        if (!previewPathUrl(runtime?.preview_url, pathDraft)) { setActionError(tt("路径须以 / 开头，且只能在当前网站内跳转。")); return; }
        setActionError(""); setPath(pathDraft); setPanelId(""); setPicking(false);
      }}>
        <input aria-label={tt("预览路径")} value={pathDraft} onChange={event => setPathDraft(event.target.value)}
          className="h-7 w-full rounded border bg-transparent px-2" placeholder="/" />
      </form>
      <button type="button" aria-pressed={phone} onClick={() => setPhone(value => !value)}>{tt(phone ? "手机" : "电脑")}</button>
      <button type="button" aria-expanded={logsOpen} title={tt("查看运行日志")} onClick={() => setLogsOpen(value => !value)} className="flex items-center gap-1 whitespace-nowrap">
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: meta?.color || "#737373" }} />
        {meta ? tt(meta.label) : tt("加载中…")}
      </button>
      <select aria-label={tt("看板")} value={panelId} onChange={event => { setPanelId(event.target.value); setPicking(false); }} className="max-w-40 bg-transparent">
        <option value="">{tt("看板")}</option>
        {!panels.length && <option disabled>{tt("暂无看板")}</option>}
        {panels.map(p => <option key={p.id} value={p.id}>{p.title} · {tt(PANEL_STATE_LABEL[p.state])}</option>)}
      </select>
      <button type="button" disabled={!url || runtime?.state !== "running" || !!panelId} aria-pressed={picking}
        onClick={() => setPicking(value => !value)}>{tt(picking ? "取消点选" : "点选元素")}</button>
    </div>
    {(actionError || panelsError) && <p role="alert" className="px-3 py-1 text-xs text-red-600">{actionError || panelsError}</p>}
    {runtime?.manifest_source === "detected" && <div className="border-b px-3 py-1 text-xs">
      <button type="button" disabled={pending} onClick={() => void run(() => runtimeApi.fix(projectId, tt("请写入 .oceanleo/run.json 运行说明。")), true)}>{tt("让 agent 写入运行说明")}</button>
    </div>}
    {taskHost && taskNotice ? createPortal(taskNotice, taskHost) : taskNotice}
    <div className="relative flex min-h-0 flex-1">
      <div className="min-h-0 min-w-0 flex-1">
        {panelId ? <div className="flex h-full min-h-0 flex-col">
          <button type="button" className="self-start px-4 py-2 text-xs underline" onClick={() => setPanelId("")}>{tt("返回预览")}</button>
          {panel ? <WebsitePanelView panel={panel} data={panelData} loading={panelLoading} error={panelError} pending={pending}
            onWire={() => void run(() => panelsApi.wire(projectId, panel.id), true)} /> : <p className="p-4">{tt("看板数据暂不可用。")}</p>}
        </div> : error ? <div className="p-5"><p role="alert">{error}</p><button type="button" onClick={() => setRefresh(v => v + 1)}>{tt("重试")}</button></div>
        : runtime?.state === "running" && url ? <div className="mx-auto h-full max-w-full" style={{ width: phone ? 390 : "100%" }}>
          <div className="relative h-full">
            <iframe ref={frame} src={url} title={tt("网站预览")} className="h-full w-full border-0" referrerPolicy="no-referrer"
              sandbox="allow-forms allow-modals allow-popups allow-presentation allow-scripts" />
            {picking && <WebsitePreviewPicker projectId={projectId} url={url} frame={frame} onClose={() => setPicking(false)} />}
          </div>
        </div> : <div role="status" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" data-testid="website-runtime-state">
          <strong>{meta ? tt(meta.label) : tt("加载中…")}</strong>
          {meta?.progress !== undefined && <progress aria-label={tt(meta.label)} className="w-48" />}
          <p className="text-sm">{meta ? tt(meta.description) : tt("加载中…")}</p>
          {runtime?.last_error && <pre className="max-w-full overflow-auto whitespace-pre-wrap text-xs text-red-600">{runtime.last_error}</pre>}
          {runtime?.state === "running" && !url && <p>{tt("预览地址尚不可用。")}</p>}
          {runtime && ["stopped", "sleeping", "crashed"].includes(runtime.state) &&
            <button type="button" disabled={pending} onClick={() => void run(() => runtimeApi.action(projectId, "start"))}>{tt(runtime.state === "sleeping" ? "唤醒" : "启动")}</button>}
          {runtime?.state === "crashed" && <button type="button" disabled={pending} onClick={() => void run(() => runtimeApi.fix(projectId), true)}>{tt("让 agent 修复")}</button>}
        </div>}
      </div>
      {logsOpen && <aside aria-label={tt("运行日志")} className="absolute inset-y-0 right-0 z-20 flex w-[min(100%,28rem)] flex-col border-l bg-[var(--awb-chrome-bg,#fff)] p-3 shadow" data-testid="website-runtime-logs">
        <div className="flex items-center justify-between text-sm"><strong>{tt("运行日志")}</strong><button type="button" onClick={() => setLogsOpen(false)}>{tt("关闭")}</button></div>
        <div className="my-2 flex flex-wrap gap-3 text-xs">
          <button type="button" disabled={pending} onClick={() => void run(() => runtimeApi.fix(projectId), true)}>{tt("让 agent 修复")}</button>
          <button type="button" disabled={pending} onClick={() => void run(() => runtimeApi.action(projectId, "restart"))}>{tt("重启")}</button>
          <button type="button" disabled={pending} onClick={() => void run(() => runtimeApi.action(projectId, "stop"))}>{tt("停止")}</button>
        </div>
        {logsError && <p role="alert">{logsError}</p>}
        <div role="log" aria-live="polite" className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
          {!logs.lines.length && <p>{tt("暂无日志")}</p>}
          {logs.lines.map((line, i) => <p key={i} data-stream={line.stream} style={{ color: line.stream === "stderr" ? "#dc2626" : line.stream === "install" ? "#b45309" : undefined }}>
            <time>{line.ts}</time> [{line.stream}] {line.text}
          </p>)}
        </div>
      </aside>}
    </div>
  </div>;
}
