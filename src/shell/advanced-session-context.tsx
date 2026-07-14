"use client";

import { createContext, useContext } from "react";
import type { AppSession } from "../lib/app-session";
import type { AdvancedSessionSnapshot } from "./advanced-session";
import type { LibraryItem } from "./library-data";

export type AdvancedFlushResult =
  | { ok: true; item?: LibraryItem }
  | { ok: false; error?: string };

export interface AdvancedSessionActions {
  taskId: string | null;
  snapshot: (taskId?: string | null) => AdvancedSessionSnapshot;
  ensure: (taskId?: string | null) => Promise<AppSession | null>;
  navigate: (sessionId: string) => void;
  startNew: () => Promise<AppSession | null>;
  recordSavedItem: (item: LibraryItem) => Promise<boolean>;
  registerFlush: (
    flush: (() => Promise<AdvancedFlushResult> | AdvancedFlushResult) | null,
  ) => void;
}

export const AdvancedSessionContext =
  createContext<AdvancedSessionActions | null>(null);

export function useAdvancedSession(): AdvancedSessionActions | null {
  return useContext(AdvancedSessionContext);
}
