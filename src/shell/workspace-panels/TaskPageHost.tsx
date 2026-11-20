"use client";

import type { ReactNode } from "react";

/**
 * `/tasks/{id}` is just the task (session / sites wave 2026-11-21: no "task beside its parent task" layout).
 * Kept as a pass-through so existing page code compiles; it renders `children` unchanged.
 */
export function TaskPageHost({ children }: { taskId: string; children: ReactNode }) {
  return <>{children}</>;
}
