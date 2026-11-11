"use client";

// The first message of a computer task sent from the home page (UX wave 2026-11-07, contract §2.5).
// The home puts the message here and opens the task view in the same moment; the task is created
// and the message sent in the background. The task view reads the local copy (the user's bubble
// and its files) until the stream has the message's own row. Memory only: one tab, no storage.

import { useCallback, useSyncExternalStore } from "react";
import type { AcpSessionChoices } from "../../lib/acp-frames-api";
import type { AgentAttachment } from "../../lib/agent";
import type { ComputerTaskSession } from "../../lib/computer-task-api";

export type PendingSendInput = {
  /** The message's id at the gateway (`client_message_id`); a retry of the same message reuses it. */
  clientMessageId: string;
  computerId: string;
  program: string;
  text: string;
  attachments: AgentAttachment[];
  /** The model / mode / options sent with the message. */
  choice: AcpSessionChoices;
  /** Existing task for task-page sends; omitted for the home's first message. */
  taskId?: string | null;
  /** Last frame visible when this optimistic message was created. */
  afterRowId?: number;
};

export type PendingSendStatus = "sending" | "accepted" | "queued" | "failed";

export type PendingSend = Readonly<PendingSendInput & {
  id: string;
  /** The created task; null until the gateway made it. */
  taskId: string | null;
  /** The created session row, when the create returned it (the page shows it without reading the list). */
  session: ComputerTaskSession | null;
  /** The committed prompt row returned by the send route, when known. */
  rowId: number | null;
  /** Sending is the request in flight; accepted awaits its stream row; both stay quiet. */
  status: PendingSendStatus;
  /** What the create or the send threw, as it came; null while it is on its way or after it went out. */
  error: unknown;
}>;

export type PendingSettle = {
  taskId: string;
  session?: ComputerTaskSession | null;
  rowId?: number | null;
  queued?: boolean;
} | { error: unknown };

const entries = new Map<string, PendingSend>();
const listeners = new Set<() => void>();
let version = 0;
const manySnapshots = new Map<string, { version: number; value: PendingSend[] }>();

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Keep a message the home is sending; returns the id the task view reads it by. */
export function putPending(input: PendingSendInput): string {
  const id = crypto.randomUUID();
  entries.set(id, {
    ...input,
    attachments: [...input.attachments],
    id,
    taskId: input.taskId ?? null,
    session: null,
    rowId: null,
    status: "sending",
    error: null,
  });
  notify();
  return id;
}

/** Task creation keeps the request in flight. A rowId/queued receipt settles the send, even without a row yet. */
export function settlePending(pendingId: string, outcome: PendingSettle): void {
  const current = entries.get(pendingId);
  if (!current) return;
  entries.set(pendingId, "error" in outcome
    ? { ...current, status: "failed", error: outcome.error }
    : {
        ...current,
        taskId: outcome.taskId,
        session: outcome.session ?? current.session,
        rowId: outcome.rowId === undefined ? current.rowId : outcome.rowId,
        status: outcome.queued ? "queued" : "rowId" in outcome || "queued" in outcome ? "accepted" : current.status,
        error: null,
      });
  notify();
}

/** Clear an error and reuse the same client id for a user retry. */
export function retryPending(pendingId: string): void {
  const current = entries.get(pendingId);
  if (!current) return;
  entries.set(pendingId, { ...current, status: "sending", rowId: null, error: null });
  notify();
}

/** Remove an optimistic copy once its committed stream row is visible. */
export function forgetPending(pendingId: string): void {
  if (!entries.delete(pendingId)) return;
  notify();
}

export function readPending(pendingId: string | null | undefined): PendingSend | null {
  return pendingId ? entries.get(pendingId) ?? null : null;
}

/** The pending message for `pendingId` (null: none, e.g. after a reload). */
export function usePending(pendingId: string | null | undefined): PendingSend | null {
  const read = useCallback(() => readPending(pendingId), [pendingId]);
  return useSyncExternalStore(subscribe, read, read);
}

/** Read several task-page optimistic sends without creating a second state store. */
export function usePendingMany(pendingIds: readonly string[]): PendingSend[] {
  const key = pendingIds.join("\u0000");
  const read = useCallback(() => {
    const cached = manySnapshots.get(key);
    if (cached && cached.version === version) return cached.value;
    const value = pendingIds.flatMap((id) => {
      const entry = entries.get(id);
      return entry ? [entry] : [];
    });
    manySnapshots.set(key, { version, value });
    return value;
  }, [key]);
  return useSyncExternalStore(subscribe, read, read);
}
