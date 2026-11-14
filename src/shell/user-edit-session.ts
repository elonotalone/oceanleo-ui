import type { AppSession } from "../lib/app-session";
/**
 * Shared in-memory user-edit generation for every advanced editor.
 *
 * Autosave may run only after a person changed the open item. Load, hydrate,
 * collab remote, signed-URL refresh, preview raster, and the save itself must
 * not increment this counter. W1/W3 (and SelectionCommandGate) call
 * `recordUserMutation`; the workbench resets it when the open item changes.
 */

const generations = new Map<string, { generation: number; at: number }>();
const listeners = new Set<() => void>();
let activeItemKey: string | null = null;

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function normalizeKey(itemKey: string | null | undefined): string {
  return String(itemKey || "").trim();
}

export function userEditItemKey(
  item: { key?: string; id?: string; artifactId?: string } | null | undefined,
): string {
  if (!item) return "";
  // `item.key` is `artifact:<id>:<revision>` and changes on every persist.
  // Mutation generation must stay on the open picture, not the revision.
  return normalizeKey(item.artifactId || item.id || item.key);
}

export function subscribeUserEditSession(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function recordUserMutation(itemKey: string): number {
  const key = normalizeKey(itemKey);
  if (!key) return 0;
  const next = (generations.get(key)?.generation ?? 0) + 1;
  const now = performance.now();
  const event = typeof window === "undefined" ? undefined : window.event;
  const at = event?.isTrusted && event.timeStamp > 0 && event.timeStamp <= now ? event.timeStamp : now;
  generations.set(key, { generation: next, at });
  emit();
  return next;
}

export function userMutationGeneration(itemKey: string): number {
  const key = normalizeKey(itemKey);
  if (!key) return 0;
  return generations.get(key)?.generation ?? 0;
}

/** Input timestamp retained through React rendering, for edit-to-ack measurements. */
export function userMutationAt(itemKey: string): number | undefined {
  return generations.get(normalizeKey(itemKey))?.at || undefined;
}

export function resetUserMutation(itemKey: string): void {
  const key = normalizeKey(itemKey);
  if (!key) return;
  if ((generations.get(key)?.generation ?? 0) === 0) {
    generations.set(key, { generation: 0, at: 0 });
    return;
  }
  generations.set(key, { generation: 0, at: 0 });
  emit();
}

export function bindActiveUserEditItem(itemKey: string | null): void {
  const key = normalizeKey(itemKey) || null;
  if (activeItemKey === key) return;
  activeItemKey = key;
  emit();
}

export function activeUserEditItemKey(): string | null {
  return activeItemKey;
}

/**
 * Workbench entry: opening or switching the item zeros the generation so a
 * previous visit cannot autosave the newly opened body.
 */
export function syncOpenUserEditItem(itemKey: string): void {
  const key = normalizeKey(itemKey);
  const previous = activeItemKey;
  if (previous && previous !== key) {
    generations.set(previous, { generation: 0, at: 0 });
  }
  if (key) generations.set(key, { generation: 0, at: 0 });
  activeItemKey = key || null;
  emit();
}

/** Test isolation. Not part of the W1/W3 import contract. */
export function resetUserEditSession(): void {
  generations.clear();
  activeItemKey = null;
  emit();
}

/** Serialize history CAS writes and retain the last server receipt until React catches up. */
export class SessionSnapshotQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private receipt: AppSession | null = null;
  run<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
  current(observed: AppSession | null): AppSession | null {
    if (!observed || observed.id !== this.receipt?.id) return observed;
    return this.receipt.revision > observed.revision ? this.receipt : observed;
  }
  accept(session: AppSession | undefined) { if (session) this.receipt = session; }
}
