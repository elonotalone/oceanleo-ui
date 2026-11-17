"use client";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { LibraryItem } from "../library-data";
import type { AdvancedFlushResult } from "../advanced-session-context";
import { useOptionalWorkspaceSession } from "../workspace-session-context";
import { boundedAgentContent } from "./bounded-agent-content";
import { currentEditorContext } from "./registry";
import { bindLibraryEditor, libraryEditFlow } from "./library-edit-runtime";
import { editIsLocked, type EditSnapshot, type LibraryEditFlow } from "./library-edit-flow";
import { useUI } from "../../i18n/ui/useUI";

export function useLibraryEditState(item: LibraryItem, siteId = ""): [LibraryEditFlow, EditSnapshot] {
  const workspace = useOptionalWorkspaceSession();
  const flow = libraryEditFlow(workspace?.activeFileScopeId || "standalone", item, siteId, workspace?.sessionId || undefined);
  const snapshot = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  return [flow, snapshot];
}
export function useLibraryEditorBinding(item: LibraryItem, flush: () => Promise<AdvancedFlushResult>, writable: boolean, siteId: string): EditSnapshot {
  const workspace = useOptionalWorkspaceSession();
  const workspaceRef = useRef(workspace); workspaceRef.current = workspace;
  const scopeId = workspace?.activeFileScopeId || "standalone";
  const [flow, state] = useLibraryEditState(item, siteId);
  const live = useRef({ item, flush, writable }); live.current = { item, flush, writable };
  useEffect(() => {
    if (!item.artifactId) return;
    return bindLibraryEditor(scopeId, item.artifactId, {
      item: () => live.current.item,
      writable: () => live.current.writable,
      session: async () => {
        const host = workspaceRef.current;
        const session = host ? await host.ensureActive({ title: live.current.item.title, intent: "thread" }) : null;
        if (host && !session?.id && !host.sessionId) throw new Error("文件保存失败，AI 任务没有启动。");
        return session?.id || host?.sessionId || undefined;
      },
      save: async () => {
        const result = await live.current.flush();
        if (!result.ok) throw new Error(result.error || result.errorMessage || "文件保存失败，AI 任务没有启动。");
        return result.item || live.current.item;
      },
      context: () => {
        const surface = currentEditorContext();
        const target = surface?.target?.();
        if (!surface || !target || target.artifactId !== live.current.item.artifactId || target.workspaceScopeId !== scopeId) throw new Error("文件已切换，任务没有启动。");
        const content = surface.agentContext();
        return { selection: surface.selection(), excerpt: content.ready ? boundedAgentContent(content.content, content.note) : content };
      },
    });
  }, [scopeId, item.artifactId]);
  // New editor input replaces only an idle snapshot; active task identity stays pinned.
  useEffect(() => { flow.sync(item); }, [flow, item]);
  return state;
}
/** All six editor routes share one reload boundary; ordinary autosaves never remount it. */
export function useLibraryEditReload(item: LibraryItem, onReload: (item: LibraryItem) => void): number {
  const [flow, state] = useLibraryEditState(item);
  const callback = useRef(onReload); callback.current = onReload;
  const seen = useRef({ flow, reload: 0 });
  const [epoch, setEpoch] = useState(0);
  useLayoutEffect(() => {
    if (seen.current.flow !== flow) seen.current = { flow, reload: 0 };
    if (state.reload <= seen.current.reload) return;
    seen.current.reload = state.reload;
    if (state.item.artifactId !== item.artifactId || (item.revisionId !== state.previous?.revisionId && item.revisionId !== state.item.revisionId && state.previous)) return;
    callback.current(state.item); setEpoch(value => value + 1);
  }, [flow, state.reload, state.item, state.previous, item.artifactId, item.revisionId]);
  return epoch;
}
export function LibraryEditStatus({ flow, state }: { flow: LibraryEditFlow; state: EditSnapshot }) {
  const tt = useUI();
  const locked = editIsLocked(state.phase);
  if (state.phase === "idle") return null;
  const labels: Partial<Record<EditSnapshot["phase"], string>> = {
    saving: "正在保存你的修改…", starting: "正在启动 AI 修改…", running: "AI 正在修改，编辑器暂时只读。", stopping: "正在停止 AI 修改…", reloading: "正在载入新版本…", restoring: "正在恢复上一版本…", done: "AI 修改已完成", conflict: "文件版本发生冲突；你的改动仍然保留。", failed: "AI 修改失败，原文件仍然保留。", stopped: "AI 修改已停止",
  };
  return <div role="status" data-library-ai-phase={state.phase} className="shrink-0 space-y-2 border-b border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
    <p>{tt(labels[state.phase] || "AI 助手")}</p>
    {state.note && <p className="whitespace-pre-wrap">{tt(state.note)}</p>}
    {state.error && <p role="alert">{tt(state.error)}</p>}
    {locked && state.phase !== "restoring" && <button type="button" onClick={() => void flow.stop()} disabled={state.phase === "stopping"}>{tt("停止")}</button>}
    {!locked && state.previous && state.item.revisionId !== state.previous.revisionId && <button type="button" onClick={() => void flow.undo()}>{tt("撤销 AI 修改")}</button>}
    {state.taskId && <a href={`/tasks/${encodeURIComponent(state.taskId)}`}>{tt("查看任务")}</a>}
  </div>;
}
/** Source saves finish before engines become read-only; the shell fences input while saving. */
export function useLibraryEditReadOnly(item: LibraryItem): boolean {
  const [, state] = useLibraryEditState(item);
  return editIsLocked(state.phase) && state.phase !== "saving";
}
