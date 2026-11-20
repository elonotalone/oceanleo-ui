"use client";

// Live data for a task card (session / sites wave 2026-11-21): the reader's own access (`GET /v1/tasks/{id}/access`,
// the card grants nothing) and, when allowed, the task's activity (`GET /v1/tasks/{id}/activity`, refreshed while
// the card is on screen and on window focus). Several cards of one task share one access read.
import { useEffect, useState } from "react";
import { request } from "../../lib/acp-frames-api";
import { TaskAccessError, taskAccessClient } from "../access/task-access-client";
import type { TaskCardAccess } from "./card-model";

const ACCESS_TTL_MS = 60_000;
const ACTIVITY_MS = 15_000;

const accessCache = new Map<string, { at: number; value: Promise<Exclude<TaskCardAccess, "checking">> }>();

function readAccess(taskId: string): Promise<Exclude<TaskCardAccess, "checking">> {
  const cached = accessCache.get(taskId);
  if (cached && Date.now() - cached.at < ACCESS_TTL_MS) return cached.value;
  const value = taskAccessClient.getAccess(taskId).then(
    (access): Exclude<TaskCardAccess, "checking"> => (access.role === "none" ? "denied" : "allowed"),
    (error: unknown): Exclude<TaskCardAccess, "checking"> =>
      error instanceof TaskAccessError && [401, 403, 404].includes(error.status) ? "denied" : "unknown",
  );
  accessCache.set(taskId, { at: Date.now(), value });
  return value;
}

export interface TaskCardActivity {
  activity_state?: string;
  program?: string;
}

export function useTaskCard(taskId: string | null): { access: TaskCardAccess; activity: TaskCardActivity | null } {
  const [state, setState] = useState<{ taskId: string; access: TaskCardAccess; activity: TaskCardActivity | null } | null>(null);
  useEffect(() => {
    if (!taskId) return undefined;
    let live = true;
    let timer: number | undefined;
    const readActivity = async () => {
      try {
        const activity = await request<TaskCardActivity>(`/v1/tasks/${encodeURIComponent(taskId)}/activity`);
        if (live) setState((current) => current?.taskId === taskId ? { ...current, activity } : current);
      } catch {
        // The card keeps its last word; the task itself shows any error once opened.
      }
    };
    const onFocus = () => { void readActivity(); };
    setState({ taskId, access: "checking", activity: null });
    void readAccess(taskId).then((access) => {
      if (!live) return;
      setState({ taskId, access, activity: null });
      if (access === "denied") return;
      void readActivity();
      timer = window.setInterval(() => { void readActivity(); }, ACTIVITY_MS);
      window.addEventListener("focus", onFocus);
    });
    return () => {
      live = false;
      if (timer !== undefined) window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [taskId]);
  if (!taskId) return { access: "unknown", activity: null };
  return state?.taskId === taskId ? { access: state.access, activity: state.activity } : { access: "checking", activity: null };
}

export function resetTaskCardCacheForTests(): void {
  accessCache.clear();
}
