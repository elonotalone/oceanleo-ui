"use client";

import type { LibraryItem } from "./library-data";

const DATABASE_NAME = "oceanleo-advanced-recovery";
const STORE_NAME = "drafts";
const DATABASE_VERSION = 1;
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const mutationQueues = new Map<string, Promise<void>>();

export interface AdvancedRecoveryRecord {
  key: string;
  editorId: string;
  revision: string | number;
  updatedAt: number;
  payload: unknown;
}

export function advancedRecoveryKey(
  editorId: string,
  item: LibraryItem,
): string {
  const root = String(
    item.meta.root_asset_id || item.meta.parent_asset_id || item.id || item.key,
  ).slice(0, 600);
  return `${editorId}:${root}:${String(item.id).slice(0, 600)}`;
}

function openRecoveryDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () =>
      reject(request.error || new Error("Recovery database unavailable"));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withRecoveryStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openRecoveryDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error("Recovery operation failed"));
      transaction.onabort = () =>
        reject(transaction.error || new Error("Recovery transaction aborted"));
    });
  } finally {
    database.close();
  }
}

export async function writeAdvancedRecovery(
  record: AdvancedRecoveryRecord,
): Promise<void> {
  await enqueueRecoveryMutation(record.key, async () => {
    await withRecoveryStore("readwrite", (store) => store.put(record));
  });
}

export async function readAdvancedRecovery(
  key: string,
): Promise<AdvancedRecoveryRecord | null> {
  const record = await withRecoveryStore<AdvancedRecoveryRecord | undefined>(
    "readonly",
    (store) => store.get(key),
  );
  if (!record || record.key !== key) return null;
  if (
    !Number.isFinite(record.updatedAt) ||
    Date.now() - record.updatedAt > MAX_DRAFT_AGE_MS
  ) {
    await deleteAdvancedRecovery(key).catch(() => undefined);
    return null;
  }
  return record;
}

export async function deleteAdvancedRecovery(key: string): Promise<void> {
  await enqueueRecoveryMutation(key, async () => {
    await withRecoveryStore("readwrite", (store) => store.delete(key));
  });
}

function enqueueRecoveryMutation(
  key: string,
  mutation: () => Promise<void>,
): Promise<void> {
  const previous = mutationQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(mutation);
  mutationQueues.set(key, next);
  const cleanup = () => {
    if (mutationQueues.get(key) === next) mutationQueues.delete(key);
  };
  void next.then(cleanup, cleanup);
  return next;
}
