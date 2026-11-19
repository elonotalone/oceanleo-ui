"use client";
import { AutoRecovery } from "../AutoRecovery";
import { BackButton } from "../../ui/BackButton";
import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { notifyHistoryChanged } from "../../lib/history-events";
import { websiteRuntimeApi, type WebsiteRuntimeApi, type WebsiteRuntime, type WebsiteLogs } from "../../api/website-runtime";
import { websitePanelsApi, type WebsitePanelsApi } from "../../api/website-panels";
import { websiteConnectorsApi, type WebsiteConnectorsApi } from "../../api/website-connectors";
import { appendRuntimeLogs, fitPreviewViewport, previewPathUrl, RUNTIME_STATES } from "./website-preview-model";
import { WebsiteDashboard } from "./WebsiteDashboard";
import { WebsiteConfiguration } from "./WebsiteConfiguration";
import { WebsitePreviewPicker } from "./WebsitePreviewPicker";
import { previewReferenceUrl } from "./website-preview-reference";
import { worksApi as defaultWorksApi, type WorksApi, type WorkPreviewSourceResult } from "../../lib/works-api";
import type { Work, WorkPreviewSource, WorkPreviewResult } from "../works/model";
import { DEFAULT_KIND_DEFINITION, type WorkKindDefinition } from "../works/kinds";
import { WorkNotWired } from "../works-workbench/WorkNotWired";
import { WorkScreenPreview } from "../works-workbench/WorkScreenPreview";
import { WorkPreviewSourceControl } from "../works-workbench/WorkPreviewSourceControl";
import { WebsiteCodeSourceViewer } from "../works-workbench/WebsiteCodeSourceViewer";
import { useWebsiteUI } from "./website-preview-i18n";

const EMPTY_LOGS: WebsiteLogs = { lines: [], cursor: null };
type WebsiteView = "preview" | "dashboard" | "configuration";
const VIEWS: Array<[WebsiteView, string]> = [["preview", "预览"], ["dashboard", "仪表盘"], ["configuration", "配置"]];

/** A mounted document keeps its original URL; only a new document lifetime consumes the latest ticket. */
function PreviewDocument({ initialUrl, frame, width, height, scale, title, interactive }: {
  initialUrl: string; frame: RefObject<HTMLIFrameElement | null>; width: number; height: number; scale: number; title: string; interactive: boolean;
}) {
  const [documentUrl] = useState(() => initialUrl);
  // UC-1/UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md.
  // User code stays on oceanleo.app without scripted same-origin access.
  return <iframe ref={frame} src={documentUrl} title={title} className="absolute left-0 top-0 border-0" referrerPolicy="no-referrer" tabIndex={interactive ? 0 : -1}
    width={width} height={height} style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: interactive ? "auto" : "none" }}
    sandbox="allow-forms allow-modals allow-popups allow-presentation allow-scripts" />;
}

export function WebsitePreviewWorkbench({ projectId, runtimeApi = websiteRuntimeApi, panelsApi = websitePanelsApi, connectorsApi = websiteConnectorsApi, work, worksApi = defaultWorksApi, kind = DEFAULT_KIND_DEFINITION, readOnly = false }: {
  projectId: string; runtimeApi?: WebsiteRuntimeApi; panelsApi?: WebsitePanelsApi; connectorsApi?: WebsiteConnectorsApi;
  work?: Work; worksApi?: WorksApi; kind?: WorkKindDefinition; readOnly?: boolean;
}) {
  const tt = useWebsiteUI();
  const [view, setView] = useState<WebsiteView>("preview");
  const [runtimeSnapshot, setRuntime] = useState<{ projectId: string; value: WebsiteRuntime } | null>(null);
  const runtime = runtimeSnapshot?.projectId === projectId ? runtimeSnapshot.value : null;
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pathDraft, setPathDraft] = useState("/");
  const [path, setPath] = useState("/");
  const [navigation, setNavigation] = useState(0);
  const [phone, setPhone] = useState<"desktop" | "phone" | "tablet">(kind.preview.frame === "phone" ? "phone" : "desktop");
  const [orientation, setOrientation] = useState(work?.orientation || kind.preview.orientation);
  const [refresh, setRefresh] = useState(0);
  const sourceEpoch = useRef(0);
  const [sourceSnapshot, setSourceSnapshot] = useState<{ id: string; value: WorkPreviewSourceResult } | null>(null);
  const [sourceError, setSourceError] = useState("");
  const [serverPreview, setServerPreview] = useState<WorkPreviewResult | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const previewSource = sourceSnapshot?.id === work?.id ? sourceSnapshot?.value : undefined;
  const source = previewSource?.preview_source;
  const server = work?.home.type === "server";
  const sourcePath = source?.type === "url" ? source.path || "/" : "/";
  useEffect(() => { setPath("/"); setPathDraft(sourcePath); setPicking(false); }, [source?.type, sourcePath]);
  useEffect(() => { setPhone(kind.preview.frame === "phone" ? "phone" : "desktop"); setOrientation(work?.orientation || kind.preview.orientation); }, [kind.preview.frame, kind.preview.orientation, work?.orientation]);
  useEffect(() => {
    if (!work || readOnly) return;
    const epoch = ++sourceEpoch.current;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await worksApi.previewSource(work.id, abort.signal);
        if (!abort.signal.aborted && epoch === sourceEpoch.current) { setSourceSnapshot({ id: work.id, value }); setSourceError(""); }
      } catch { if (!abort.signal.aborted && epoch === sourceEpoch.current) setSourceError(tt("预览来源暂不可用，请重试。")); }
      finally { if (!abort.signal.aborted && epoch === sourceEpoch.current) timer = setTimeout(poll, 3000); }
    };
    void poll();
    return () => { abort.abort(); clearTimeout(timer); };
    // The work id pins this source read; locale changes never rotate the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work?.id, readOnly, worksApi, refresh]);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<WebsiteLogs>(EMPTY_LOGS);
  const [logsError, setLogsError] = useState("");
  const [pending, setPending] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [taskHost, setTaskHost] = useState<HTMLElement | null>(null);
  const [picking, setPicking] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const checkpoint = useRef<{ projectId: string; api: WebsiteRuntimeApi; sent: boolean; mounts: number } | null>(null);

  useEffect(() => {
    if (!projectId || readOnly) return;
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
  }, [projectId, runtimeApi, readOnly]);

  useEffect(() => {
    if (!projectId || readOnly) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await runtimeApi.get(projectId, controller.signal);
        if (!controller.signal.aborted) { setRuntime({ projectId, value: next }); setError(""); }
      } catch (caught) { if (!controller.signal.aborted) {
        if ([404, 501].includes(Number((caught as { status?: number })?.status))) { setRuntime(null); setError(""); }
        else setError(caught instanceof Error ? caught.message : String(caught));
      } }
      finally { if (!controller.signal.aborted) timer = setTimeout(poll, 3000); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, runtimeApi, refresh, work?.id, source?.type, readOnly]);

  useEffect(() => {
    if (!projectId || !logsOpen || readOnly) return;
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
  }, [logsOpen, projectId, runtimeApi, readOnly]);

  useEffect(() => {
    generation.current++;
    setRuntime(null); setError(""); setActionError(""); setTaskId(""); setTaskHost(null); setPath("/"); setPathDraft("/"); setNavigation(0);
    setPicking(false); setPending(false); setLogsOpen(false); setPhone(kind.preview.frame === "phone" ? "phone" : "desktop"); setView("preview"); busy.current = false;
    return () => { generation.current++; };
  }, [projectId]);

  const baseUrl = work ? readOnly ? work.play_url || work.preview.url : source?.type === "url"
    ? serverPreview?.status === "ready" ? serverPreview.url : previewSource?.resolved.state === "ready" ? previewSource.resolved.url : undefined
    : undefined : runtime?.preview_url;
  let initialPath = "/";
  try { const initial = new URL(baseUrl || ""); initialPath = initial.pathname + initial.search + initial.hash; } catch { /* No address wired. */ }
  const url = previewPathUrl(baseUrl, path === "/" ? source?.type === "url" ? source.path || initialPath : initialPath : path);
  const running = !!url && (readOnly || serverPreview?.status === "ready" || previewSource?.resolved.state === "ready" || runtime?.state === "running");
  // Source commits and ticket rotations keep the document alive for HMR. A new
  // host/start, explicit navigation or actual unmount creates a fresh document.
  const documentIdentity = JSON.stringify([work?.id || projectId, previewReferenceUrl(baseUrl || ""), runtime?.node_id, runtime?.started_at, navigation]);
  useEffect(() => {
    const element = stage.current;
    if (!element || view !== "preview" || !running || !url || error || sourceOpen) return;
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
  }, [view, running, !!url, !!error, sourceOpen]);

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
  const viewport = fitPreviewViewport(stageSize.width, stageSize.height, phone,
    kind.preview.frame === "game" ? orientation === "portrait" ? { width: 720, height: 1280 } : { width: 1280, height: 720 } : undefined);
  const changeSource = (next: WorkPreviewSource) => void run(async () => {
    if (!work) return;
    sourceEpoch.current++;
    let value: WorkPreviewSourceResult;
    try { value = await worksApi.setPreviewSource(work.id, next); }
    catch { setRefresh(current => current + 1); throw new Error(tt("预览来源修改结果尚未确认，请刷新后重试。")); }
    setSourceSnapshot({ id: work.id, value }); setServerPreview(null); setPicking(false); setPath("/"); setPathDraft("/"); setNavigation(value => value + 1);
  });
  const startServer = () => void run(async () => {
    if (!work) return;
    const value = await worksApi.preview(work.id); setServerPreview(value); return value;
  });
  const fix = () => void run(() => runtimeApi.fix(projectId), true);
  const taskNotice = taskId ? <div className="rounded border p-2 text-xs" data-testid="website-agent-task">
    {tt("任务已创建")} · <a className="underline" href={"/tasks/" + encodeURIComponent(taskId)}>{tt("打开 agent 任务")}</a>
  </div> : null;

  useEffect(() => {
    if (!work || serverPreview?.status !== "starting") return;
    const abort = new AbortController();
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await worksApi.preview(work.id, abort.signal);
        if (abort.signal.aborted) return;
        if (value.status === "starting" && Date.now() - started > 90000) { setServerPreview({ status: "failed", reason: tt("预览启动超时，请稍后重试。") }); return; }
        setServerPreview(value);
        if (value.status === "starting") timer = setTimeout(poll, 2000);
      } catch { if (!abort.signal.aborted) setServerPreview({ status: "failed", reason: tt("预览启动失败") }); }
    };
    timer = setTimeout(poll, 2000);
    return () => { abort.abort(); clearTimeout(timer); };
    // One bounded startup poll per explicit start; no auto start on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work?.id, worksApi, serverPreview?.status]);

  return <div className="flex h-full min-h-0 flex-col bg-[var(--awb-stage-bg)] text-[var(--awb-text)]" data-testid="website-preview-workbench">
    {!readOnly && <nav role="tablist" aria-label={tt("作品视图")} className="flex shrink-0 gap-1 border-b border-[var(--awb-border)] p-2">
      {VIEWS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={view === id} aria-controls={`website-view-${id}`}
        data-testid={`website-view-${id}`} className={`rounded px-3 py-1.5 text-xs ${view === id ? "bg-[var(--awb-accent-soft)] text-[var(--awb-accent)]" : "hover:bg-[var(--awb-hover)]"}`}
        onClick={() => { setView(id); setPicking(false); setLogsOpen(false); }}>{tt(label)}</button>)}
    </nav>}
    {view === "preview" && <div role="toolbar" aria-label={tt("作品预览")} className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b px-2 py-1 text-xs">
      {work && !readOnly && <WorkPreviewSourceControl source={source || { type: "url", path: "/" }} pending={pending || !source} onChange={changeSource} />}
      {(!work || source?.type === "url" || readOnly) && <>
      {kind.preview.frame !== "game" && <form className="min-w-0 flex-1" onSubmit={event => {
        event.preventDefault();
        if (!previewPathUrl(baseUrl, pathDraft)) { setActionError(tt("路径须以 / 开头，且只能在当前作品内跳转。")); return; }
        setActionError(""); setPath(pathDraft); setNavigation(value => value + 1); setPicking(false);
      }}>
        <input aria-label={tt("预览路径")} value={pathDraft} onChange={event => setPathDraft(event.target.value)}
          className="h-7 w-full rounded border bg-transparent px-2" placeholder="/" />
      </form>}
      {kind.preview.frame === "game" ? <>
        <button type="button" onClick={() => { setOrientation(value => value === "portrait" ? "landscape" : "portrait"); setPicking(false); }}>{orientation === "portrait" ? "9:16" : "16:9"}</button>
        <button type="button" onClick={() => void stage.current?.requestFullscreen?.().catch(() => {})}>{tt("全屏")}</button>
      </> : <>
        <button type="button" aria-pressed={phone === "phone"} onClick={() => { setPhone(value => value === "phone" ? "desktop" : "phone"); setPicking(false); }}>{tt(phone === "phone" ? "手机" : "电脑")}</button>
        {kind.preview.frame === "phone" && <button type="button" aria-pressed={phone === "tablet"} onClick={() => { setPhone("tablet"); setPicking(false); }}>{tt("平板")}</button>}
      </>}
      <button type="button" onClick={() => { setNavigation(value => value + 1); setRefresh(value => value + 1); setPicking(false); }}>{tt(kind.preview.frame === "game" ? "重新开始" : "刷新")}</button>
      <span className="flex items-center gap-1 whitespace-nowrap" data-testid="website-runtime-badge">
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: error ? "#737373" : meta?.color || "#737373" }} />
        {error ? tt("状态暂不可用") : meta ? tt(meta.label) : running ? tt("运行中") : tt("未接入")}
      </span>
      {!readOnly && <button type="button" disabled={!running || !!error} aria-pressed={picking}
        onClick={() => setPicking(value => !value)}>{tt(picking ? "取消指位置" : "指位置给 agent")}</button>}
      </>}
      {!!projectId && !readOnly && <><button type="button" onClick={() => setLogsOpen(value => !value)}>{tt("运行日志")}</button>
        <>{sourceOpen ? <BackButton label={tt("返回预览")} onClick={() => { setSourceOpen(false); setPicking(false); }} /> : <button type="button" onClick={() => { setSourceOpen(true); setPicking(false); }}>{tt("查看源码")}</button>}</></>}
      {server && source?.type === "url" && !readOnly && <>
        <button type="button" disabled={pending || serverPreview?.status === "starting"} onClick={startServer}>{tt("打开预览")}</button>
        <button type="button" disabled={pending || (!running && serverPreview?.status !== "starting")} onClick={() => void run(async () => { await worksApi.stop(work.id); setServerPreview(null); })}>{tt("停止")}</button>
      </>}
    </div>}
    {actionError && <p role="alert" className="px-3 py-1 text-xs text-red-600">{actionError}</p>}
    {sourceError && <AutoRecovery identity="src/shell/website-platform/WebsitePreviewWorkbench.tsx:0" error={sourceError} recover={() => setRefresh(value => value + 1)} />}
    {runtime?.manifest_source === "detected" && view !== "configuration" && <div className="shrink-0 border-b px-3 py-1 text-xs">
      <button type="button" disabled={pending} onClick={() => void run(() => runtimeApi.fix(projectId, tt("请写入 .oceanleo/run.json 运行说明。")), true)}>{tt("让 agent 写入运行说明")}</button>
    </div>}
    {taskHost && taskNotice ? createPortal(taskNotice, taskHost) : taskNotice}
    <div role="tabpanel" id={`website-view-${view}`} className="relative flex min-h-0 flex-1 flex-col">
      {view === "configuration" ? !projectId ? <WorkNotWired page="configuration" /> : <WebsiteConfiguration key={projectId} projectId={projectId} api={connectorsApi} onTaskCreated={taskCreated} />
        : view === "dashboard" ? !projectId ? <WorkNotWired page="dashboard" /> : <WebsiteDashboard key={projectId} projectId={projectId} runtime={runtime} runtimeError={error} api={panelsApi} defaultBoards={kind.default_boards} pending={pending}
          onWire={panelId => void run(() => panelsApi.wire(projectId, panelId), true)} onLogs={() => setLogsOpen(true)}
          onAction={action => void run(() => runtimeApi.action(projectId, action))} onFix={fix} />
        : sourceOpen && projectId ? <div className="min-h-0 flex-1 overflow-auto"><WebsiteCodeSourceViewer projectId={projectId} /></div>
        : source?.type === "screen" ? <div className="flex min-h-0 flex-1 flex-col">
          {previewSource?.resolved.state === "unavailable" && <p role="status" className="p-3 text-xs">{previewSource.resolved.detail || tt("状态暂不可用")}</p>}
          <WorkScreenPreview key={source.device_id} workId={work!.id} deviceId={source.device_id} deviceName={previewSource?.resolved.device_name || source.device_id} />
        </div>
        : source?.type === "none" ? <WorkNotWired />
        : work && previewSource?.resolved.state === "not_wired" && !server ? <div className="flex min-h-0 flex-1 flex-col"><WorkNotWired />
          {!!projectId && !readOnly && <div className="flex items-center justify-center gap-3 p-3 text-xs"><span>{meta ? tt(meta.label) : tt("未接入")}</span>
            {runtime && ["stopped", "sleeping", "crashed"].includes(runtime.state) && <button type="button" disabled={pending} onClick={() => void run(() => runtimeApi.action(projectId, "start"))}>{tt(runtime.state === "sleeping" ? "唤醒" : "启动")}</button>}
            <button type="button" disabled={pending} onClick={fix}>{tt("让 agent 修复")}</button>
          </div>}
        </div>
        : work && !readOnly && !previewSource && !sourceError ? <p role="status" className="p-4">{tt("加载中…")}</p>
        : work && readOnly && !url ? <WorkNotWired />
        : sourceError ? <WorkNotWired />
        : work && previewSource?.resolved.state === "unavailable" ? <div role="status" className="p-5">{tt("状态暂不可用")}<p>{previewSource.resolved.detail}</p>{projectId && <button type="button" onClick={fix}>{tt("让 agent 修复")}</button>}</div>
        : error ? <AutoRecovery identity="src/shell/website-platform/WebsitePreviewWorkbench.tsx:1" error={error} recover={() => setRefresh(value => value + 1)} />
        : running && url ? <>
          <div ref={stage} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden" data-testid="website-preview-stage">
            <div className="relative shrink-0 overflow-hidden" style={{ width: viewport.displayWidth, height: viewport.displayHeight }} data-testid="website-preview-viewport">
              <PreviewDocument key={documentIdentity} initialUrl={url} frame={frame} title={tt("作品预览")} interactive={!!work}
                width={viewport.width} height={viewport.height} scale={viewport.scale} />
              {picking && <WebsitePreviewPicker projectId={projectId} workId={work?.id} source="url" url={previewReferenceUrl(url)} frame={frame} onClose={() => setPicking(false)} />}
            </div>
          </div>
          <p className="shrink-0 px-3 py-1 text-center text-xs opacity-65">{tt(phone === "phone" ? "手机" : phone === "tablet" ? "平板" : "电脑")} · {Math.round(viewport.scale * 100)}% · {tt("预览仅用于查看，修改请交给 agent。")}</p>
        </> : work && !projectId ? <div className="relative flex min-h-0 flex-1 flex-col"><WorkNotWired />
          {serverPreview?.status === "starting" && <p role="status" className="p-4">{tt("启动中…")}</p>}
          {serverPreview?.status === "failed" && <p role="alert" className="p-4">{serverPreview.reason || tt("预览启动失败")}</p>}
        </div> : <div role="status" className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" data-testid="website-runtime-state">
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
      {logsOpen && !readOnly && <aside aria-label={tt("运行日志")} className="absolute inset-y-0 right-0 z-20 flex w-[min(100%,28rem)] flex-col border-l bg-[var(--awb-chrome-bg,#fff)] p-3 shadow" data-testid="website-runtime-logs">
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
