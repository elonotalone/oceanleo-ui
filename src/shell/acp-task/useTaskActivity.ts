"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "../../lib/acp-frames-api";

export type TaskBackgroundState = "idle" | "running" | "stale" | "unknown";
export type TaskActivitySnapshot = {
  task_id: string;
  session_id: string | null;
  activity_state: "working" | "waiting_user" | "idle";
  working: boolean;
  background_state: TaskBackgroundState;
  background_active_count: number;
  background_summary?: string;
  background_tasks: Array<{
    id: string;
    name?: string;
    task_type?: string;
    description?: string;
    summary?: string;
    can_stop?: boolean;
    state: string;
    started_at?: string | null;
    updated_at?: string | null;
  }>;
};

/** Poll the owner-scoped task projection while a task page is open. */
export function useTaskActivity(taskId: string | null, intervalMs = 5000): {
  activity: TaskActivitySnapshot | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
} {
  const [activity, setActivity] = useState<TaskActivitySnapshot | null>(null);
  const [loading, setLoading] = useState(Boolean(taskId));
  const [error, setError] = useState<Error | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const refresh = useCallback(async () => {
    if (!taskId) { setActivity(null); setLoading(false); return; }
    setLoading(true);
    try {
      const next = await request<TaskActivitySnapshot>(`/v1/tasks/${encodeURIComponent(taskId)}/activity`);
      if (!mounted.current) return;
      setActivity(next); setError(null);
    } catch (caught) {
      if (!mounted.current) return;
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [taskId]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    if (!taskId || intervalMs <= 0) return;
    const timer = window.setInterval(() => { void refresh(); }, intervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, taskId, intervalMs]);
  return { activity, loading, error, refresh };
}

const ENDED_STATES = new Set(["stale", "unknown", "ended", "completed", "complete", "failed", "stopped", "cancelled", "canceled", "terminated"]);

/**
 * Lay the gateway's projection over the reduced view: a background task the gateway knows ended with its session
 * (stale / unknown / a terminal state) is never shown as running, even when its own terminal update never arrived
 * (the frames of a dead process cannot say so). Tasks the projection does not list are left as the frames say.
 */
export function withTaskActivity<V extends { backgroundTasks: Array<{ id: string; state: string; canStop: boolean; backgroundState?: "running" | "stale" | "unknown" | "idle" }> }>(
  view: V,
  activity: TaskActivitySnapshot | null,
): V {
  if (!activity || !Array.isArray(activity.background_tasks) || !activity.background_tasks.length) return view;
  const ended = new Map<string, "stale" | "unknown">();
  for (const task of activity.background_tasks) {
    const state = String(task.state || "").toLowerCase();
    if (ENDED_STATES.has(state)) ended.set(task.id, state === "unknown" ? "unknown" : "stale");
  }
  if (!ended.size || !view.backgroundTasks.some((task) => ended.has(task.id))) return view;
  return {
    ...view,
    backgroundTasks: view.backgroundTasks.map((task) => {
      const mark = ended.get(task.id);
      return mark ? { ...task, backgroundState: mark, canStop: false } : task;
    }),
  };
}
