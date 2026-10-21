"use client";

import { useState } from "react";
import type { AppSession } from "../lib/app-session";
import {
  advancedRootItemId, adoptSavedEditorItem,
  INLINE_EDITOR_HISTORY_KEY, inlineEditorItemsFromSession,
} from "./advanced-session";
import { TaskFileWorkspace } from "./task-file-workspace";

export function libraryTaskItemFromSession(session: AppSession) {
  const items = inlineEditorItemsFromSession(session);
  const snapshot = session.snapshot;
  const state = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as Record<string, unknown>)[INLINE_EDITOR_HISTORY_KEY] : undefined;
  const root = state && typeof state === "object" && !Array.isArray(state)
    ? String((state as Record<string, unknown>).latestRootId || "") : "";
  return root ? items.find((item) => advancedRootItemId(item) === root) || null : items[0] || null;
}

/** HistoryDetail already supplies the original session; never create a fresh provider here. */
export function LibraryTaskHistoryWorkspace({ session, accent }: { session: AppSession; accent: string }) {
  const [item, setItem] = useState(() => libraryTaskItemFromSession(session));
  return (
    <TaskFileWorkspace
      item={item}
      taskId={session.task_id}
      siteId={session.site_id}
      appId={session.app_id}
      accent={accent}
      onSavedItem={(saved) => setItem((current) => adoptSavedEditorItem(current, saved))}
    />
  );
}
