"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getClientHostConfig, onClientHostConfigChange, type ClientLocalTask } from "../contracts/client-host-config";
import { useUI } from "../i18n/ui/useUI";

export function getLocalWorkspace() {
  const config = getClientHostConfig();
  return config?.platform === "desktop" ? config.localWorkspace : undefined;
}

export function useLocalWorkspace() {
  return useSyncExternalStore(onClientHostConfigChange, getLocalWorkspace, () => undefined);
}

export function useLocalTasks() {
  const workspace = useLocalWorkspace();
  const [tasks, setTasks] = useState<ClientLocalTask[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    if (!workspace) { setTasks([]); setLoading(false); return; }
    setLoading(true);
    const refresh = async () => {
      try {
        const next = await workspace.listTasks();
        if (active) { setTasks(next); setError(""); }
      } catch (caught) {
        if (active) setError(String(caught instanceof Error ? caught.message : caught));
      } finally {
        if (active) { setLoading(false); timer = setTimeout(refresh, 3000); }
      }
    };
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [workspace]);
  return { tasks, error, loading, workspace };
}

const STAGES: Record<string, string> = {
  queued: "排队中", running: "正在执行", waiting_for_network: "等待网络恢复",
  done: "已完成", failed: "失败", cancelled: "已取消",
};

export function LocalTaskRows({ tasks, selected, accent }: { tasks: ClientLocalTask[]; selected: string | null; accent: string }) {
  const router = useRouter();
  const tt = useUI();
  return tasks.map((task) => {
    const id = `local:${task.id}`;
    const active = selected === id || selected === task.remoteTaskId;
    return <button key={task.id} type="button" onClick={() => router.push(`/history?task=${encodeURIComponent(id)}`)}
      className={`w-full rounded-lg px-3 py-2 text-left text-[13px] transition ${active ? "text-white" : "text-neutral-700 hover:bg-neutral-200/50"}`}
      style={active ? { background: accent } : undefined}>
      <span className="block truncate">{tt(task.title)}</span>
      <span className={`block truncate text-[11px] ${active ? "text-white/70" : "text-neutral-400"}`}>{tt("在本机执行")} · {tt(STAGES[task.stage] || task.stage)}</span>
    </button>;
  });
}

export function LocalTaskDetail({ task }: { task: ClientLocalTask }) {
  const workspace = useLocalWorkspace();
  const tt = useUI();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <main className="mx-auto w-full max-w-3xl space-y-5 p-8" data-local-task={task.id}>
    <h1 className="text-xl font-medium">{tt(task.title)}</h1>
    <p className="text-sm text-neutral-500">{tt("在本机执行")} · {tt(STAGES[task.stage] || task.stage)}</p>
    <p className="break-all text-sm">{task.path}</p>
    {task.stage === "waiting_for_network" && <p className="text-sm">{tt("这台电脑上已经做完了，联网后会自动同步记录。")}</p>}
    {task.failure && <p role="alert" className="text-sm text-rose-600">{task.failure}</p>}
    {task.summary && <pre className="whitespace-pre-wrap break-words rounded-xl bg-neutral-100 p-4 text-sm">{task.summary}</pre>}
    {task.remoteTaskId && <button type="button" className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" onClick={() => router.push(`/tasks/${encodeURIComponent(task.remoteTaskId!)}`)}>{tt("查看对话与产出")}</button>}
    {task.canCancel && <button type="button" disabled={busy} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50" onClick={async () => {
      setBusy(true); setError("");
      try { await workspace?.cancelTask(task.id); }
      catch (caught) { setError(String(caught instanceof Error ? caught.message : caught)); }
      finally { setBusy(false); }
    }}>{tt(busy ? "正在停止…" : "停止任务")}</button>}
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
  </main>;
}

export function LocalComputerSettings({ onRequestClose }: { onRequestClose?: () => void | Promise<void> } = {}) {
  const workspace = useLocalWorkspace();
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!target.current || !workspace) return;
    return workspace.mountSettings(target.current, { onRequestClose });
  }, [workspace, onRequestClose]);
  return <div ref={target} data-local-computer-settings />;
}
