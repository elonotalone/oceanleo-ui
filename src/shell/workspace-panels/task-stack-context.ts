"use client";

import { createContext, useContext } from "react";
import type { WorkspaceTaskEntry } from "../workspace-actions";

/**
 * Inside the right panel's task stack: what opening another task means there (push it on top).
 * AgentChat reads it to open task links in place instead of leaving the page.
 */
export interface TaskStackContextValue {
  push: (entry: WorkspaceTaskEntry) => void;
}

export const TaskStackContext = createContext<TaskStackContextValue | null>(null);

/** Non-null only under the right panel's task stack. */
export function useTaskStack(): TaskStackContextValue | null {
  return useContext(TaskStackContext);
}
