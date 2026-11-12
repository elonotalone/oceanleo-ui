import { storedEditorProjectUrl, type StoredProjectItem, type TextLoader } from "../advanced-routes/stored-editor-project";

export type WebsiteLocalSourcePlan =
  | { kind: "ready"; source: string }
  | { kind: "remote"; url: string }
  | { kind: "fail"; error: string };

/** Files are read as authored; there is no page/section schema or blank replacement. */
export function planWebsiteLocalSource(item: StoredProjectItem): WebsiteLocalSourcePlan {
  if (typeof item.content === "string" && item.content.trim()) return { kind: "ready", source: item.content };
  const url = storedEditorProjectUrl(item);
  return url ? { kind: "remote", url } : { kind: "fail", error: "网站源文件尚未关联。" };
}

export type WebsiteSourceLoadOptions = {
  /** Extra attempts after the first one for transient failures (default 2). */
  retries?: number;
  /** Backoff before retry `attempt` (1-based). Tests inject 0. */
  delayMs?: (attempt: number) => number;
  /**
   * Re-issue a fresh signed address after HTTP 410 (`signed-url-expired`).
   * Returns the new URL, or null when the gateway cannot mint one.
   */
  refreshUrl?: (goneUrl: string) => Promise<string | null | undefined>;
  signal?: AbortSignal;
};

const DEFAULT_TRANSIENT_RETRIES = 2;

function isAbortError(caught: unknown): boolean {
  return (
    typeof caught === "object" &&
    caught !== null &&
    (caught as { name?: unknown }).name === "AbortError"
  );
}

/** Signed access URL expired (gateway answers 410 Gone). */
export function isWebsiteSourceGone(caught: unknown): boolean {
  return caught instanceof Error && /\bHTTP\s+410\b/i.test(caught.message);
}

/**
 * A network-level failure (gateway restarting, connection reset) or a
 * retryable HTTP status. Deterministic failures (403/404/422, parse errors)
 * are not transient and must surface.
 */
export function isTransientWebsiteSourceError(caught: unknown): boolean {
  if (isAbortError(caught)) return false;
  if (caught instanceof TypeError) return true;
  const message = caught instanceof Error ? caught.message : "";
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return true;
  }
  return /\bHTTP\s+(408|425|429|5\d\d)\b/i.test(message);
}

function defaultRetryDelayMs(attempt: number): number {
  return Math.min(4_000, 600 * 2 ** (attempt - 1));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

export async function hydrateWebsiteLocalSource(
  plan: WebsiteLocalSourcePlan,
  loadText: TextLoader,
  options: WebsiteSourceLoadOptions = {},
): Promise<{ ok: true; source: string } | { ok: false; error: string }> {
  if (plan.kind === "ready") {
    return { ok: true, source: plan.source };
  }
  if (plan.kind === "fail") {
    return { ok: false, error: plan.error };
  }
  const retries = Math.max(0, options.retries ?? DEFAULT_TRANSIENT_RETRIES);
  const delayMs = options.delayMs ?? defaultRetryDelayMs;
  let url = plan.url;
  let transientAttempts = 0;
  let refreshed = false;
  try {
    for (;;) {
      try {
        const text = await loadText(url);
        if (!text || !String(text).trim()) {
          return {
            ok: false,
            error: "远程网站工程为空，未改用空白稿覆盖原件。",
          };
        }
        return { ok: true, source: text };
      } catch (caught) {
        if (isAbortError(caught) || options.signal?.aborted) throw caught;
        if (isWebsiteSourceGone(caught) && options.refreshUrl && !refreshed) {
          // Signed URL outlived its TTL: mint a fresh one through the gateway.
          refreshed = true;
          const next = String((await options.refreshUrl(url)) || "").trim();
          if (next && next !== url) {
            url = next;
            continue;
          }
          throw caught;
        }
        if (
          isTransientWebsiteSourceError(caught) &&
          transientAttempts < retries
        ) {
          transientAttempts += 1;
          await sleep(delayMs(transientAttempts), options.signal);
          if (options.signal?.aborted) throw caught;
          continue;
        }
        throw caught;
      }
    }
  } catch (caught) {
    const detail =
      caught instanceof Error && caught.message.trim()
        ? caught.message.trim()
        : "远程网站工程无法读取";
    return {
      ok: false,
      error: `${detail}，未改用空白稿覆盖原件。`,
    };
  }
}
