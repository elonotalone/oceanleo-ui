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
};

export type PendingSend = Readonly<PendingSendInput & {
  id: string;
  /** The created task; null until the gateway made it. */
  taskId: string | null;
  /** The created session row, when the create returned it (the page shows it without reading the list). */
  session: ComputerTaskSession | null;
  /** What the create or the send threw, as it came; null while it is on its way or after it went out. */
  error: unknown;
}>;

export type PendingSettle = { taskId: string; session?: ComputerTaskSession | null } | { error: unknown };

const entries = new Map<string, PendingSend>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Keep a message the home is sending; returns the id the task view reads it by. */
export function putPending(input: PendingSendInput): string {
  const id = crypto.randomUUID();
  entries.set(id, { ...input, attachments: [...input.attachments], id, taskId: null, session: null, error: null });
  for (const listener of listeners) listener();
  return id;
}

/** The task id arrived (`{taskId}`), or the create / send failed (`{error}`). A task id stays once known. */
export function settlePending(pendingId: string, outcome: PendingSettle): void {
  const current = entries.get(pendingId);
  if (!current) return;
  entries.set(pendingId, "error" in outcome
    ? { ...current, error: outcome.error }
    : { ...current, taskId: outcome.taskId, session: outcome.session ?? current.session, error: null });
  for (const listener of listeners) listener();
}

export function readPending(pendingId: string | null | undefined): PendingSend | null {
  return pendingId ? entries.get(pendingId) ?? null : null;
}

/** The pending message for `pendingId` (null: none, e.g. after a reload). */
export function usePending(pendingId: string | null | undefined): PendingSend | null {
  const read = useCallback(() => readPending(pendingId), [pendingId]);
  return useSyncExternalStore(subscribe, read, read);
}
