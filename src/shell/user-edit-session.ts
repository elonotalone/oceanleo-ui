/**
 * Shared in-memory user-edit generation for every advanced editor.
 *
 * Autosave may run only after a person changed the open item. Load, hydrate,
 * collab remote, signed-URL refresh, preview raster, and the save itself must
 * not increment this counter. W1/W3 (and SelectionCommandGate) call
 * `recordUserMutation`; the workbench resets it when the open item changes.
 */

const generations = new Map<string, number>();
const listeners = new Set<() => void>();
let activeItemKey: string | null = null;

function emit(): void {
  for (const listener of [...listeners]) listener();
}

function normalizeKey(itemKey: string | null | undefined): string {
  return String(itemKey || "").trim();
}

export function userEditItemKey(
  item: { key?: string; id?: string } | null | undefined,
): string {
  if (!item) return "";
  return normalizeKey(item.key || item.id);
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
  const next = (generations.get(key) ?? 0) + 1;
  generations.set(key, next);
  emit();
  return next;
}

export function userMutationGeneration(itemKey: string): number {
  const key = normalizeKey(itemKey);
  if (!key) return 0;
  return generations.get(key) ?? 0;
}

export function resetUserMutation(itemKey: string): void {
  const key = normalizeKey(itemKey);
  if (!key) return;
  if ((generations.get(key) ?? 0) === 0) {
    generations.set(key, 0);
    return;
  }
  generations.set(key, 0);
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
    generations.set(previous, 0);
  }
  if (key) generations.set(key, 0);
  activeItemKey = key || null;
  emit();
}

/** Test isolation. Not part of the W1/W3 import contract. */
export function resetUserEditSession(): void {
  generations.clear();
  activeItemKey = null;
  emit();
}
