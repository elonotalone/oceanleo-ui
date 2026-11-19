"use client";

import { useCallback, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { AgentChat } from "../AgentChat";
import { HistoryInlineList } from "../HistoryMasterDetail";
import { isRestorableAppSession, isShellTask, isTaskThreadSession, type HistoryListEntry } from "../history-model";
import type { LibraryItem } from "../library-data";
import type { WorkspaceActionEnvelope } from "../workspace-actions";

export interface SidebarTaskHost {
  instanceId: string;
  onOpenAction: (action: WorkspaceActionEnvelope) => void;
  onOpenItem: (item: LibraryItem, mode?: "preview" | "edit") => void;
  onNavigateTask: (taskId: string) => void;
}

/** Non-chat workspaces retain their real full-page renderer. */
export function sidebarChatTask(entry: HistoryListEntry): { taskId: string; siteId: string; title?: string } | null {
  if (entry.kind === "task") {
    if (isShellTask(entry.task)) return null;
    return { taskId: entry.task.id, siteId: entry.task.site_id || "oceanleo", title: entry.task.title };
  }
  if (!entry.session.task_id || (isRestorableAppSession(entry.session) && !isTaskThreadSession(entry.session))) return null;
  return { taskId: entry.session.task_id, siteId: entry.session.site_id || "oceanleo", title: entry.session.title || undefined };
}

/** The same history readers, with selection and navigation owned by this sidebar. */
export function MyTasksWorkspacePanel({ host, onTaskOpenChange }: {
  host: Omit<SidebarTaskHost, "onNavigateTask">;
  onTaskOpenChange: (open: boolean) => void;
}) {
  const tt = useUI();
  const [selected, setSelected] = useState<{ key: number; taskId?: string; siteId: string; title?: string } | null>(null);
  const open = useCallback((task: { taskId?: string; siteId: string; title?: string }) => {
    setSelected((current) => ({ ...task, key: (current?.key || 0) + 1 }));
    onTaskOpenChange(true);
  }, [onTaskOpenChange]);
  const openEntry = useCallback((entry: HistoryListEntry) => {
    const task = sidebarChatTask(entry);
    if (!task) return false;
    open(task);
    return true;
  }, [open]);
  return (
    <section data-my-tasks-workspace-panel className="flex h-full min-h-0 flex-col overflow-hidden">
      <div hidden={Boolean(selected)} inert={Boolean(selected) || undefined} className={selected ? "hidden" : "h-full min-h-0 overflow-auto"}>
        <div className="px-3 py-2">
          <button type="button" data-my-tasks-new onClick={() => open({ siteId: "oceanleo" })}
            className="w-full rounded-lg px-3 py-1.5 text-[13px] font-medium text-stone-700 hover:bg-stone-100">
            {tt("新任务")}
          </button>
        </div>
        <HistoryInlineList onOpenEntry={openEntry} />
      </div>
      {selected && <div className="h-full min-h-0" data-sidebar-task={selected.taskId || "draft"}>
        <AgentChat key={selected.key} siteId={selected.siteId} taskId={selected.taskId} initialTitle={selected.title}
          navigateToSessionOnCreate={false}
          sidebarHost={{ ...host, onNavigateTask: (taskId) => open({ taskId, siteId: selected.siteId }) }}
          onTaskCreated={(taskId) => setSelected((current) => current ? { ...current, taskId } : current)}
          onBack={() => { setSelected(null); onTaskOpenChange(false); }} />
      </div>}
    </section>
  );
}
