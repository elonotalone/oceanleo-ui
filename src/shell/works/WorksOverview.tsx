"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Modal } from "../../ui";
import { useUI } from "../../i18n/ui/useUI";
import { cloudComputerApi, type CloudComputerClient, type Computer } from "../../lib/cloud-computer-api";
import { startLocalAction } from "../local-task-client";
import { deviceSettingsClient, type DeviceSettingsClient } from "../../api/device-settings";
import { DeviceFolderPicker } from "../../pages/devices/DeviceFolderPicker";
import { computerDisplayState } from "../cloud-computer/computer-state";
import { webViewerFrameSandbox } from "../editor-sandbox-origin";
import { WorksApiError, worksApi, type WorksApi } from "../../lib/works-api";
import {
  type MoveToServerInput,
  workDraftForPath,
  workKindLabel,
  workLocationLabel,
  workStatusLabel,
  type Work,
  type WorkKind,
  type WorkPreviewResult,
  type WorkServerInput,
} from "./model";

const PRIMARY = "inline-flex min-h-9 items-center justify-center rounded-lg bg-stone-900 px-3 text-[12px] font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-45";
const QUIET = "inline-flex min-h-9 items-center justify-center rounded-lg border border-stone-200 bg-white px-3 text-[12px] font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-45";
const FIELD = "mt-1 block min-h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-[13px] text-stone-800 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200";

type AddStep = "choose" | "details";
type MoveStep = "choose" | "details";

function formatUpdatedAt(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "时间未知";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
  } catch {
    return value;
  }
}

function previewResultLabel(result: WorkPreviewResult | undefined, tt: ReturnType<typeof useUI>): string {
  if (!result) return "";
  if (result.status === "starting") return `${tt("正在启动")}${result.stage ? ` · ${result.stage}` : ""}`;
  if (result.status === "failed") return result.reason ? `${tt("出错")} · ${result.reason}` : tt("出错");
  return tt("运行中");
}

function isPreviewUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".oceanleo.app");
  } catch {
    return false;
  }
}

function computerCanBrowse(computer: Computer): boolean {
  return computerDisplayState(computer) === "ready";
}

function computerOfflineReason(computer: Computer, tt: ReturnType<typeof useUI>): string {
  const state = computerDisplayState(computer);
  if (state === "stopped") return tt("服务器已停机，无法浏览文件夹。");
  if (state === "pending_install" || state === "pending_confirm" || state === "provisioning") return tt("服务器还在接入，暂时无法浏览文件夹。");
  return tt("服务器离线，无法浏览文件夹。");
}

function cloudArtifactId(work: Work): string {
  if (work.home.type !== "cloud") return "";
  if (work.home.artifact_id) return work.home.artifact_id;
  return work.id.startsWith("cloud-artifact:") ? work.id.slice("cloud-artifact:".length) : "";
}

function workActionError(caught: unknown, action: "move" | "save", tt: ReturnType<typeof useUI>): string {
  const value = caught && typeof caught === "object" ? caught as { code?: unknown; detailMessage?: unknown; message?: unknown } : null;
  const code = caught instanceof WorksApiError ? caught.code : typeof value?.code === "string" ? value.code : "";
  const detailMessage = caught instanceof WorksApiError ? caught.detailMessage : typeof value?.detailMessage === "string" ? value.detailMessage : "";
  if (code) {
    if (action === "move" && code === "destination_not_empty") {
      return tt("目标文件夹已有内容，请选择新文件夹或空文件夹。");
    }
    if (action === "save" && (code === "source_too_large" || code === "too_many_files")) {
      return tt("存回云端失败：云端上限为 50 MiB、1000 个文件。");
    }
    if (detailMessage) return detailMessage;
  }
  if (typeof value?.message === "string" && value.message.trim()) return value.message;
  return tt("操作未完成，请重试。");
}

function WorkPreview({ work, result, tt }: { work: Work; result?: WorkPreviewResult; tt: ReturnType<typeof useUI> }) {
  const url = isPreviewUrl(result?.url || work.preview.url) ? result?.url || work.preview.url : "";
  if (!url) return null;
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-stone-100" data-work-preview={work.id}>
      <iframe
        src={url}
        title={work.title}
        className="h-[min(48vw,420px)] min-h-[260px] w-full border-0 bg-white"
        sandbox={webViewerFrameSandbox(false)}
        referrerPolicy="no-referrer"
      />
      <p className="border-t border-stone-200 bg-white px-3 py-2 text-[11px] text-stone-500">{tt("预览内容运行在隔离的用户内容域中。")}</p>
    </div>
  );
}

function WorkCard({
  work,
  result,
  busy,
  removeArmed,
  onPreview,
  onStop,
  onRemove,
  onOpenFolder,
  onMoveToServer,
  onSaveToCloud,
  tt,
}: {
  work: Work;
  result?: WorkPreviewResult;
  busy: boolean;
  removeArmed: boolean;
  onPreview: () => void;
  onStop: () => void;
  onRemove: () => void;
  onOpenFolder: () => void;
  onMoveToServer?: () => void;
  onSaveToCloud?: () => void;
  tt: ReturnType<typeof useUI>;
}) {
  const previewState = result?.status || (work.status === "running" ? "ready" : undefined);
  const starting = previewState === "starting";
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm" data-work-card={work.id} data-work-status={result?.status || work.status}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-semibold text-stone-900">{work.title}</h3>
          <p className="mt-1 text-[12px] text-stone-500">{tt(workKindLabel(work.kind))} · {tt(workLocationLabel(work))}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] ${starting ? "bg-amber-50 text-amber-700" : previewState === "failed" || work.status === "error" ? "bg-rose-50 text-rose-700" : "bg-stone-100 text-stone-600"}`} data-work-status-label>
          {result ? previewResultLabel(result, tt) : tt(workStatusLabel(work.status))}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-[11px] text-stone-500 sm:grid-cols-2">
        <div><dt className="font-medium text-stone-400">{tt("更新时间")}</dt><dd className="mt-0.5">{formatUpdatedAt(work.updated_at)}</dd></div>
        <div><dt className="font-medium text-stone-400">{tt("链接")}</dt><dd className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1">{work.links.length ? work.links.map((link) => <a key={`${link.label}:${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{link.label}</a>) : "—"}</dd></div>
      </dl>
      {starting && <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800" data-work-preview-stage>{previewResultLabel(result, tt)}</p>}
      {result?.status === "failed" && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-800">{previewResultLabel(result, tt)}</p>}
      <WorkPreview work={work} result={result} tt={tt} />
      <div className="mt-4 flex flex-wrap gap-2">
        {starting || previewState === "ready" ? <button type="button" className={QUIET} disabled={busy} onClick={onStop}>{tt("停止预览")}</button> : <button type="button" className={PRIMARY} disabled={busy || !work.preview.available} onClick={onPreview}>{tt("启动预览")}</button>}
        {work.home.type === "server" && <button type="button" className={QUIET} disabled={busy} onClick={onOpenFolder}>{tt("在服务器上打开文件夹")}</button>}
        {onMoveToServer && <button type="button" className={QUIET} disabled={busy} onClick={onMoveToServer}>{tt("搬到我的服务器")}</button>}
        {onSaveToCloud && <button type="button" className={QUIET} disabled={busy} onClick={onSaveToCloud}>{tt("存回云端")}</button>}
        <button type="button" className={`${QUIET} ${removeArmed ? "border-rose-300 text-rose-700" : ""}`} disabled={busy} onClick={onRemove}>{tt(removeArmed ? "再次点击确认移除" : "移除作品")}</button>
      </div>
    </article>
  );
}

export interface WorksOverviewProps {
  api?: WorksApi;
  computerClient?: CloudComputerClient;
  settingsClient?: DeviceSettingsClient;
  className?: string;
  onClose?: () => void;
}

export function WorksOverview({ api = worksApi, computerClient = cloudComputerApi, settingsClient = deviceSettingsClient, className = "", onClose }: WorksOverviewProps) {
  const tt = useUI();
  const [works, setWorks] = useState<Work[]>([]);
  const [computers, setComputers] = useState<Computer[]>([]);
  const [previewResults, setPreviewResults] = useState<Record<string, WorkPreviewResult>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [removeArmed, setRemoveArmed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unsupported, setUnsupported] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [movePickerOpen, setMovePickerOpen] = useState(false);
  const [addStep, setAddStep] = useState<AddStep>("choose");
  const [moveStep, setMoveStep] = useState<MoveStep>("choose");
  const [selectedComputer, setSelectedComputer] = useState<Computer | null>(null);
  const [moveWork, setMoveWork] = useState<Work | null>(null);
  const [moveComputer, setMoveComputer] = useState<Computer | null>(null);
  const [path, setPath] = useState("");
  const [movePath, setMovePath] = useState("");
  const [draft, setDraft] = useState<WorkServerInput>({ computer_id: "", path: "", kind: "website", start_command: "npm run dev", port: 3000 });
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [worksResult, computersResult] = await Promise.allSettled([api.list(), computerClient.listComputers()]);
    if (!mounted.current) return;
    if (worksResult.status === "fulfilled") {
      setUnsupported(false);
      setWorks(worksResult.value);
    } else {
      const cause = worksResult.reason;
      if (cause instanceof WorksApiError && cause.unsupported) setUnsupported(true);
      else setError(tt("暂时无法加载作品。"));
    }
    if (computersResult.status === "fulfilled") setComputers(computersResult.value.items || []);
    setLoading(false);
  }, [api, computerClient, tt]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    };
  }, [load]);

  const readyComputers = useMemo(() => computers.filter((computer) => computer.source === "byo" || computer.source === "aliyun"), [computers]);

  const refreshPreview = useCallback(async (work: Work) => {
    const next = await api.preview(work.id);
    if (!mounted.current) return;
    setPreviewResults((current) => ({ ...current, [work.id]: next }));
    if (next.status === "ready") {
      setWorks((current) => current.map((item) => item.id === work.id ? { ...item, status: "running", preview: { ...item.preview, available: true, ...(isPreviewUrl(next.url) ? { url: next.url } : {}) } } : item));
      return;
    }
    if (next.status === "starting") {
      const oldTimer = timers.current.get(work.id);
      if (oldTimer) clearTimeout(oldTimer);
      const timer = setTimeout(() => { void refreshPreview(work).catch(() => { /* card keeps its last starting state */ }); }, 1500);
      timers.current.set(work.id, timer);
    }
  }, [api]);

  async function runWorkAction(id: string, action: () => Promise<void>) {
    setBusy((current) => ({ ...current, [id]: true }));
    setError("");
    try { await action(); } catch { if (mounted.current) setError(tt("操作未完成，请重试。")); }
    finally { if (mounted.current) setBusy((current) => ({ ...current, [id]: false })); }
  }

  function openAdd() {
    setAddOpen(true);
    setAddStep("choose");
    setSelectedComputer(null);
    setPath("");
    setDraft({ computer_id: "", path: "", kind: "website", start_command: "npm run dev", port: 3000 });
  }

  function openMove(work: Work) {
    if (!api.moveToServer || !cloudArtifactId(work)) return;
    setMoveWork(work);
    setMoveStep("choose");
    setMoveComputer(null);
    setMovePath("");
  }

  function chooseComputer(computer: Computer) {
    if (!computerCanBrowse(computer)) return;
    setSelectedComputer(computer);
    setDraft((current) => ({ ...current, computer_id: computer.id }));
    setAddStep("details");
  }

  function choosePath(nextPath: string) {
    const defaults = workDraftForPath(nextPath);
    setPath(nextPath);
    setDraft((current) => ({ ...current, path: nextPath, ...defaults }));
    setPickerOpen(false);
  }

  function chooseMoveComputer(computer: Computer) {
    if (!computerCanBrowse(computer)) return;
    setMoveComputer(computer);
    setMoveStep("details");
  }

  function chooseMovePath(nextPath: string) {
    setMovePath(nextPath);
    setMovePickerOpen(false);
  }

  async function submitServerWork(event: FormEvent) {
    event.preventDefault();
    if (!draft.computer_id || !draft.path.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      const created = await api.createServer({ ...draft, path: draft.path.trim(), title: draft.title?.trim() || undefined, start_command: draft.start_command?.trim() || undefined, port: Number.isFinite(draft.port) && draft.port ? Number(draft.port) : undefined });
      if (!mounted.current) return;
      setWorks((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      setAddOpen(false);
      setNotice(tt("作品已添加。"));
    } catch {
      if (mounted.current) setError(tt("作品添加失败，请重试。"));
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  async function submitMove(event: FormEvent) {
    event.preventDefault();
    if (!moveWork || !moveComputer || !movePath.trim() || !api.moveToServer || moving) return;
    const input: MoveToServerInput = {
      artifact_id: cloudArtifactId(moveWork),
      computer_id: moveComputer.id,
      path: movePath.trim(),
      title: moveWork.title,
    };
    setMoving(true);
    setError("");
    try {
      const moved = await api.moveToServer(input);
      if (!mounted.current) return;
      setWorks((current) => [moved, ...current.filter((item) => item.id !== moved.id)]);
      setMoveWork(null);
      setNotice(tt("作品已搬到服务器。"));
    } catch (caught) {
      if (mounted.current) setError(workActionError(caught, "move", tt));
    } finally {
      if (mounted.current) setMoving(false);
    }
  }

  async function openServerFolder(work: Work) {
    if (work.home.type !== "server") return;
    try {
      await startLocalAction(work.home.computer_id, "app.open", { path: work.home.path }, () => {});
      if (mounted.current) setNotice(tt("服务器文件夹已打开。"));
    } catch {
      if (mounted.current) setError(tt("操作未完成，请重试。"));
    }
  }

  async function saveWorkToCloud(work: Work) {
    if (!api.saveToCloud) return;
    setBusy((current) => ({ ...current, [work.id]: true }));
    setError("");
    try {
      await api.saveToCloud(work.id);
      if (mounted.current) setNotice(tt("服务器作品已存回云端。"));
    } catch (caught) {
      if (mounted.current) setError(workActionError(caught, "save", tt));
    } finally {
      if (mounted.current) setBusy((current) => ({ ...current, [work.id]: false }));
    }
  }

  if (unsupported) return <div className={`rounded-2xl border border-dashed border-stone-200 p-6 text-[13px] text-stone-500 ${className}`} data-works-unsupported>{tt("作品功能尚未接入。")}</div>;

  return (
    <section className={`h-full min-h-0 overflow-y-auto pb-8 ${className}`} data-works-overview>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">{onClose && <button type="button" className={QUIET} onClick={onClose}>{tt("返回")}</button>}<div><h2 className="text-[18px] font-semibold text-stone-900">{tt("作品")}</h2><p className="mt-1 text-[12px] text-stone-500">{tt("云端和服务器上的作品都在这里。")}</p></div></div>
        <button type="button" className={PRIMARY} onClick={openAdd}>{tt("从服务器添加")}</button>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-800">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">{notice}</p>}
      {loading ? <p role="status" className="mt-8 text-[13px] text-stone-500">{tt("正在加载…")}</p> : works.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-stone-200 p-8 text-center"><p className="text-[14px] font-medium text-stone-700">{tt("还没有作品")}</p><p className="mt-2 text-[12px] text-stone-500">{tt("先从服务器添加一个项目，或在云端创建作品。")}</p></div> : <div className="mt-5 grid gap-4 lg:grid-cols-2">{works.map((work) => <WorkCard key={work.id} work={work} result={previewResults[work.id]} busy={Boolean(busy[work.id]) || moving} removeArmed={removeArmed === work.id} tt={tt} onPreview={() => void runWorkAction(work.id, async () => { setRemoveArmed(null); await refreshPreview(work); })} onStop={() => void runWorkAction(work.id, async () => { await api.stop(work.id); setPreviewResults((current) => { const next = { ...current }; delete next[work.id]; return next; }); setWorks((current) => current.map((item) => item.id === work.id ? { ...item, status: "stopped" } : item)); })} onRemove={() => { if (removeArmed !== work.id) { setRemoveArmed(work.id); return; } void runWorkAction(work.id, async () => { await api.remove(work.id); setWorks((current) => current.filter((item) => item.id !== work.id)); setRemoveArmed(null); setNotice(tt("作品已移除，服务器上的文件没有改动。")); }); }} onOpenFolder={() => void openServerFolder(work)} onMoveToServer={api.moveToServer && cloudArtifactId(work) ? () => openMove(work) : undefined} onSaveToCloud={api.saveToCloud && work.home.type === "server" ? () => void saveWorkToCloud(work) : undefined} />)}</div>}

      {addOpen && <Modal onClose={() => { if (!saving) setAddOpen(false); }} className="max-w-2xl">
        <form onSubmit={submitServerWork}>
          <div className="border-b border-stone-100 px-5 py-4"><h3 className="text-[15px] font-semibold text-stone-900">{tt("从服务器添加")}</h3><p className="mt-1 text-[12px] text-stone-500">{tt("选择服务器和项目文件夹，保存后服务器上的文件不会被复制或删除。")}</p></div>
          <div className="space-y-4 px-5 py-5">
            {addStep === "choose" ? <div className="space-y-2" data-works-server-list><p className="text-[12px] font-medium text-stone-700">{tt("选择服务器")}</p>{readyComputers.length === 0 ? <p className="rounded-lg bg-stone-50 px-3 py-3 text-[12px] text-stone-500">{tt("还没有连接的服务器。")}</p> : readyComputers.map((computer) => { const canBrowse = computerCanBrowse(computer); return <button key={computer.id} type="button" disabled={!canBrowse} onClick={() => chooseComputer(computer)} className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left ${canBrowse ? "border-stone-200 hover:bg-stone-50" : "cursor-not-allowed border-stone-100 bg-stone-50 opacity-55"}`} data-works-server={computer.id}><span><span className="block text-[13px] font-medium text-stone-800">{computer.name}</span><span className="mt-0.5 block text-[11px] text-stone-500">{canBrowse ? tt("在线") : computerOfflineReason(computer, tt)}</span></span><span className="text-[11px] text-stone-400">{canBrowse ? "›" : "—"}</span></button>; })}</div> : <>
              <div className="flex items-center justify-between gap-3"><div><p className="text-[12px] font-medium text-stone-700">{tt("项目文件夹")}</p><p className="mt-1 truncate text-[12px] text-stone-500">{path || tt("还没有选择文件夹")}</p></div><button type="button" className={QUIET} disabled={!selectedComputer || saving} onClick={() => setPickerOpen(true)}>{tt("浏览文件夹")}</button></div>
              <label className="block text-[12px] text-stone-600">{tt("作品名称")}<input className={FIELD} value={draft.title || ""} onChange={(event) => setDraft((current) => ({ ...current, title: event.currentTarget.value }))} placeholder={path.split(/[\\/]/).filter(Boolean).at(-1) || tt("自动使用文件夹名称")} /></label>
              <div className="grid gap-3 sm:grid-cols-3"><label className="block text-[12px] text-stone-600">{tt("类型")}<select className={FIELD} value={draft.kind || "other"} onChange={(event) => setDraft((current) => ({ ...current, kind: event.currentTarget.value as WorkKind }))}><option value="website">{tt("网站")}</option><option value="game">{tt("游戏")}</option><option value="app">{tt("App")}</option><option value="other">{tt("其他")}</option></select></label><label className="block text-[12px] text-stone-600 sm:col-span-2">{tt("启动命令")}<input className={FIELD} value={draft.start_command || ""} onChange={(event) => setDraft((current) => ({ ...current, start_command: event.currentTarget.value }))} placeholder="npm run dev" /></label></div>
              <label className="block max-w-[12rem] text-[12px] text-stone-600">{tt("端口")}<input className={FIELD} inputMode="numeric" type="number" min={1024} max={65535} value={draft.port || ""} onChange={(event) => setDraft((current) => ({ ...current, port: Number(event.currentTarget.value) || undefined }))} /></label>
              <p className="rounded-lg bg-stone-50 px-3 py-2 text-[11px] text-stone-500"><span className="font-medium text-stone-600">{tt("检测结果")}</span> · {tt("类型、启动命令和端口已按文件夹名称预填，可直接修改；服务器保存时会再次检测。")}</p>
            </>}
          </div>
          <div className="flex justify-end gap-2 border-t border-stone-100 px-5 py-4"><button type="button" className={QUIET} disabled={saving} onClick={() => addStep === "details" ? setAddStep("choose") : setAddOpen(false)}>{tt(addStep === "details" ? "上一步" : "取消")}</button>{addStep === "details" && <button type="submit" className={PRIMARY} disabled={saving || !draft.path.trim()}>{tt(saving ? "正在添加…" : "确认添加")}</button>}</div>
        </form>
      </Modal>}
      {moveWork && <Modal onClose={() => { if (!moving) setMoveWork(null); }} className="max-w-2xl">
        <form onSubmit={submitMove}>
          <div className="border-b border-stone-100 px-5 py-4"><h3 className="text-[15px] font-semibold text-stone-900">{tt("搬到我的服务器")}</h3><p className="mt-1 text-[12px] text-stone-500">{tt("选择在线服务器和新建或空的目标文件夹；已有内容的文件夹会被拒绝。")}</p></div>
          <div className="space-y-4 px-5 py-5">
            {moveStep === "choose" ? <div className="space-y-2" data-works-move-server-list><p className="text-[12px] font-medium text-stone-700">{tt("目标服务器")}</p>{readyComputers.length === 0 ? <p className="rounded-lg bg-stone-50 px-3 py-3 text-[12px] text-stone-500">{tt("还没有连接的服务器。")}</p> : readyComputers.map((computer) => { const canBrowse = computerCanBrowse(computer); return <button key={computer.id} type="button" disabled={!canBrowse || moving} onClick={() => chooseMoveComputer(computer)} className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left ${canBrowse ? "border-stone-200 hover:bg-stone-50" : "cursor-not-allowed border-stone-100 bg-stone-50 opacity-55"}`} data-works-move-server={computer.id}><span><span className="block text-[13px] font-medium text-stone-800">{computer.name}</span><span className="mt-0.5 block text-[11px] text-stone-500">{canBrowse ? tt("在线") : computerOfflineReason(computer, tt)}</span></span><span className="text-[11px] text-stone-400">{canBrowse ? "›" : "—"}</span></button>; })}</div> : <>
              <div className="flex items-center justify-between gap-3"><div><p className="text-[12px] font-medium text-stone-700">{tt("目标文件夹")}</p><p className="mt-1 truncate text-[12px] text-stone-500">{movePath || tt("还没有选择文件夹")}</p></div><button type="button" className={QUIET} disabled={!moveComputer || moving} onClick={() => setMovePickerOpen(true)}>{tt("浏览文件夹")}</button></div>
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">{tt("目标文件夹必须是新建或空文件夹；已有内容会被拒绝。")}</p>
            </>}
          </div>
          <div className="flex justify-end gap-2 border-t border-stone-100 px-5 py-4"><button type="button" className={QUIET} disabled={moving} onClick={() => moveStep === "details" ? setMoveStep("choose") : setMoveWork(null)}>{tt(moveStep === "details" ? "上一步" : "取消")}</button>{moveStep === "details" && <button type="submit" className={PRIMARY} disabled={moving || !movePath.trim()}>{tt(moving ? "正在搬运…" : "确认搬到服务器")}</button>}</div>
        </form>
      </Modal>}
      {pickerOpen && selectedComputer && <DeviceFolderPicker deviceId={selectedComputer.id} deviceName={selectedComputer.name} title={tt("选择项目文件夹")} client={settingsClient} onSelect={choosePath} onClose={() => setPickerOpen(false)} />}
      {movePickerOpen && moveComputer && <DeviceFolderPicker deviceId={moveComputer.id} deviceName={moveComputer.name} title={tt("选择目标文件夹")} client={settingsClient} onSelect={chooseMovePath} onClose={() => setMovePickerOpen(false)} />}
    </section>
  );
}
