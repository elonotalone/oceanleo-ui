"use client";

import { lazy, Suspense, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SHARE_ACCESS_COPY_SOURCE as copy } from "../../i18n/ui/messages/share-access-copy-source";
import { notifyHistoryChanged } from "../../lib/history-events";
import { notifyTaskAccessChanged } from "./useTaskAccess";
import { TaskAccessError, taskAccessClient, type TaskAccess, type TaskAccessClient } from "./task-access-client";

const TaskSignInDialog = lazy(() => import("../../pages/AuthDialog").then(module => ({ default: module.AuthDialog })));

/** Replaces the whole composer for invitation, viewer and retained-history states. */
export function TaskAccessComposer({ taskId, access, signedIn, loading, error, onRefresh, client = taskAccessClient, onSignIn, onFork }: {
  taskId: string; access: TaskAccess | null; signedIn: boolean; loading?: boolean; error?: boolean;
  onRefresh: () => Promise<void>; client?: TaskAccessClient; onSignIn?: () => void; onFork?: (taskId: string) => void;
}) {
  const tt = useUI();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const signIn = onSignIn ?? (() => setShowAuth(true));
  const action = async (kind: "accept" | "decline" | "fork") => {
    if (!signedIn) { signIn(); return; }
    if (busy) return;
    setBusy(true); setFailure("");
    try {
      if (kind === "fork") {
        const result = await client.fork(taskId);
        if (!result.task_id) throw new Error("missing task");
        notifyHistoryChanged();
        if (onFork) onFork(result.task_id);
        else window.location.assign(`/tasks/${encodeURIComponent(result.task_id)}`);
      } else {
        await client[kind](taskId);
        notifyHistoryChanged();
        notifyTaskAccessChanged(taskId);
        await onRefresh();
      }
    } catch (failure) {
      if (failure instanceof TaskAccessError && failure.status === 401) signIn();
      else setFailure(tt(copy.saveFailed));
    } finally { setBusy(false); }
  };
  const buttonClass = "rounded-xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-neutral-950 px-4 py-2 text-sm hover:bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] disabled:opacity-50";
  return <div data-task-access-composer={loading ? "loading" : access?.state ?? "unavailable"} className="space-y-2 py-2 text-neutral-800 dark:text-neutral-100" aria-busy={busy || loading}>
    {loading ? <span role="status" className="v-spinner" /> : error || !access || access.state === "none" ? <p role="alert" className="text-sm">{tt(error ? copy.loadFailed : copy.noAccess)} <button type="button" className="underline" onClick={() => void onRefresh()}>{tt(copy.retry)}</button></p> : <>
      <p className="text-sm text-[var(--muted-foreground)]">{tt(access.state === "removed" ? copy.removed : copy.readOnly)}</p>
      {access.state === "invited" ? <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} disabled={busy} onClick={() => void action("accept")}>{tt(copy.accept)}</button>
        <button type="button" className={buttonClass} disabled={busy} onClick={() => void action("decline")}>{tt(copy.decline)}</button>
      </div> : (access.can_fork || !signedIn && access.state === "public") && <>
        <button type="button" className={buttonClass} disabled={busy} onClick={() => void action("fork")}>{tt(copy.continueOwn)}</button>
        <p className="text-xs text-[var(--muted-foreground)]">{tt(copy.forkNote)}</p>
      </>}
    </>}
    {failure && <p role="alert" className="text-sm">{failure}</p>}
    {showAuth && <Suspense fallback={<span role="status" className="v-spinner" />}>
      <TaskSignInDialog onClose={() => setShowAuth(false)} onSuccess={() => { setShowAuth(false); void onRefresh(); }} />
    </Suspense>}
  </div>;
}
