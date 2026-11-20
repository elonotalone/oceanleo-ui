"use client";

import { useMemo } from "react";
import { AgentChat } from "../AgentChat";
import type { WorkspaceTaskPanelEntry } from "../result-canvas-view-state";
import { QuoteMessagesPanel } from "../task-room/QuoteMessagesPanel";
import type { WorkspaceTaskEntry } from "../workspace-actions";
import type { SidebarTaskHost } from "./MyTasksWorkspacePanel";
import { TaskStackContext, type TaskStackContextValue } from "./task-stack-context";

/**
 * The right panel's task / quote view (session / sites wave 2026-11-21): ONE task (the embedded AgentChat, the same
 * way My tasks embeds it), a new task draft (AgentChat without a task id, in the session's project when it came
 * from one), or a quote card's snapshot read-only. No stack: opening another task replaces this one; Back → cards.
 * (File name kept from the previous wave.)
 */
export function TaskStackPanel({ entry, onOpenTask, onDraftCreated, onBack, host }: {
  entry: WorkspaceTaskPanelEntry;
  /** A task link inside the shown task: show that task here instead. */
  onOpenTask: (entry: WorkspaceTaskEntry) => void;
  /** The draft became a task (same view stays mounted). */
  onDraftCreated: (taskId: string) => void;
  onBack: () => void;
  host: Omit<SidebarTaskHost, "onNavigateTask">;
}) {
  const context = useMemo<TaskStackContextValue>(() => ({ push: onOpenTask }), [onOpenTask]);
  if (entry.kind === "quote") {
    return (
      <section data-task-panel="quote" className="flex h-full min-h-0 flex-col overflow-hidden">
        <QuoteMessagesPanel key={entry.key} message={entry.message} onBack={onBack} />
      </section>
    );
  }
  const taskId = entry.kind === "task" ? entry.id : undefined;
  return (
    <section data-task-panel={entry.kind} data-task-panel-id={taskId} className="flex h-full min-h-0 flex-col overflow-hidden">
      <TaskStackContext.Provider value={context}>
        <div key={entry.key} className="h-full min-h-0">
          <AgentChat siteId="oceanleo" taskId={taskId} initialTitle={entry.kind === "task" ? entry.title || undefined : undefined}
            {...(entry.kind === "draft" && entry.projectId ? { projectId: entry.projectId } : {})}
            navigateToSessionOnCreate={false}
            sidebarHost={{ ...host, onNavigateTask: (id) => onOpenTask({ kind: "agent_task", id, title: "" }) }}
            onTaskCreated={onDraftCreated}
            onBack={onBack} />
        </div>
      </TaskStackContext.Provider>
    </section>
  );
}
