// ============================================================================
// What HistoryDetail read for a task / session, kept for the life of the page
// (2026-10-31 W5). Switching back to a task already opened shows it at once
// (no loading cover); the read runs again in the background and only replaces
// what is shown when the task's shape changed. A TaskDetail served from here is
// marked stale: AgentChat shows it immediately and reads the task once more
// (it may have moved on while the user was elsewhere).
// ============================================================================

const details = new Map<string, unknown>();
const staleSeeds = new WeakSet<object>();
const MAX_ENTRIES = 100;

export function historyDetailCacheKey(siteId: string, selection: string): string {
  return `${siteId}\u0000${selection}`;
}

export function storeHistoryDetail(key: string, value: unknown): void {
  details.delete(key);
  details.set(key, value);
  if (details.size > MAX_ENTRIES) {
    const oldest = details.keys().next().value;
    if (oldest !== undefined) details.delete(oldest);
  }
}

/** `seeds`: the TaskDetail objects inside the value, marked stale as they are served again. */
export function peekHistoryDetail<T>(key: string, seeds: (value: T) => Array<object | null | undefined>): T | undefined {
  if (!details.has(key)) return undefined;
  const value = details.get(key) as T;
  for (const seed of seeds(value)) if (seed) staleSeeds.add(seed);
  return value;
}

/** True for a TaskDetail that came back from this cache (not from a read just now). */
export function isStaleTaskSeed(seed: object | null | undefined): boolean {
  return Boolean(seed && staleSeeds.has(seed));
}

/** Test seam. */
export function clearHistoryDetailCache(): void {
  details.clear();
}
