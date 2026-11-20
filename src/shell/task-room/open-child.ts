// Opening a child of a task from anywhere (task rooms wave 2026-11-20, contract §2.3).
// The right panel (TU2) listens, calls preventDefault() when it took the request, and shows
// the sub task / task in its stack. This module never navigates by itself.
export const OPEN_TASK_CHILD_EVENT = "oceanleo:open-task-child";

export interface OpenTaskChildDetail {
  kind: "agent_task" | "room";
  id: string;
  title: string;
}

/** Dispatches the request; true when a listener took it (called preventDefault()). */
export function openTaskChild(detail: OpenTaskChildDetail): boolean {
  if (typeof window === "undefined") return false;
  const event = new CustomEvent<OpenTaskChildDetail>(OPEN_TASK_CHILD_EVENT, {
    detail: { kind: detail.kind, id: detail.id, title: detail.title },
    cancelable: true,
  });
  return !window.dispatchEvent(event);
}

/** Where a child opens when no panel took the request: a sub task's page, or the task in LeoChat. */
export function taskChildHref(detail: Pick<OpenTaskChildDetail, "kind" | "id">): string | null {
  return detail.kind === "agent_task" ? `/tasks/${encodeURIComponent(detail.id)}` : null;
}
