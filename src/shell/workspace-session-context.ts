"use client";

import { createContext, useContext } from "react";
import type { WorkspaceSessionContextValue } from "./workspace-session-model";

export const WorkspaceSessionContext =
  createContext<WorkspaceSessionContextValue | null>(null);

/** Provider 必须存在的严格 hook，供站点 runtime 显式接线。 */
export function useWorkspaceSession(): WorkspaceSessionContextValue {
  const value = useContext(WorkspaceSessionContext);
  if (!value) {
    throw new Error(
      "useWorkspaceSession 必须在 WorkspaceSessionProvider 内使用",
    );
  }
  return value;
}

/** 兼容型 hooks（useConsoleDraft/useConsoleRun/FunctionAgentChat）内部使用。 */
export function useOptionalWorkspaceSession(): WorkspaceSessionContextValue | null {
  return useContext(WorkspaceSessionContext);
}
