"use client";

import { useCallback } from "react";
import { browserClient } from "../lib/auth/client";
import { deleteTask } from "../lib/agent";
import { deleteAppSession, updateAppSessionMetadata } from "../lib/app-session";
import { notifyHistoryChanged } from "../lib/history-events";

export type TaskRowTarget = {
  kind: "task" | "session";
  id: string;
  surface?: "app" | "advanced";
};

export type TaskRowPatch = {
  title?: string;
  pinned?: boolean;
  favorite?: boolean;
  project_id?: string | null;
};

export async function updateTaskRow(target: TaskRowTarget, patch: TaskRowPatch): Promise<{ ok: boolean; error?: string }> {
  if (target.kind === "session") {
    const result = await updateAppSessionMetadata(target.id, patch, target.surface === "advanced" ? "advanced" : "app");
    if (result.ok) notifyHistoryChanged();
    return result.ok ? { ok: true } : { ok: false, error: result.error || "session update failed" };
  }
  const client = browserClient();
  if (!client) return { ok: false, error: "supabase unavailable" };
  const { error } = await client.from("agent_tasks").update(patch).eq("id", target.id);
  if (error) return { ok: false, error: error.message };
  notifyHistoryChanged();
  return { ok: true };
}

export async function deleteTaskRow(target: TaskRowTarget): Promise<{ ok: boolean; error?: string }> {
  const result = target.kind === "session"
    ? await deleteAppSession(target.id, target.surface === "advanced" ? "advanced" : "app")
    : await deleteTask(target.id);
  if (result.ok) notifyHistoryChanged();
  return result.ok ? { ok: true } : { ok: false, error: result.error || "delete failed" };
}

export function useTaskRowActions(target: TaskRowTarget) {
  const patch = useCallback((changes: TaskRowPatch) => updateTaskRow(target, changes), [target.kind, target.id, target.surface]);
  const rename = useCallback((title: string) => patch({ title }), [patch]);
  const togglePin = useCallback((pinned: boolean) => patch({ pinned }), [patch]);
  const toggleFavorite = useCallback((favorite: boolean) => patch({ favorite }), [patch]);
  const move = useCallback((projectId: string | null) => patch({ project_id: projectId }), [patch]);
  const removeFromProject = useCallback(() => patch({ project_id: null }), [patch]);
  const remove = useCallback(() => deleteTaskRow(target), [target.kind, target.id, target.surface]);
  return { patch, rename, togglePin, toggleFavorite, move, removeFromProject, remove };
}
