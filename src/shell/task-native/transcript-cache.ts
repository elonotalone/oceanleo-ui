"use client";

// ============================================================================
// A computer conversation's newest saved transcript page, kept (2026-10-31)
// ----------------------------------------------------------------------------
// Memory LRU + this browser's copy (IndexedDB, user-scoped, dropped on
// sign-out). Reopening a conversation paints its kept page at once; the thread
// reads it again and replaces it. A sidebar hover / press may start the read
// early (`prefetchTranscript`); the thread takes it instead of starting another.
// ============================================================================

import { getComputerTaskTranscript } from "../../lib/computer-task-api";
import { cacheUser, onUserScopedClear, readUserIdb } from "../../lib/user-scoped-cache";
import { cancelPendingPersists, lru, schedulePersist, sharedRead, takeRead, type SharedRead } from "../open-cache-core";

export type TranscriptPage = Awaited<ReturnType<typeof getComputerTaskTranscript>>;
type StoredTranscript = { v: 1; page: TranscriptPage };

const transcripts = lru<TranscriptPage>();
const transcriptReads = new Map<string, SharedRead<TranscriptPage>>();

/** Keep a conversation's newest saved transcript page. */
export function rememberTranscript(sessionId: string, page: TranscriptPage | null | undefined): void {
  // Kept only for a known signed-in user (dropped when they sign out).
  if (!sessionId || !page || !Array.isArray(page.frames) || !cacheUser()) return;
  transcripts.set(sessionId, page);
  schedulePersist(`transcript:${sessionId}`, (): StoredTranscript => ({ v: 1, page }));
}

/** This tab's kept page (no read). */
export function peekTranscript(sessionId: string): TranscriptPage | undefined {
  return sessionId && cacheUser() ? transcripts.get(sessionId) : undefined;
}

/** Memory, else this browser's copy. */
export async function readTranscript(sessionId: string): Promise<TranscriptPage | undefined> {
  const known = peekTranscript(sessionId);
  if (known || !sessionId) return known;
  const stored = await readUserIdb<StoredTranscript>(`transcript:${sessionId}`);
  if (!stored || stored.v !== 1 || !Array.isArray(stored.page?.frames)) return undefined;
  const raced = transcripts.get(sessionId);
  if (raced) return raced;
  transcripts.set(sessionId, stored.page);
  return stored.page;
}

/** Read the newest page now (shared with the thread that opens this conversation next). */
export function prefetchTranscript(sessionId: string): Promise<TranscriptPage> {
  const user = cacheUser();
  return sharedRead(transcriptReads, sessionId, () =>
    getComputerTaskTranscript(sessionId).then((page) => {
      if (cacheUser() === user) rememberTranscript(sessionId, page);
      return page;
    }),
  );
}
/** A young prefetched read (used once), else null. */
export function takeTranscriptPrefetch(sessionId: string): Promise<TranscriptPage> | null {
  return takeRead(transcriptReads, sessionId);
}

/** Test seam. */
export function clearTranscriptCache(): void {
  transcripts.clear();
  transcriptReads.clear();
  cancelPendingPersists("transcript:");
}

onUserScopedClear(clearTranscriptCache);
