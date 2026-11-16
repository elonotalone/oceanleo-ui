"use client";

import { useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { SHARE_ACCESS_COPY_SOURCE as copy } from "../../i18n/ui/messages/share-access-copy-source";
import { notifyTaskAccessChanged } from "./useTaskAccess";
import { TaskAccessError, taskAccessClient, type TaskAccess, type TaskAccessClient } from "./task-access-client";

export function taskSignIn(taskUrl: string) {
  window.location.assign(`/account?next=${encodeURIComponent(taskUrl)}`);
}

/** Replaces the whole composer for invitation, viewer and retained-history states. */
export function TaskAccessComposer({ taskId, access, signedIn, loading, error, onRefresh, client = taskAccessClient, onSignIn, onFork }: {
  taskId: string; access: TaskAccess | null; signedIn: boolean; loading?: boolean; error?: boolean;
  onRefresh: () => Promise<void>; client?: TaskAccessClient; onSignIn?: () => void; onFork?: (taskId: string) => void;
}) {
  const tt = useUI();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const signIn = onSignIn ?? (() => taskSignIn(`/tasks/${encodeURIComponent(taskId)}`));
  const action = async (kind: "accept" | "decline" | "fork") => {
    if (!signedIn) { signIn(); return; }
    if (busy) return;
    setBusy(true); setFailure("");
    try {
      if (kind === "fork") {
        const result = await client.fork(taskId);
        if (!result.task_id) throw new Error("missing task");
        if (onFork) onFork(result.task_id);
        else window.location.assign(`/tasks/${encodeURIComponent(result.task_id)}`);
      } else {
        await client[kind](taskId);
        notifyTaskAccessChanged(taskId);
        await onRefresh();
      }
    } catch (failure) {
      if (failure instanceof TaskAccessError && failure.status === 401) signIn();
      else setFailure(tt(copy.saveFailed));
    } finally { setBusy(false); }
  };
  const buttonClass = "rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-sm hover:bg-[var(--surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--ring)] disabled:opacity-50";
  return <div data-task-access-composer={loading ? "loading" : access?.state ?? "unavailable"} className="space-y-2 py-2 text-[var(--foreground)]" aria-busy={busy || loading}>
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
  </div>;
}
