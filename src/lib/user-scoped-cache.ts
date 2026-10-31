"use client";

// ============================================================================
// User-scoped client caches (2026-10-31: task switch + model pill speed)
// ----------------------------------------------------------------------------
// What a page read for the signed-in user (a task's conversation, a computer's
// model catalog, a computer row) is kept in this browser so the next open paints
// at once and refreshes in the background. Every key carries the user id; a
// sign-out (or a different user signing in) drops everything: memory caches
// registered with `onUserScopedClear`, the `oceanleo.uc:` localStorage keys and
// the IndexedDB store. Nothing here is a source of truth; a miss only means the
// page reads the gateway as before.
//
// The user id is a hint until confirmed: the last id seen (persisted) is used
// at once, `setCacheUser` (from an auth read or the auth-state event) corrects it.
// This module never imports the auth client (it stays cheap to load and test);
// it listens for the same window event (`AUTH_STATE_EVENT`).
// ============================================================================

/** Same value as `AUTH_STATE_EVENT` in lib/auth/client (kept literal: no auth import here). */
export const USER_CACHE_AUTH_EVENT = "oceanleo:auth-state";
const USER_HINT_KEY = "oceanleo.uc.user";
const LOCAL_PREFIX = "oceanleo.uc:";
const IDB_NAME = "oceanleo-user-cache";
const IDB_STORE = "entries";
const IDB_INDEX_KEY = "idb-index";

let user: string | null | undefined;
let listening = false;
const clearers = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function listen(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener(USER_CACHE_AUTH_EVENT, (event) => {
    const detail = (event as CustomEvent<{ event?: string; userId?: string | null } | undefined>).detail;
    if (!detail) return;
    if (detail.userId) setCacheUser(detail.userId);
    else if (detail.event === "SIGNED_OUT" || detail.event === "INITIAL_SESSION") setCacheUser(null);
  });
}

/** The signed-in user these caches belong to ("" = unknown: nothing is read or written). */
export function cacheUser(): string {
  listen();
  // Never infer identity from browser storage. Until the auth bootstrap calls
  // setCacheUser, caches stay inaccessible so a previous account cannot flash
  // in the UI during session restoration.
  return user || "";
}

/** The confirmed user (null = signed out). A change of user drops every cache first. */
export function setCacheUser(next: string | null): void {
  listen();
  const previous = cacheUser();
  const id = next || "";
  if (previous && previous !== id) clearUserScopedCaches();
  user = id || null;
  // Identity is process-local and must come from the trusted auth bootstrap;
  // do not persist a hint that could be mistaken for the current account.
  try { storage()?.removeItem(USER_HINT_KEY); } catch { /* private mode */ }
}

/** Register a memory cache to drop on sign-out / user change. Returns the unregister. */
export function onUserScopedClear(clear: () => void): () => void {
  clearers.add(clear);
  return () => clearers.delete(clear);
}

/** Drop every user-scoped cache (memory, localStorage, IndexedDB). */
export function clearUserScopedCaches(): void {
  for (const clear of [...clearers]) {
    try {
      clear();
    } catch {
      /* a cache that cannot clear itself is still dropped below */
    }
  }
  const store = storage();
  if (store) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key && key.startsWith(LOCAL_PREFIX)) keys.push(key);
      }
      for (const key of keys) store.removeItem(key);
    } catch {
      /* private mode */
    }
  }
  idbIndex = null;
  try {
    if (typeof indexedDB !== "undefined") indexedDB.deleteDatabase(IDB_NAME);
  } catch {
    /* unavailable */
  }
}

function localKey(name: string): string {
  const id = cacheUser();
  return id ? `${LOCAL_PREFIX}${id}:${name}` : "";
}

/** Read a small JSON value kept for the current user (undefined when unknown / absent). */
export function readUserJson<T>(name: string): T | undefined {
  const key = localKey(name);
  if (!key) return undefined;
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** Keep a small JSON value for the current user (quota errors are ignored). */
export function writeUserJson(name: string, value: unknown): void {
  const key = localKey(name);
  if (!key) return;
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

// ---------------------------------------------------------------------------
// IndexedDB: larger values (task conversations, transcripts), bounded LRU.
// ---------------------------------------------------------------------------

/** Most entries kept per user across IndexedDB (oldest touched dropped first). */
export const USER_IDB_MAX_ENTRIES = 80;
let idbIndex: Map<string, number> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest | void,
): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, mode);
      const req = run(tx.objectStore(IDB_STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(req ? (req.result as T) : undefined);
      };
      tx.onerror = () => {
        db.close();
        resolve(undefined);
      };
      tx.onabort = () => {
        db.close();
        resolve(undefined);
      };
    } catch {
      db.close();
      resolve(undefined);
    }
  });
}

function loadIndex(): Map<string, number> {
  if (idbIndex) return idbIndex;
  const saved = readUserJson<Array<[string, number]>>(IDB_INDEX_KEY);
  idbIndex = new Map(Array.isArray(saved) ? saved : []);
  return idbIndex;
}

/** Read a value kept for the current user in IndexedDB. */
export async function readUserIdb<T>(name: string): Promise<T | undefined> {
  const id = cacheUser();
  if (!id) return undefined;
  const value = await withStore<T>("readonly", (store) => store.get(`${id}:${name}`));
  // The user changed while reading: never hand the previous user's value out.
  return cacheUser() === id ? value : undefined;
}

/** Keep a value for the current user in IndexedDB (bounded; failures are silent). */
export function writeUserIdb(name: string, value: unknown): Promise<void> {
  const id = cacheUser();
  if (!id) return Promise.resolve();
  const index = loadIndex();
  index.delete(name);
  index.set(name, Date.now());
  const evicted: string[] = [];
  while (index.size > USER_IDB_MAX_ENTRIES) {
    const oldest = index.keys().next().value;
    if (oldest === undefined) break;
    index.delete(oldest);
    evicted.push(oldest);
  }
  writeUserJson(IDB_INDEX_KEY, [...index]);
  return withStore("readwrite", (store) => {
    for (const name of evicted) store.delete(`${id}:${name}`);
    return store.put(value, `${id}:${name}`);
  }).then(() => undefined);
}

/** Test seam: forget the in-memory user and index (storage is left as is). */
export function resetUserScopedCacheForTests(): void {
  user = undefined;
  idbIndex = null;
}
