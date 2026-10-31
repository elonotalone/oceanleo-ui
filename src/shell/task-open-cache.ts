"use client";

// ============================================================================
// Task switch speed (2026-10-31): prefetch + per-task conversation cache
// ----------------------------------------------------------------------------
// Opening a task from the sidebar used to wait for a chain of reads that only
// started once the page under it had mounted (task → session list → computer →
// transcript). Now:
//
// * Hover / focus / press on a sidebar row starts the reads at once, in
//   parallel (task detail, and for a computer task its session list and the
//   latest conversation's saved transcript). The pages take the in-flight
//   promise instead of starting their own (`take…Prefetch`, used once, young
//   only).
// * What was read is kept per task (memory LRU + IndexedDB, user-scoped,
//   dropped on sign-out): a task opened before paints from it at once and the
//   page reads it again in the background. Only the newest messages / first
//   transcript page are kept on disk.
// * Transcripts: native-thread/transcript-cache (same rules).
// * The first task read asks for the newest `TASK_FIRST_PAGE_MESSAGES` messages
//   (`message_limit`). A reply that may be cut (as many messages as asked for)
//   is a partial seed: AgentChat shows it and then reads the whole thread.
// ============================================================================

import { getTask, type TaskDetail } from "../lib/agent";
import { getAppSession } from "../lib/app-session";
import {
  knownComputerTaskSessions,
  latestComputerTaskSession,
  listComputerTaskSessions,
  type ComputerTaskSession,
} from "../lib/computer-task-api";
import { cacheUser, onUserScopedClear, readUserIdb } from "../lib/user-scoped-cache";
import { markStaleTaskSeed } from "./history-detail-cache";
import {
  cancelPendingPersists,
  forgetRead,
  lru,
  schedulePersist,
  sharedRead,
  takeRead,
  type SharedRead,
} from "./open-cache-core";
import { prefetchTranscript, readTranscript } from "./native-thread/transcript-cache";

export { PREFETCH_FRESH_MS } from "./open-cache-core";

/** Newest messages asked for on a task's first read (and kept on disk). */
export const TASK_FIRST_PAGE_MESSAGES = 60;

type TaskResult = Awaited<ReturnType<typeof getTask>>;
type AppSessionResult = Awaited<ReturnType<typeof getAppSession>>;

// ---------------------------------------------------------------------------
// Partial seeds
// ---------------------------------------------------------------------------

const partialSeeds = new WeakSet<object>();

/** A TaskDetail that may hold only the newest messages: read the whole thread after showing it. */
export function isPartialTaskSeed(seed: object | null | undefined): boolean {
  return Boolean(seed && partialSeeds.has(seed));
}

/** Mark a snapshot built from a cut copy (it is cut too until a whole read lands). */
export function markPartialTaskSeed(seed: object | null | undefined): void {
  if (seed) partialSeeds.add(seed);
}

// ---------------------------------------------------------------------------
// Kept task details (memory LRU + this browser's copy)
// ---------------------------------------------------------------------------

const details = lru<TaskDetail>();
type StoredTask = { v: 1; partial: boolean; detail: TaskDetail };

/** Keep what a page read for this task (a full snapshot: messages merged so far + cursor). */
export function rememberTaskDetail(detail: TaskDetail | null | undefined): void {
  const id = detail?.task?.id;
  // Kept only for a known signed-in user (dropped when they sign out).
  if (!detail || !id || !Array.isArray(detail.messages) || !cacheUser()) return;
  details.set(id, detail);
  schedulePersist(`task:${id}`, (): StoredTask => {
    const cut = detail.messages.length > TASK_FIRST_PAGE_MESSAGES;
    return {
      v: 1,
      partial: cut || isPartialTaskSeed(detail),
      detail: cut ? { ...detail, messages: detail.messages.slice(-TASK_FIRST_PAGE_MESSAGES) } : detail,
    };
  });
}

/** This tab's copy of a task (no read). Served copies are stale: the page reads again. */
export function peekTaskDetail(taskId: string): TaskDetail | undefined {
  const detail = taskId && cacheUser() ? details.get(taskId) : undefined;
  markStaleTaskSeed(detail);
  return detail;
}

/** Memory, else this browser's saved copy (IndexedDB). */
export async function readTaskDetail(taskId: string): Promise<TaskDetail | undefined> {
  const known = peekTaskDetail(taskId);
  if (known || !taskId) return known;
  const stored = await readUserIdb<StoredTask>(`task:${taskId}`);
  if (!stored || stored.v !== 1 || stored.detail?.task?.id !== taskId || !Array.isArray(stored.detail.messages)) return undefined;
  // Read while the page was reading the gateway: the fresher copy in memory wins.
  if (details.get(taskId)) return peekTaskDetail(taskId);
  if (stored.partial) partialSeeds.add(stored.detail);
  details.set(taskId, stored.detail);
  markStaleTaskSeed(stored.detail);
  return stored.detail;
}

// ---------------------------------------------------------------------------
// Prefetch: one in-flight read per thing, handed to the page that opens it
// ---------------------------------------------------------------------------

const taskReads = new Map<string, SharedRead<TaskResult>>();
const sessionReads = new Map<string, SharedRead<AppSessionResult>>();

/** The task's first read (newest messages), shared with whoever opens it next. */
export function prefetchTask(taskId: string): Promise<TaskResult> {
  const user = cacheUser();
  const request: Promise<TaskResult> = sharedRead(taskReads, taskId, () =>
    getTask(taskId, { messageLimit: TASK_FIRST_PAGE_MESSAGES }).then((result) => {
      if (result.ok && result.data && cacheUser() === user) {
        // A paging gateway says has_more; an older one returns the whole thread
        // unflagged, so a full first page may be cut.
        const more = result.data.has_more;
        if (more === true || (more === undefined && Array.isArray(result.data.messages)
          && result.data.messages.length >= TASK_FIRST_PAGE_MESSAGES)) {
          partialSeeds.add(result.data);
        }
        rememberTaskDetail(result.data);
      } else forgetRead(taskReads, taskId, request);
      return result;
    }),
  );
  return request;
}
/** A young prefetched task read (used once), else null. */
export function takeTaskPrefetch(taskId: string): Promise<TaskResult> | null {
  return takeRead(taskReads, taskId);
}

/** The page's own first read of a task: the prefetched one if young, else a new (cut) read. */
export function openTaskFirstPage(taskId: string): Promise<TaskResult> {
  const taken = takeTaskPrefetch(taskId);
  if (taken) return taken;
  const request = prefetchTask(taskId);
  takeRead(taskReads, taskId);
  return request;
}

export function prefetchAppSession(sessionId: string): Promise<AppSessionResult> {
  const request: Promise<AppSessionResult> = sharedRead(sessionReads, sessionId, () =>
    getAppSession(sessionId).then((result) => {
      if (!result.ok) forgetRead(sessionReads, sessionId, request);
      return result;
    }),
  );
  return request;
}
export function takeAppSessionPrefetch(sessionId: string): Promise<AppSessionResult> | null {
  return takeRead(sessionReads, sessionId);
}

function transcriptSession(sessions: readonly ComputerTaskSession[] | null | undefined): ComputerTaskSession | null {
  const latest = latestComputerTaskSession((sessions ?? []).filter((session) =>
    session.kind !== "acp" || Boolean(session.program && session.program !== "oceanleo")));
  return latest && latest.kind === "acp" ? latest : null;
}

/** What a sidebar row knows about the task it opens (all from the list row). */
export interface HistoryOpenHint {
  /** `session` = an app_session id (`/history/<id>`); `task` = a task id (`?task=`). */
  kind: "session" | "task";
  id: string;
  taskId?: string | null;
  mode?: string | null;
  /** The task's newest computer conversation, when known. */
  computerSessionId?: string | null;
}

/**
 * Start every read the page will need for this row, in parallel, now. Safe to
 * call repeatedly (hover, focus, press): reads in flight are shared.
 */
export function prefetchHistoryOpen(hint: HistoryOpenHint): void {
  if (!hint.id) return;
  const swallow = () => undefined;
  if (hint.kind === "session") prefetchAppSession(hint.id).catch(swallow);
  const taskId = hint.taskId || (hint.kind === "task" ? hint.id : "");
  if (!taskId) return;
  void readTaskDetail(taskId).catch(swallow);
  prefetchTask(taskId).catch(swallow);
  if (hint.mode !== "computer") return;
  const known = hint.computerSessionId || transcriptSession(knownComputerTaskSessions(taskId))?.id || "";
  if (known) {
    void readTranscript(known).catch(swallow);
    prefetchTranscript(known).catch(swallow);
  }
  const user = cacheUser();
  listComputerTaskSessions(taskId).then((result) => {
    if (cacheUser() !== user) return;
    const latest = transcriptSession(result?.sessions);
    if (latest && latest.id !== known) {
      void readTranscript(latest.id).catch(swallow);
      prefetchTranscript(latest.id).catch(swallow);
    }
  }, swallow);
}

/** Session-kind history details survive a reload too (the app_session row; small). */
export function rememberHistorySession(key: string, session: unknown): void {
  if (!key || !session) return;
  schedulePersist(`history:${key}`, () => ({ v: 1, session }));
}
export async function readHistorySession<T>(key: string): Promise<T | undefined> {
  if (!key) return undefined;
  const stored = await readUserIdb<{ v: 1; session: T }>(`history:${key}`);
  return stored && stored.v === 1 && stored.session ? stored.session : undefined;
}

/** Test seam. */
export function clearTaskOpenCache(): void {
  details.clear();
  taskReads.clear();
  sessionReads.clear();
  cancelPendingPersists("task:");
  cancelPendingPersists("history:");
}

onUserScopedClear(clearTaskOpenCache);
