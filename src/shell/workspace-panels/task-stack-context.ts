"use client";

import { createContext, useContext } from "react";
import type { WorkspaceTaskEntry } from "../workspace-actions";

/**
 * Inside the right panel's task view: what opening another task means there (show it in place of this one; there
 * is no stack). AgentChat reads it to open task links in the panel instead of leaving the page.
 */
export interface TaskStackContextValue {
  push: (entry: WorkspaceTaskEntry) => void;
}

export const TaskStackContext = createContext<TaskStackContextValue | null>(null);

/** Non-null only under the right panel's task view. */
export function useTaskStack(): TaskStackContextValue | null {
  return useContext(TaskStackContext);
}
