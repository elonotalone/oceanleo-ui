"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUI, type UITranslate } from "../../i18n/ui/useUI";
import { CloudBrowserPanel } from "../../shell/CloudBrowserPanel";
import { CARD, CARD_DESC, CARD_TITLE, FIELD, Note, PRIMARY, QUIET } from "./personalization/parts";
import {
  BrowserFlowsApiError,
  browserFlowRunCompleted,
  cloudBrowserFlowsApi,
  type BrowserFlow,
  type BrowserFlowAction,
  type BrowserFlowInput,
  type BrowserFlowRun,
  type BrowserFlowRunReceipt,
  type BrowserFlowSession,
  type BrowserFlowStep,
  type BrowserParallelCapacity,
  type BrowserLibraryDownload,
  type BrowserSessionDownload,
  type BrowserSessionDownloads,
} from "./cloud-browser-flows-api";

const ACTION_LABELS: Record<BrowserFlowAction, string> = {
  navigate: "打开网页", click: "点击", fill: "填写普通文字", select: "选择选项", press: "按键", credential: "使用密钥库凭据",
};
const ANCHOR_LABELS = { role: "元素角色", name: "元素名称", label: "字段标签", test_id: "页面标记" } as const;
const SESSION_LABELS: Record<string, string> = {
  active: "运行中", running: "运行中", ready: "已就绪", starting: "正在启动", queued: "排队中",
  paused: "已暂停", blocked: "等待你确认", pending_approval: "等待你确认", hibernated: "已休眠",
  hibernating: "正在休眠", stopped: "已停止", closed: "已关闭", deleted: "已删除", failed: "失败", error: "失败",
};

function errorCopy(error: unknown, tt: UITranslate): string {
  if (!(error instanceof BrowserFlowsApiError)) return tt("操作没有完成，请稍后重试。");
  if (error.code === "EMPTY_RECORDING") return tt("还没有录下可保存的步骤。请先打开浏览器并演示，再停止并保存。");
  if (error.code === "UNSAFE_STEP" || error.code === "INVALID_FLOW") return tt("请检查流程名称和步骤。每一步都需要有效的网页或页面元素，密码和密钥只能使用密钥库引用。");
  if (error.code === "INVALID_SITE_ORIGIN") return tt("网站范围只能填写网站来源，例如 https://example.com，不包含路径。");
  if (error.code === "INVALID_RESPONSE") return tt("服务器没有返回可确认的结果，请刷新后重试。");
  if (error.code === "DOWNLOAD_NOT_READY") return tt("文件还没有准备好，请刷新文件列表后重试。");
  if (error.status === 413) return tt("文件超过当前空间或大小限制。");
  if (error.status === 401) return tt("登录状态已失效，请重新登录。");
  if (error.status === 403) return tt("你没有权限操作这个浏览器或流程。");
  if (error.status === 404) return tt("这条记录已不存在，请刷新后重试。");
  if (error.status === 409) return tt("浏览器、文件或流程状态已改变，请刷新后重试。");
  if (error.status === 422) return tt("内容没有通过检查，请修改后重试。");
  if (error.status === 429) return tt("操作太频繁或浏览器名额已满，请稍后重试。");
  if (error.code === "NETWORK_OR_TIMEOUT") return tt("没有收到服务器结果。请刷新确认状态，再决定是否重试。");
  return tt("服务器没有完成这个操作，请稍后重试。");
}

function sessionLabel(session: BrowserFlowSession, tt: UITranslate): string {
  return `${session.title || tt("浏览器任务")} · ${session.id.slice(-8)}`;
}

function canTeach(session: BrowserFlowSession | undefined): session is BrowserFlowSession {
  const inactive = ["hibernated", "hibernating", "stopped", "closed", "deleted", "failed", "error", "queued", "starting", "paused", "blocked", "pending_approval"];
  return Boolean(session?.runtime_id && !inactive.includes(session.status) && !inactive.includes(session.runtime_state || ""));
}

function RunOutcome({ run, receipt, browserName, tt }: { run: BrowserFlowRun; receipt?: BrowserFlowRunReceipt; browserName: string; tt: UITranslate }) {
  const complete = browserFlowRunCompleted(run);
  const failed = run.status === "failed";
  const ready = receipt?.status === "ready";
  const label = complete ? tt("流程已完成")
    : ready ? tt("确认已完成，可以继续流程")
      : receipt?.status === "running" ? tt("流程正在运行，尚未完成")
    : run.approval || run.status === "pending_approval" ? tt("等待你确认，流程尚未完成")
      : run.status === "queued" ? tt("流程已排队，尚未完成")
        : run.status === "paused" || run.status === "blocked" ? tt("流程已暂停，尚未完成")
          : failed ? tt("流程执行失败，尚未完成") : tt("流程结果尚未确认");
  return <div data-browser-flow-run-status={complete ? "completed" : run.status === "completed" ? "unconfirmed" : run.status} data-browser-flow-run-code={run.code} role={failed ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-[13px] ${complete ? "bg-emerald-50 text-emerald-700" : failed ? "bg-red-50 text-red-700" : "bg-neutral-50 text-neutral-600"}`}>
    <p>{label}{" · "}{tt("{done}/{total} 步", { done: receipt?.next_step ?? run.completed_steps, total: run.total_steps })}</p>
    <p className="mt-1 text-[12px]">{tt("执行浏览器：{name}", { name: browserName })}</p>
    {!complete && <p className="mt-1 text-[12px]">{ready ? tt("将从服务器记录的位置继续执行。") : run.approval ? run.next_step === undefined ? tt("请在浏览器任务中处理确认请求，确认后检查当前页面。") : tt("已停在第 {number} 步；确认后请检查当前页面。", { number: run.next_step + 1 }) : tt("流程尚未完成，请在对应浏览器检查当前页面。")}</p>}
  </div>;
}

function Capacity({ value, tt }: { value: BrowserParallelCapacity | null; tt: UITranslate }) {
  const count = (value: number | null | undefined) => value === null || value === undefined ? tt("未知") : String(value);
  const capacity = value?.capacity;
  const cost = value?.cost_basis;
  const status = capacity?.state === "available" ? tt("有可用容量") : capacity?.state === "saturated" ? tt("容量已用满") : tt("容量未知");
  return <div data-browser-parallel-capacity className="space-y-2 rounded-lg bg-neutral-50 p-3 text-[13px] text-neutral-600">
    <p className="font-medium text-neutral-900">{status}</p>
    <p>{tt("已占用或预留的浏览器名额：{count}", { count: count(capacity?.browser_slots.in_use) })}{" · "}{tt("可新增浏览器数：{count}", { count: count(capacity?.available_slots) })}</p>
    <p className="text-[12px]">{tt("容量取决于当前服务器的名额和内存，其他任务也会使用这些资源。每个浏览器使用独立的登录副本和下载目录。")}</p>
    <div data-browser-parallel-cost className="space-y-1 border-t border-neutral-200 pt-2">
      {!cost?.rates.length || cost.status === "unknown" ? <p>{tt("费用：未知")}</p> : <>
        <p>{tt("计算费用基准")}</p>
        {cost.rates.map((rate, index) => <p key={`${rate.currency}-${index}`} className="text-[12px]">{tt("{currency} {price} / 服务器小时（{memory} MiB）", { currency: rate.currency, price: String(rate.node_hourly_price), memory: rate.node_memory_mib })}</p>)}
      </>}
      {cost?.markup === 0 && <p className="text-[12px]">{tt("服务加价：0")}</p>}
      <p className="text-[12px]">{!cost || cost.status !== "known" || cost.unknown_components.length ? tt("完整费用尚未确认，未提供价格的项目保持未知。") : tt("按实际资源用量和使用时间计费。")}</p>
      {cost?.billing_applied === null && <p className="text-[12px]">{tt("以上是资源价格基准；浏览器实际扣费状态尚未确认。")}</p>}
    </div>
  </div>;
}

function downloadSize(bytes: number | null, tt: UITranslate): string {
  if (bytes === null) return tt("大小未知");
  if (bytes < 1024) return tt("{size} 字节", { size: bytes });
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function saveDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(new Blob([blob], { type: "application/octet-stream" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.rel = "noopener";
  document.body.append(anchor);
  try { anchor.click(); }
  finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

function StepEditor({ step, index, count, defaultOrigin, disabled, change, move, remove, tt }: {
  step: BrowserFlowStep; index: number; count: number; defaultOrigin: string; disabled: boolean;
  change: (step: BrowserFlowStep) => void; move: (offset: number) => void; remove: () => void; tt: UITranslate;
}) {
  function changeAction(action: BrowserFlowAction) {
    const origin = step.page_origin || defaultOrigin;
    const next: BrowserFlowStep = { action, ...(origin ? { page_origin: origin } : {}) };
    if (action === "navigate") next.url = step.url || "";
    else {
      next.anchor = step.anchor || { label: "" };
      if (action === "fill" || action === "select") next.value = step.value || "";
      if (action === "press") next.key = step.key || "Enter";
    }
    change(next);
  }
  return <fieldset disabled={disabled} data-browser-flow-step={index} className="space-y-3 rounded-lg border border-neutral-200 p-3">
    <legend className="px-1 text-[13px] font-medium">{tt("步骤 {number}", { number: index + 1 })}</legend>
    <label className="block text-[12px] text-neutral-600">{tt("操作")}<select className={`${FIELD} mt-1`} value={step.action} disabled={disabled || step.action === "credential"} onChange={event => changeAction(event.target.value as BrowserFlowAction)}>
      {Object.entries(ACTION_LABELS).filter(([action]) => action !== "credential" || step.action === "credential").map(([action, label]) => <option key={action} value={action}>{tt(label)}</option>)}
    </select></label>
    {step.action === "navigate" ? <label className="block text-[12px] text-neutral-600">{tt("网页地址")}<input aria-label={tt("步骤 {number} 网页地址", { number: index + 1 })} type="url" className={`${FIELD} mt-1`} maxLength={4000} value={step.url || ""} onChange={event => change({ ...step, url: event.target.value })} placeholder="https://example.com/" /></label> : <><label className="block text-[12px] text-neutral-600">{tt("此步骤的网站范围")}<input data-browser-step-origin type="url" required className={`${FIELD} mt-1`} maxLength={4000} value={step.page_origin || ""} onChange={event => change({ ...step, page_origin: event.target.value })} placeholder="https://example.com" /></label><div className="grid gap-3 sm:grid-cols-2">{(Object.keys(ANCHOR_LABELS) as (keyof typeof ANCHOR_LABELS)[]).map(key => <label key={key} className="block text-[12px] text-neutral-600">{tt(ANCHOR_LABELS[key])}<input className={`${FIELD} mt-1`} maxLength={200} value={step.anchor?.[key] || ""} onChange={event => change({ ...step, anchor: { ...step.anchor, [key]: event.target.value } })} /></label>)}</div></>}
    {(step.action === "fill" || step.action === "select") && <label className="block text-[12px] text-neutral-600">{tt("普通文字（不填写密码或密钥）")}<input className={`${FIELD} mt-1`} maxLength={1000} autoComplete="off" value={step.value || ""} onChange={event => change({ ...step, value: event.target.value })} /></label>}
    {step.action === "press" && <label className="block text-[12px] text-neutral-600">{tt("按键")}<select className={`${FIELD} mt-1`} value={step.key || "Enter"} onChange={event => change({ ...step, key: event.target.value as BrowserFlowStep["key"] })}>{["Enter", "Tab", "Escape", "ArrowDown", "ArrowUp"].map(key => <option key={key}>{key}</option>)}</select></label>}
    {step.action === "credential" && <div className="space-y-1"><p className="text-[12px] text-neutral-500">{tt("这个步骤只保存密钥库引用。凭据由独立组件填写，流程不会显示密码。")}</p><label className="block text-[12px] text-neutral-600">{tt("密钥库引用")}<input data-browser-flow-vault-ref readOnly className={`${FIELD} mt-1 font-mono text-[12px]`} value={step.vault_ref || ""} /></label></div>}
    {step.action === "navigate" && step.page_origin && <p className="break-all text-[12px] text-neutral-500">{tt("页面范围：{origin}", { origin: step.page_origin })}</p>}
    <div className="flex flex-wrap gap-2"><button type="button" className={QUIET} disabled={disabled || index === 0} onClick={() => move(-1)}>{tt("上移")}</button><button type="button" className={QUIET} disabled={disabled || index === count - 1} onClick={() => move(1)}>{tt("下移")}</button><button type="button" className={QUIET} onClick={remove}>{tt("移除步骤")}</button></div>
  </fieldset>;
}

export function CloudBrowserFlowsSection({ onWatchSession }: { onWatchSession?: (session: BrowserFlowSession) => void | Promise<void> } = {}) {
  const tt = useUI();
  const [flows, setFlows] = useState<BrowserFlow[] | null>(null);
  const [sessions, setSessions] = useState<BrowserFlowSession[] | null>(null);
  const [capacity, setCapacity] = useState<BrowserParallelCapacity | null>(null);
  const [loadErrors, setLoadErrors] = useState<Record<string, unknown>>({});
  const [sessionSource, setSessionSource] = useState<"parallel" | "sessions">("parallel");
  const [selectedId, setSelectedId] = useState("");
  const [teachName, setTeachName] = useState("");
  const [recording, setRecording] = useState<{ session_id: string; recording_id: string } | null>(null);
  const [editor, setEditor] = useState<{ flow: BrowserFlow | null; input: BrowserFlowInput } | null>(null);
  const [deleteArmed, setDeleteArmed] = useState("");
  const [runs, setRuns] = useState<Record<string, BrowserFlowRun>>({});
  const [receipts, setReceipts] = useState<Record<string, BrowserFlowRunReceipt>>({});
  const [receiptErrors, setReceiptErrors] = useState<Record<string, unknown>>({});
  const [receiptPending, setReceiptPending] = useState<Record<string, boolean>>({});
  const [receiptRefresh, setReceiptRefresh] = useState(0);
  const [watched, setWatched] = useState<BrowserFlowSession | null>(null);
  const [downloadsSession, setDownloadsSession] = useState<BrowserFlowSession | null>(null);
  const [downloads, setDownloads] = useState<BrowserSessionDownloads | null>(null);
  const [librarySaves, setLibrarySaves] = useState<Record<string, BrowserLibraryDownload>>({});
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const lifetime = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const flowRevision = useRef(0);
  const receiptWaitStarted = useRef<Record<string, number>>({});

  const refresh = useCallback(async (signal: AbortSignal) => {
    const revision = flowRevision.current;
    const [flowResult, sessionResult, capacityResult] = await Promise.allSettled([
      cloudBrowserFlowsApi.flows(signal), cloudBrowserFlowsApi.sessions(signal), cloudBrowserFlowsApi.capacity(signal),
    ]);
    if (signal.aborted) return;
    const errors: Record<string, unknown> = {};
    if (flowResult.status === "fulfilled") { if (revision === flowRevision.current) setFlows(flowResult.value); }
    else errors.flows = flowResult.reason;
    if (sessionResult.status === "fulfilled") {
      setSessions(sessionResult.value.items); setSessionSource(sessionResult.value.source);
      if (sessionResult.value.warning) errors.parallel = sessionResult.value.warning;
    } else { setSessions(null); errors.sessions = sessionResult.reason; }
    if (capacityResult.status === "fulfilled") setCapacity(capacityResult.value);
    else { setCapacity(null); errors.capacity = capacityResult.reason; }
    setLoadErrors(errors);
  }, []);

  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await refresh(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(poll, 15000);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); lifetime.current = null; };
  }, [refresh]);

  useEffect(() => {
    let waiting = Object.entries(runs).filter(([, run]) => run.run_id && !browserFlowRunCompleted(run) && run.status !== "failed");
    if (!waiting.length) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      const next: typeof waiting = [];
      await Promise.allSettled(waiting.map(async ([flowId, run]) => {
        receiptWaitStarted.current[run.run_id] ??= Date.now();
        setReceiptPending(current => ({ ...current, [flowId]: true }));
        try {
          const receipt = await cloudBrowserFlowsApi.runReceipt(flowId, run.session_id, run.run_id, controller.signal);
          if (controller.signal.aborted) return;
          setReceipts(current => ({ ...current, [flowId]: receipt }));
          setReceiptErrors(current => { const updated = { ...current }; delete updated[flowId]; return updated; });
          if (receipt.status === "completed" || receipt.status === "failed") setRuns(current => current[flowId]?.run_id !== run.run_id ? current : ({ ...current, [flowId]: { ...run, status: receipt.status, completed_steps: receipt.next_step, total_steps: receipt.total_steps, code: receipt.code } }));
          if (receipt.status === "awaiting_approval" && Date.now() - receiptWaitStarted.current[run.run_id] < 10 * 60 * 1000) next.push([flowId, run]);
        } catch (error) { if (!controller.signal.aborted) setReceiptErrors(current => ({ ...current, [flowId]: error })); }
        finally { if (!controller.signal.aborted) setReceiptPending(current => ({ ...current, [flowId]: false })); }
      }));
      waiting = next;
      if (!controller.signal.aborted && waiting.length) timer = setTimeout(poll, 3000);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [runs, receiptRefresh]);

  async function execute(key: string, action: (signal: AbortSignal) => Promise<void>) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || busyRef.current) return;
    busyRef.current = true; setBusy(key); setActionError(null); setNotice("");
    try { await action(signal); }
    catch (error) { if (!signal.aborted) setActionError(error); }
    finally { busyRef.current = false; if (!signal.aborted) setBusy(""); }
  }

  function acceptFlow(flow: BrowserFlow) { flowRevision.current += 1; setFlows(current => [flow, ...(current || []).filter(item => item.id !== flow.id)]); }
  function clearRun(flowId: string) {
    setRuns(current => { const next = { ...current }; delete next[flowId]; return next; });
    setReceipts(current => { const next = { ...current }; delete next[flowId]; return next; });
    setReceiptErrors(current => { const next = { ...current }; delete next[flowId]; return next; });
    setReceiptPending(current => { const next = { ...current }; delete next[flowId]; return next; });
  }
  function editFlow(flow: BrowserFlow) {
    setEditor({ flow, input: { name: flow.name, notes: flow.notes, site_origin: flow.site_origin, steps: flow.steps.map(step => ({ ...step, ...(step.anchor ? { anchor: { ...step.anchor } } : {}) })) } });
    setActionError(null); setNotice("");
  }
  const selected = sessions?.find(session => session.id === selectedId);
  const teachingSessionId = recording?.session_id || selectedId;
  const activeRecordingSession = sessions?.find(session => session.id === recording?.session_id);
  function selectSession(id: string) {
    setSelectedId(id);
    if (downloadsSession?.id !== id) { setDownloadsSession(null); setDownloads(null); }
  }
  function watch(session: BrowserFlowSession) {
    if (!session.can_watch) return;
    selectSession(session.id);
    if (!onWatchSession) { setWatched(session); return; }
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted) return;
    try { void Promise.resolve(onWatchSession(session)).catch(error => { if (!signal.aborted) setActionError(error); }); }
    catch (error) { if (!signal.aborted) setActionError(error); }
  }
  function showDownloads(session: BrowserFlowSession) {
    void execute("downloads-list", async signal => {
      setSelectedId(session.id); setDownloadsSession(session); setDownloads(null);
      const result = await cloudBrowserFlowsApi.downloads(session.id, signal);
      if (!signal.aborted) setDownloads(result);
    });
  }
  function downloadFile(file: BrowserSessionDownload) {
    const list = downloads;
    if (!list) return;
    void execute(`download-${file.id}`, async signal => {
      const blob = await cloudBrowserFlowsApi.download(list.session_id, file, list.limits.max_file_bytes, signal);
      if (!signal.aborted) { saveDownload(blob, file.filename); setNotice(tt("下载请求已交给浏览器。")); }
    });
  }
  function saveToLibrary(file: BrowserSessionDownload) {
    const list = downloads;
    if (!list || librarySaves[JSON.stringify([list.session_id, file.id])]) return;
    void execute(`library-${file.id}`, async signal => {
      const saved = await cloudBrowserFlowsApi.saveToLibrary(list.session_id, file, signal);
      if (!signal.aborted) {
        setLibrarySaves(current => ({ ...current, [JSON.stringify([list.session_id, file.id])]: saved }));
        setNotice(tt("已保存到我的库。"));
      }
    });
  }
  function continueFlow(flow: BrowserFlow, receipt: BrowserFlowRunReceipt) {
    if (receipt.status !== "ready" || receipt.flow_id !== flow.id || receipt.flow_version !== flow.version) return;
    void execute(`continue-${flow.id}`, async signal => {
      setReceipts(current => { const next = { ...current }; delete next[flow.id]; return next; });
      setReceiptErrors(current => { const next = { ...current }; delete next[flow.id]; return next; });
      const result = await cloudBrowserFlowsApi.run(flow.id, { id: receipt.session_id, session_version: receipt.session_version, incarnation: receipt.incarnation }, signal, receipt.id);
      if (!signal.aborted) setRuns(current => ({ ...current, [flow.id]: result }));
    });
  }

  return <div data-cloud-browser-flows-section className="space-y-4">
    <section className={CARD} aria-labelledby="browser-parallel-heading" data-browser-parallel>
      <div className="flex items-start justify-between gap-3"><div><h3 id="browser-parallel-heading" className={CARD_TITLE}>{tt("并行浏览器")}</h3><p className={CARD_DESC}>{tt("不同任务可以同时使用各自的浏览器。选择一个任务观看或演示流程。")}</p></div><button data-browser-flows-refresh type="button" className={QUIET} disabled={Boolean(busy)} onClick={() => void execute("refresh", refresh)}>{tt("刷新状态")}</button></div>
      <div className="mt-4"><Capacity value={capacity} tt={tt} /></div>
      {loadErrors.capacity ? <div className="mt-3"><Note kind="error" text={tt("没有读到当前容量和费用，暂时显示未知。")}/></div> : null}
      {loadErrors.sessions ? <div className="mt-3"><Note kind="error" text={errorCopy(loadErrors.sessions, tt)} /></div> : null}
      {sessionSource === "sessions" && <p role="status" className={`${CARD_DESC} mt-3`}>{tt("并行概览暂不可用，下面显示你的浏览器记录；当前并行数量仍以容量信息为准。")}</p>}
      {sessions === null && !loadErrors.sessions ? <p role="status" className={`${CARD_DESC} mt-3`}>{tt("正在读取浏览器任务…")}</p> : null}
      {sessions?.length === 0 && <p className={`${CARD_DESC} mt-3`}>{tt("还没有浏览器任务。先在任务中打开云端浏览器，再来演示流程。")}</p>}
      <ul className="mt-3 divide-y divide-neutral-100">{sessions?.map(session => <li key={session.id} data-browser-parallel-session={session.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-[13px] font-medium text-neutral-900">{sessionLabel(session, tt)}</p><p className={CARD_DESC}>{tt(SESSION_LABELS[session.status] || "状态未知")}{session.sensitive_active ? ` · ${tt("正在处理敏感输入")}` : ""}</p></div><div className="flex flex-wrap gap-2"><button data-browser-session-watch={session.id} type="button" className={QUIET} disabled={!session.can_watch} onClick={() => watch(session)}>{tt("观看")}</button><button data-browser-downloads-open={session.id} type="button" className={QUIET} disabled={Boolean(busy)} aria-expanded={downloadsSession?.id === session.id} onClick={() => showDownloads(session)}>{tt("下载的文件")}</button></div></li>)}</ul>
      {downloadsSession && <div data-browser-session-downloads={downloadsSession.id} className="mt-3 space-y-3 rounded-lg border border-neutral-200 p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-[13px] font-medium text-neutral-900">{tt("下载的文件")}</h4><p className={CARD_DESC}>{sessionLabel(downloadsSession, tt)}</p></div><div className="flex gap-2"><button data-browser-downloads-refresh type="button" className={QUIET} disabled={Boolean(busy)} onClick={() => showDownloads(downloadsSession)}>{tt("刷新文件")}</button><button type="button" className={QUIET} disabled={Boolean(busy)} onClick={() => { setDownloadsSession(null); setDownloads(null); }}>{tt("收起文件")}</button></div></div>{downloads === null ? <p role="status" className={CARD_DESC}>{busy === "downloads-list" ? tt("正在读取这个浏览器的文件…") : tt("文件列表没有读取成功，请刷新文件后重试。")}</p> : <>{downloads.items.length === 0 && <p className={CARD_DESC}>{tt("这个浏览器还没有下载文件。")}</p>}<ul className="divide-y divide-neutral-100">{downloads.items.map(file => {
        const saved = librarySaves[JSON.stringify([downloads.session_id, file.id])];
        return <li data-browser-download={file.id} key={file.id} className="flex flex-wrap items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="break-all text-[13px] text-neutral-900">{file.filename}</p><p className={CARD_DESC}>{downloadSize(file.size_bytes, tt)}{" · "}{tt({ pending: "准备中", ready: "可下载", blocked: "下载被阻止", failed: "下载失败" }[file.status])}</p>{saved && <p data-browser-download-library-saved className={CARD_DESC}>{tt("库中的文件：{name}", { name: saved.name })}</p>}</div><div className="flex flex-wrap gap-2"><button data-browser-download-file={file.id} type="button" className={QUIET} disabled={Boolean(busy) || file.status !== "ready"} onClick={() => downloadFile(file)}>{tt("下载文件")}</button><button data-browser-download-library={file.id} type="button" className={QUIET} disabled={Boolean(busy) || file.status !== "ready" || Boolean(saved)} onClick={() => saveToLibrary(file)}>{tt(saved ? "已保存到我的库" : "保存到我的库")}</button></div></li>;
      })}</ul>{downloads.limits.max_file_bytes !== null && <p className={CARD_DESC}>{tt("单个文件上限：{size}", { size: downloadSize(downloads.limits.max_file_bytes, tt) })}</p>}<p className={CARD_DESC}>{tt("文件仅通过当前账号的私有连接获取。")}</p></>}</div>}
    </section>

    <section className={CARD} aria-labelledby="browser-teaching-heading" data-browser-teaching>
      <h3 id="browser-teaching-heading" className={CARD_TITLE}>{tt("教一次，以后重复执行")}</h3>
      <p className={CARD_DESC}>{tt("选一个正在运行的浏览器，开始教学后打开它，接管并演示操作，最后停止并保存。密码和密钥只保存密钥库引用。")}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="block text-[12px] text-neutral-600">{tt("浏览器任务")}<select data-browser-teach-session className={`${FIELD} mt-1`} disabled={Boolean(busy)} value={selectedId} onChange={event => selectSession(event.target.value)}><option value="">{tt("选择浏览器任务")}</option>{sessions?.map(session => <option key={session.id} value={session.id}>{sessionLabel(session, tt)} · {tt(SESSION_LABELS[session.status] || "状态未知")}</option>)}</select></label><label className="block text-[12px] text-neutral-600">{tt("流程名称")}<input data-browser-teach-name className={`${FIELD} mt-1`} maxLength={160} disabled={Boolean(busy)} value={teachName} onChange={event => setTeachName(event.target.value)} placeholder={tt("例如：每周下载报表")} /></label></div>
      {recording && <p data-browser-teaching-status role="status" className="mt-3 text-[13px] text-emerald-700">{tt("正在教学：{name}", { name: activeRecordingSession ? sessionLabel(activeRecordingSession, tt) : recording.session_id.slice(-8) })}</p>}
      {selected && !canTeach(selected) && <p className={`${CARD_DESC} mt-3`}>{tt("请先打开或恢复这个浏览器，等它运行后再开始教学。")}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button data-browser-teach-start type="button" className={PRIMARY} disabled={Boolean(busy) || Boolean(recording) || !canTeach(selected) || !teachName.trim()} onClick={() => selected && void execute("teach-start", async signal => { const result = await cloudBrowserFlowsApi.startTeaching(selected.id, teachName, signal); if (!signal.aborted) { setRecording(result); setNotice(tt("教学已开始。打开浏览器并演示，完成后停止并保存。")); } })}>{tt("开始教学")}</button>
        <button data-browser-teach-watch type="button" className={QUIET} disabled={!selected?.can_watch} onClick={() => selected && watch(selected)}>{tt("打开浏览器演示")}</button>
        <button data-browser-teach-save type="button" className={QUIET} disabled={Boolean(busy) || !teachingSessionId} onClick={() => void execute("teach-save", async signal => { const flow = await cloudBrowserFlowsApi.stopTeaching(teachingSessionId, teachName, true, signal); if (!signal.aborted && flow) { acceptFlow(flow); setRecording(null); setNotice(tt("教学已停止，流程已保存。")); } })}>{tt("停止并保存")}</button>
        {recording && <button data-browser-teach-discard type="button" className={QUIET} disabled={Boolean(busy)} onClick={() => void execute("teach-discard", async signal => { await cloudBrowserFlowsApi.stopTeaching(recording.session_id, teachName, false, signal); if (!signal.aborted) { setRecording(null); setNotice(tt("本次教学已放弃。")); } })}>{tt("放弃本次教学")}</button>}
      </div>
    </section>

    {actionError ? <div data-browser-flow-error data-browser-flow-error-code={actionError instanceof BrowserFlowsApiError ? actionError.code : "UNKNOWN"}><Note kind="error" text={errorCopy(actionError, tt)} /></div> : null}
    {busy ? <p role="status" className="text-[13px] text-neutral-500">{tt("正在处理…")}</p> : notice ? <Note kind="ok" text={notice} /> : null}

    <section className={CARD} aria-labelledby="browser-flows-heading" data-browser-saved-flows>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="browser-flows-heading" className={CARD_TITLE}>{tt("已保存的流程与网站笔记")}</h3><p className={CARD_DESC}>{tt("你可以修改名称、步骤和网站笔记，也可以删除。新运行从第一步开始；确认操作后，可以从服务器保存的位置继续。")}</p></div><button data-browser-flow-new type="button" className={QUIET} disabled={Boolean(busy)} onClick={() => { setEditor({ flow: null, input: { name: "", notes: "", site_origin: "", steps: [] } }); setActionError(null); }}>{tt("新建流程")}</button></div>
      {loadErrors.flows ? <div className="mt-3"><Note kind="error" text={tt("流程和网站笔记没有刷新成功。已显示的内容可能不是最新版本，请刷新后再试。")}/></div> : null}
      {flows === null && !loadErrors.flows ? <p role="status" className={`${CARD_DESC} mt-3`}>{tt("正在读取流程和网站笔记…")}</p> : null}
      {flows?.length === 0 && <p className={`${CARD_DESC} mt-3`}>{tt("还没有保存的流程。完成一次教学后，它会出现在这里。")}</p>}
      <ul className="mt-3 space-y-3">{flows?.map(flow => <li key={flow.id} data-browser-flow={flow.id} className="space-y-3 rounded-lg border border-neutral-200 p-3"><div><p className="break-words text-[13px] font-medium text-neutral-900">{flow.name}</p><p className={CARD_DESC}>{flow.site_origin || tt("未限定网站")}{" · "}{tt("{count} 个步骤", { count: flow.steps.length })}</p></div><div data-browser-flow-notes><p className="text-[12px] font-medium text-neutral-600">{tt("网站笔记")}</p><p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-neutral-500">{flow.notes || tt("暂无网站笔记")}</p></div><div className="flex flex-wrap gap-2">
        <button data-browser-flow-edit type="button" className={QUIET} disabled={Boolean(busy)} onClick={() => editFlow(flow)}>{tt("编辑流程")}</button>
        <button data-browser-flow-run type="button" className={QUIET} disabled={Boolean(busy) || !canTeach(selected) || !flow.steps.length || Boolean(recording)} onClick={() => selected && void execute(`run-${flow.id}`, async signal => { clearRun(flow.id); const result = await cloudBrowserFlowsApi.run(flow.id, selected, signal); if (!signal.aborted) setRuns(current => ({ ...current, [flow.id]: result })); })}>{tt(runs[flow.id] ? "重新运行（从第一步）" : "在所选浏览器运行")}</button>
        {flow.notes && <button data-browser-flow-clear-notes type="button" className={QUIET} disabled={Boolean(busy)} onClick={() => void execute(`notes-${flow.id}`, async signal => { const updated = await cloudBrowserFlowsApi.update(flow, { name: flow.name, notes: "", site_origin: flow.site_origin, steps: flow.steps }, signal); if (!signal.aborted) { acceptFlow(updated); setNotice(tt("网站笔记已清除。")); } })}>{tt("清除网站笔记")}</button>}
        <button data-browser-flow-delete type="button" className={`${QUIET} text-red-700`} disabled={Boolean(busy)} onClick={() => { if (deleteArmed !== flow.id) { setDeleteArmed(flow.id); return; } void execute(`delete-${flow.id}`, async signal => { await cloudBrowserFlowsApi.remove(flow.id, signal); if (!signal.aborted) { flowRevision.current += 1; clearRun(flow.id); setFlows(current => current?.filter(item => item.id !== flow.id) || []); if (editor?.flow?.id === flow.id) setEditor(null); setDeleteArmed(""); setNotice(tt("流程及其网站笔记已删除。")); } }); }}>{tt(deleteArmed === flow.id ? "确认删除" : "删除流程")}</button>
        {deleteArmed === flow.id && <button type="button" className={QUIET} disabled={Boolean(busy)} onClick={() => setDeleteArmed("")}>{tt("取消")}</button>}
      </div>{runs[flow.id] && <><RunOutcome run={runs[flow.id]} receipt={receipts[flow.id]} browserName={sessions?.find(session => session.id === runs[flow.id].session_id)?.title || runs[flow.id].session_id.slice(-8)} tt={tt} /><div data-browser-flow-receipt-status={receipts[flow.id]?.status || "unknown"} className="flex flex-wrap gap-2">{!browserFlowRunCompleted(runs[flow.id]) && runs[flow.id].status !== "failed" && <button data-browser-flow-receipt-refresh type="button" className={QUIET} disabled={Boolean(busy) || receiptPending[flow.id]} onClick={() => setReceiptRefresh(value => value + 1)}>{tt(receiptPending[flow.id] ? "正在检查…" : "检查执行状态")}</button>}{receipts[flow.id]?.status === "ready" && <button data-browser-flow-continue type="button" className={PRIMARY} disabled={Boolean(busy) || Boolean(recording) || flow.version !== receipts[flow.id].flow_version} onClick={() => continueFlow(flow, receipts[flow.id])}>{tt("继续流程")}</button>}</div>{receiptErrors[flow.id] ? <Note kind="error" text={errorCopy(receiptErrors[flow.id], tt)} /> : null}{receipts[flow.id]?.status === "ready" && flow.version !== receipts[flow.id].flow_version && <p className={CARD_DESC}>{tt("流程已修改，这次记录无法继续。")}</p>}</>}</li>)}</ul>
      {!selectedId && Boolean(flows?.length) && <p className={`${CARD_DESC} mt-3`}>{tt("先在上方选择正在运行的浏览器，再运行流程。")}</p>}
    </section>

    {editor && <form data-browser-flow-editor className={`${CARD} space-y-4`} onSubmit={event => { event.preventDefault(); const draft = editor; void execute("save-flow", async signal => { const saved = draft.flow ? await cloudBrowserFlowsApi.update(draft.flow, draft.input, signal) : await cloudBrowserFlowsApi.create(draft.input, signal); if (!signal.aborted) { acceptFlow(saved); setEditor(null); setNotice(tt("流程及网站笔记已保存。")); } }); }}>
      <h3 className={CARD_TITLE}>{tt(editor.flow ? "编辑流程" : "新建流程")}</h3>
      <label className="block text-[12px] text-neutral-600">{tt("流程名称")}<input data-browser-flow-name className={`${FIELD} mt-1`} disabled={Boolean(busy)} maxLength={160} required value={editor.input.name} onChange={event => setEditor({ ...editor, input: { ...editor.input, name: event.target.value } })} /></label>
      <label className="block text-[12px] text-neutral-600">{tt("网站范围")}<input data-browser-flow-origin className={`${FIELD} mt-1`} type="url" disabled={Boolean(busy)} maxLength={4000} value={editor.input.site_origin || ""} placeholder="https://example.com" onChange={event => setEditor({ ...editor, input: { ...editor.input, site_origin: event.target.value } })} /></label>
      <label className="block text-[12px] text-neutral-600">{tt("网站笔记")}<textarea data-browser-flow-notes-editor className={`${FIELD} mt-1`} disabled={Boolean(busy)} maxLength={4000} rows={3} value={editor.input.notes} onChange={event => setEditor({ ...editor, input: { ...editor.input, notes: event.target.value } })} /></label>
      <p className={CARD_DESC}>{tt("页面元素通过名称、标签或页面标记定位。密钥库引用会保留；这里不支持脚本。")}</p>
      {editor.input.steps.map((step, index) => <StepEditor key={index} step={step} index={index} count={editor.input.steps.length} defaultOrigin={editor.input.site_origin || ""} disabled={Boolean(busy)} tt={tt} change={step => setEditor({ ...editor, input: { ...editor.input, steps: editor.input.steps.map((current, at) => at === index ? step : current) } })} remove={() => setEditor({ ...editor, input: { ...editor.input, steps: editor.input.steps.filter((_, at) => at !== index) } })} move={offset => { const steps = [...editor.input.steps]; [steps[index], steps[index + offset]] = [steps[index + offset], steps[index]]; setEditor({ ...editor, input: { ...editor.input, steps } }); }} />)}
      <div className="flex flex-wrap gap-2"><button data-browser-flow-add-step type="button" className={QUIET} disabled={Boolean(busy) || editor.input.steps.length >= 100} onClick={() => setEditor({ ...editor, input: { ...editor.input, steps: [...editor.input.steps, { action: "navigate", url: "" }] } })}>{tt("添加步骤")}</button><button data-browser-flow-save type="submit" className={PRIMARY} disabled={Boolean(busy)}>{tt("保存流程")}</button><button type="button" className={QUIET} disabled={Boolean(busy)} onClick={() => setEditor(null)}>{tt("取消编辑")}</button></div>
    </form>}

    {watched && <section data-browser-flow-watch={watched.id} className={`${CARD} space-y-3`}><div className="flex items-start justify-between gap-3"><div><h3 className={CARD_TITLE}>{tt("观看浏览器")}</h3><p className={CARD_DESC}>{sessionLabel(watched, tt)}</p>{!watched.task_id && <p className={CARD_DESC}>{tt("如果显示浏览器记录，请选择此会话后打开。")}</p>}</div><button type="button" className={QUIET} onClick={() => setWatched(null)}>{tt("收起观看")}</button></div><div style={{ height: 560, minHeight: 360 }} className="overflow-hidden rounded-lg border border-neutral-200"><CloudBrowserPanel key={watched.id} taskId={watched.task_id} initialSessionId={watched.id} /></div></section>}
  </div>;
}
