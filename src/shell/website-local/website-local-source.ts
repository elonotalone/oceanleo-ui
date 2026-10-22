import { blankWebsiteSource } from "./blank-website-source";
import { parseWebsiteSource } from "../website-source-carrier/website-source-validate";
import type { WebsiteSource } from "../website-source-carrier/website-source-schema";
import {
  storedEditorProjectUrl,
  unwrapStoredEditorProject,
  type StoredProjectItem,
  type TextLoader,
} from "../advanced-routes/stored-editor-project";

export type WebsiteLocalSourcePlan =
  | { kind: "ready"; source: WebsiteSource }
  | { kind: "blank"; source: WebsiteSource }
  | { kind: "remote"; url: string }
  | { kind: "fail"; error: string };

function parseInlineWebsite(raw: unknown, fallback: string): WebsiteLocalSourcePlan {
  try {
    const source =
      typeof raw === "string"
        ? parseWebsiteSource(raw)
        : parseWebsiteSource(JSON.stringify(raw));
    return { kind: "ready", source };
  } catch (caught) {
    const detail =
      caught instanceof Error && caught.message.trim()
        ? caught.message.trim()
        : fallback;
    return {
      kind: "fail",
      error: `${detail}，未改用空白稿覆盖原件。`,
    };
  }
}

export function parseStoredWebsiteSource(text: string): WebsiteSource {
  const unwrapped = unwrapStoredEditorProject(text);
  if (typeof unwrapped === "string") return parseWebsiteSource(unwrapped);
  return parseWebsiteSource(JSON.stringify(unwrapped));
}

export function planWebsiteLocalSource(
  item: StoredProjectItem & { title?: string },
): WebsiteLocalSourcePlan {
  const raw =
    item.meta && typeof item.meta === "object"
      ? item.meta.websiteSource
      : undefined;
  if (raw && typeof raw === "object") {
    return parseInlineWebsite(raw, "网站工程源无法解析");
  }
  const content = typeof item.content === "string" ? item.content.trim() : "";
  if (content.startsWith("{")) {
    return parseInlineWebsite(content, "网站工程源无法解析");
  }
  const url = storedEditorProjectUrl(item);
  if (url) {
    return { kind: "remote", url };
  }
  if (item.artifactId) {
    return {
      kind: "fail",
      error:
        "这份网站没有可在本地打开的 website-source@1 工程，未改用空白稿覆盖原件。",
    };
  }
  return {
    kind: "blank",
    source: blankWebsiteSource(item.title || "本地可编辑的网站工程"),
  };
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
): Promise<{ ok: true; source: WebsiteSource } | { ok: false; error: string }> {
  if (plan.kind === "ready" || plan.kind === "blank") {
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
        return { ok: true, source: parseStoredWebsiteSource(text) };
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
