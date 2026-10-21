/**
 * Serialize GoTrue refresh across tabs on the same device.
 *
 * Rotation is on and the reuse window is short. Five Computers programs plus
 * ordinary tabs all share one family cookie, so two refresh_token grants at
 * once mint a real 401 and supabase-js wipes the session. Web Locks keep one
 * refresh in flight; a dead tab releases the lock automatically.
 */
export async function browserAuthLock<R>(
  name: string,
  acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks?.request) return fn();

  const exclusive = { mode: "exclusive" as const };
  if (acquireTimeout <= 0) {
    return locks.request(name, exclusive, () => fn());
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), acquireTimeout);
  try {
    return await locks.request(
      name,
      { ...exclusive, signal: abort.signal },
      () => fn(),
    );
  } catch {
    // Timed out or the previous holder vanished. Steal rather than refresh
    // unlocked — unlocked is the multi-tab race that signs the person out.
    return locks.request(name, { ...exclusive, steal: true }, () => fn());
  } finally {
    clearTimeout(timer);
  }
}
