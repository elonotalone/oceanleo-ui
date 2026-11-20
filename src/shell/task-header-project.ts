"use client";

import { useEffect, useState, type RefObject } from "react";
import { portalHref } from "../contracts/domain-family";

/** The project a task belongs to, as the single-task JSON gives it to project owners and members only. */
export type TaskProjectLink = { id: string; name: string };

/**
 * `task.project` from the task read (contract §1.4). `null` when the task is not in a project or the viewer is not
 * one of its members; a `project` that contradicts the row's own `project_id` is not trusted.
 */
export function taskProjectLink(task: { project?: unknown; project_id?: unknown } | null | undefined): TaskProjectLink | null {
  const project = task?.project;
  if (!project || typeof project !== "object") return null;
  const id = String((project as { id?: unknown }).id ?? "").trim();
  const name = String((project as { name?: unknown }).name ?? "").trim();
  if (!id || !name) return null;
  const rowProject = String(task?.project_id ?? "").trim();
  if (rowProject && rowProject !== id) return null;
  return { id, name };
}

export function sameTaskProject(a: TaskProjectLink | null, b: TaskProjectLink | null): boolean {
  return a === b || Boolean(a && b && a.id === b.id && a.name === b.name);
}

export function taskProjectHref(projectId: string): string {
  return portalHref(`/projects/${encodeURIComponent(projectId)}`);
}

/** Below this width an open conversation search takes the task title's place in the one-row top bar. */
export const TASK_HEADER_NARROW_PX = 420;

/** Whether the element is narrower than `limit` while `active`; measured, so a narrow split pane counts too. */
export function useNarrowWidth(ref: RefObject<HTMLElement | null>, active: boolean, limit = TASK_HEADER_NARROW_PX): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!active || !node) {
      setNarrow(false);
      return;
    }
    // Zero = not laid out (hidden pane, no layout engine): unknown, so the title stays.
    const measure = () => {
      const width = node.getBoundingClientRect().width;
      setNarrow(width > 0 && width < limit);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, active, limit]);
  return narrow;
}
