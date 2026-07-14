"use client";

import { createContext, useContext } from "react";
import type { AppSession } from "../lib/app-session";
import type { AdvancedSessionSnapshot } from "./advanced-session";

export interface AdvancedSessionActions {
  snapshot: (taskId?: string | null) => AdvancedSessionSnapshot;
  ensure: (taskId?: string | null) => Promise<AppSession | null>;
  navigate: (sessionId: string) => void;
  startNew: () => Promise<AppSession | null>;
  registerFlush: (
    flush: (() => Promise<boolean> | boolean) | null,
  ) => void;
}

export const AdvancedSessionContext =
  createContext<AdvancedSessionActions | null>(null);

export function useAdvancedSession(): AdvancedSessionActions | null {
  return useContext(AdvancedSessionContext);
}
