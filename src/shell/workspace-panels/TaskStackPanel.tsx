"use client";

import { useMemo } from "react";
import { AgentChat } from "../AgentChat";
import { RoomView } from "../task-room";
import type { WorkspaceTaskEntry } from "../workspace-actions";
import type { SidebarTaskHost } from "./MyTasksWorkspacePanel";
import { TaskStackContext, type TaskStackContextValue } from "./task-stack-context";

/**
 * The right panel's task stack: only the top entry is shown, a sub task as the embedded AgentChat (the same
 * way My tasks embeds it) or a task as `RoomView surface="panel"`. Each entry's own header carries Back (pop)
 * and its title. Opening a card or a task link inside pushes.
 */
export function TaskStackPanel({ stack, onPush, onBack, host }: {
  stack: readonly WorkspaceTaskEntry[];
  onPush: (entry: WorkspaceTaskEntry) => void;
  onBack: () => void;
  host: Omit<SidebarTaskHost, "onNavigateTask">;
}) {
  const top = stack[stack.length - 1];
  const context = useMemo<TaskStackContextValue>(() => ({ push: onPush }), [onPush]);
  if (!top) return null;
  const key = `${stack.length}:${top.kind}:${top.id}`;
  return (
    <section data-task-stack-panel data-task-stack-depth={stack.length} className="flex h-full min-h-0 flex-col overflow-hidden">
      <TaskStackContext.Provider value={context}>
        <div key={key} className="h-full min-h-0" data-task-stack-entry={top.kind} data-task-stack-id={top.id}>
          {top.kind === "agent_task" ? (
            <AgentChat siteId="oceanleo" taskId={top.id} initialTitle={top.title || undefined}
              navigateToSessionOnCreate={false}
              sidebarHost={{ ...host, onNavigateTask: (taskId) => onPush({ kind: "agent_task", id: taskId, title: "" }) }}
              onBack={onBack} />
          ) : (
            <RoomView roomId={top.id} surface="panel" onBack={onBack}
              onOpenChild={(child: WorkspaceTaskEntry) => onPush({ kind: child.kind, id: child.id, title: child.title || "" })} />
          )}
        </div>
      </TaskStackContext.Provider>
    </section>
  );
}
