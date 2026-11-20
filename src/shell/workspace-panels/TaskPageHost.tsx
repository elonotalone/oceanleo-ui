"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { RoomView } from "../task-room";
import { TaskWorkspaceShell, useTaskWorkspaceState } from "../TaskWorkspaceShell";
import type { WorkspaceTaskRequest } from "../result-canvas-view-state";
import { normalizeTaskEntry, type WorkspaceTaskEntry } from "../workspace-actions";
import { useTaskPageLayout } from "./task-chain";

/**
 * `/tasks/{id}`: a sub task with a parent task shows the parent task as the page and this sub task open in the
 * right panel; a task id shows that task as the page; anything else (and whenever the task-room routes are not
 * available) is today's page, `children`, unchanged. Narrow screens: the sub task takes the whole screen and its
 * Back returns to the task (the panel does that).
 */
export function TaskPageHost({ taskId, children }: { taskId: string; children: ReactNode }) {
  const tt = useUI();
  const layout = useTaskPageLayout(taskId);
  if (layout.kind === "resolving") {
    return <div role="status" aria-label={tt("正在加载…")} data-task-page-resolving className="grid h-full min-h-0 place-items-center">
      <span className="v-spinner" />
    </div>;
  }
  if (layout.kind === "plain") return <>{children}</>;
  const roomId = layout.kind === "room" ? layout.roomId : layout.parentRoomId;
  const child = layout.kind === "child" ? layout.entry : null;
  return <TaskRoomPage key={`${roomId}:${child?.id || ""}`} roomId={roomId} child={child} />;
}

function TaskRoomPage({ roomId, child }: { roomId: string; child: WorkspaceTaskEntry | null }) {
  const workspace = useTaskWorkspaceState({ defaultOpen: Boolean(child), defaultTab: "home" });
  const { setRightOpen } = workspace;
  const sequence = useRef(0);
  const [request, setRequest] = useState<WorkspaceTaskRequest | null>(() => child ? { nonce: `task-page:${roomId}:0`, entries: [child] } : null);
  // A card in the main column: the panel shows that one child (replacing whatever it showed).
  const openChild = useCallback((detail: { kind: "agent_task" | "room"; id: string; title: string }) => {
    const entry = normalizeTaskEntry(detail);
    if (!entry) return;
    setRightOpen(true);
    setRequest({ nonce: `task-page:${roomId}:${++sequence.current}`, entries: [entry] });
  }, [roomId, setRightOpen]);
  return (
    <div data-task-room-page={roomId} className="h-full min-h-0">
      <TaskWorkspaceShell
        state={workspace}
        tabs={[]}
        canvas={{ showTemplate: false, siteId: "oceanleo", taskStackRequest: request }}
        left={<RoomView roomId={roomId} surface="page" onOpenChild={openChild} />}
        defaultRatio={0.5}
        storageKey="oceanleo_task_room_split"
        fillParent
        soloMaxWidth={null}
      />
    </div>
  );
}
