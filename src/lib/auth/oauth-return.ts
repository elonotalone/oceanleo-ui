import type { SupabaseClient } from "@supabase/supabase-js";
import { isLeoDevPreviewHost } from "./config";

type ReturnState = "idle" | "pending" | "error";
let state: ReturnState = "idle";
let completion: Promise<void> | null = null;
let active: { client: SupabaseClient; code: string; cancel?: () => void } | null = null;
const listeners = new Set<() => void>();
const RETURN_PARAMS = ["code", "error", "error_code", "error_description"];

/** A provider retry must not carry the previous one-time code back again. */
export function cleanOauthRedirect(href: string): string {
  try {
    const url = new URL(href);
    RETURN_PARAMS.forEach((key) => url.searchParams.delete(key));
    return url.href;
  } catch {
    return href;
  }
}

export function previewOauthReturnCode(): string | null {
  if (typeof window === "undefined" || !isLeoDevPreviewHost(window.location.host)) return null;
  const params = new URL(window.location.href).searchParams;
  return params.get("code")?.trim() || (RETURN_PARAMS.slice(1).some((key) => params.has(key)) ? "provider-error" : null);
}

export function clearBrowserOauthReturnError(): void {
  if (state === "error") { completion = null; publish("idle"); }
}

export function browserOauthReturnState(): ReturnState {
  return state === "idle" && previewOauthReturnCode() ? "pending" : state;
}

export function subscribeBrowserOauthReturn(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function publish(next: ReturnState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

/** One SDK exchange owns the return; missing proof and provider errors are visible. */
export function completeBrowserOauthReturn(client: SupabaseClient, code: string, options?: { initialize: boolean; hasProof: boolean; cancel?: () => void; sessionConfirmed?: () => boolean }): void {
  if (completion && active?.client === client && active.code === code) return;
  active?.cancel?.();
  const attempt = { client, code, cancel: options?.cancel };
  active = attempt;
  publish("pending");
  completion = (async () => {
    let next: ReturnState = "error";
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (options && !options.hasProof) return;
      const operation = options?.initialize
        ? client.auth.initialize().then((result) => !result.error && !!options.sessionConfirmed?.())
        : client.auth.exchangeCodeForSession(code).then((result) => !result.error && !!result.data.session);
      const success = await Promise.race([
        operation,
        new Promise<never>((_, reject) => { timer = setTimeout(() => { options?.cancel?.(); reject(new Error("OAuth return timed out")); }, 12_000); }),
      ]);
      if (success) next = "idle";
    } catch {
      // Neither codes nor provider URLs belong in an error shown to a user.
    } finally {
      if (timer) clearTimeout(timer);
      if (active !== attempt) return;
      if (typeof window !== "undefined" && previewOauthReturnCode() === code) {
        window.history.replaceState(window.history.state, "", cleanOauthRedirect(window.location.href));
      }
      publish(next);
    }
  })();
}

export async function waitForBrowserOauthReturn(): Promise<boolean> {
  await completion;
  return state !== "error";
}
