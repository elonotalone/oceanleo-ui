"use client";

// ============================================================================
// Shared pieces of the open caches (task-open-cache, native-thread/transcript-cache)
// ----------------------------------------------------------------------------
// A small memory LRU, a debounced write of the browser copy (IndexedDB, through
// the user-scoped cache), and "one read in flight per thing, handed once to the
// page that opens it" for prefetches.
// ============================================================================

import { cacheUser, onUserScopedClear, writeUserIdb } from "../lib/user-scoped-cache";

/** A prefetch older than this is not handed to a page (it reads again). */
export const PREFETCH_FRESH_MS = 10_000;
const MEMORY_MAX = 40;
const PERSIST_DELAY_MS = 1_200;

export function lru<T>(max = MEMORY_MAX) {
  const map = new Map<string, T>();
  return {
    get(key: string): T | undefined {
      const value = map.get(key);
      if (value === undefined) return undefined;
      map.delete(key);
      map.set(key, value);
      return value;
    },
    set(key: string, value: T) {
      map.delete(key);
      map.set(key, value);
      while (map.size > max) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    clear() {
      map.clear();
    },
  };
}

const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Write `value()` to this browser's copy shortly (the last call per name wins). */
export function schedulePersist(name: string, value: () => unknown): void {
  const user = cacheUser();
  if (!user) return;
  const previous = persistTimers.get(name);
  if (previous) clearTimeout(previous);
  persistTimers.set(name, setTimeout(() => {
    persistTimers.delete(name);
    if (cacheUser() === user) void writeUserIdb(name, value());
  }, PERSIST_DELAY_MS));
}

/** Drop pending writes (sign-out / tests). */
export function cancelPendingPersists(prefix = ""): void {
  for (const [name, timer] of persistTimers) {
    if (!name.startsWith(prefix)) continue;
    clearTimeout(timer);
    persistTimers.delete(name);
  }
}

export type SharedRead<T> = { at: number; request: Promise<T> };

/** The read in flight for `key` if young, else a new one (kept for the next caller). */
export function sharedRead<T>(map: Map<string, SharedRead<T>>, key: string, start: () => Promise<T>): Promise<T> {
  const known = map.get(key);
  if (known && Date.now() - known.at < PREFETCH_FRESH_MS) return known.request;
  const request = start();
  const entry = { at: Date.now(), request };
  map.set(key, entry);
  // A failed read is not handed out later (the page reads again).
  request.catch(() => {
    if (map.get(key) === entry) map.delete(key);
  });
  return request;
}

/** A refused answer (ok: false) is not handed to the page either. */
export function forgetRead<T>(map: Map<string, SharedRead<T>>, key: string, request: Promise<T>): void {
  if (map.get(key)?.request === request) map.delete(key);
}

/** A young read in flight / answered for `key` (used once), else null. */
export function takeRead<T>(map: Map<string, SharedRead<T>>, key: string): Promise<T> | null {
  const known = map.get(key);
  map.delete(key);
  return known && Date.now() - known.at < PREFETCH_FRESH_MS ? known.request : null;
}

onUserScopedClear(() => cancelPendingPersists());
