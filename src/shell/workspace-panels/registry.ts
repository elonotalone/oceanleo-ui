"use client";

import type { ComponentType } from "react";

export type WorkspacePanelComponent = ComponentType<{ taskId?: string | null }>;

const panels = new Map<string, WorkspacePanelComponent>();

/** Register a host-owned panel and return an idempotent unregister callback. */
export function registerWorkspacePanel(id: string, component: WorkspacePanelComponent): () => void {
  const key = String(id || "").trim();
  if (!key || typeof component !== "function") return () => {};
  panels.set(key, component);
  return () => {
    if (panels.get(key) === component) panels.delete(key);
  };
}

export function getWorkspacePanel(id: string): WorkspacePanelComponent | null {
  return panels.get(id) || null;
}

export function resetWorkspacePanelsForTests(): void {
  panels.clear();
}
