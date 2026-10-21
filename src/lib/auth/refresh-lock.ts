import { NavigatorLockAcquireTimeoutError } from "@supabase/supabase-js";

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

  const abort = acquireTimeout > 0 ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (abort) timer = setTimeout(() => abort.abort(), acquireTimeout);
  try {
    return await locks.request(
      name,
      {
        mode: "exclusive",
        ...(acquireTimeout === 0 ? { ifAvailable: true } : {}),
        ...(abort ? { signal: abort.signal } : {}),
      },
      (lock) => {
        if (!lock) {
          throw new NavigatorLockAcquireTimeoutError(
            `Could not acquire auth refresh lock "${name}" immediately.`,
          );
        }
        // The timeout limits acquisition only. Once this callback starts we
        // own the lock, so aborting its signal could make another caller
        // mistake a slow refresh for a stuck lock and run concurrently.
        if (timer !== undefined) clearTimeout(timer);
        return fn();
      },
    );
  } catch (caught) {
    // Supabase's auto-refresh loop treats only this SDK error as an
    // acquisition timeout. Keep callback/refresh failures untouched so they
    // cannot be mistaken for lock contention or replayed.
    const isAbortError =
      caught !== null &&
      typeof caught === "object" &&
      "name" in caught &&
      caught.name === "AbortError";
    if (abort?.signal.aborted && isAbortError) {
      throw new NavigatorLockAcquireTimeoutError(
        `Acquiring auth refresh lock "${name}" timed out after ${acquireTimeout}ms.`,
      );
    }
    throw caught;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
