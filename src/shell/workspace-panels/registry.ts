"use client";

import type { ComponentType } from "react";

export interface WorkspacePanelProps {
  taskId?: string | null;
  projectId?: string | null;
  requestNonce?: string;
  onOpenLibraryItem?: (itemId: string) => void;
  onOpenLibrary?: () => void;
  onBackChange?: (back: (() => void) | null) => void;
}

export type WorkspacePanelComponent = ComponentType<WorkspacePanelProps>;

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
