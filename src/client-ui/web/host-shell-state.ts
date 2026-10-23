/**
 * Host-mode shell path and session. Lives under web/ so RN core stays
 * window-free. Unconfigured website callers keep the Next/portal values.
 */

import { useSyncExternalStore } from "react";
import {
  getClientHostConfig,
  onClientHostConfigChange,
} from "../host-config";
import type { HostSessionPort } from "../host-ports";

export const HOST_LOCATION_EVENT = "oceanleo:host-location";

type PatchedHistory = History & { __oceanleoHostLocation?: boolean };

export function hostAwareActivePath(
  nextPathname: string,
  locationPathname: string,
  hostConfigured: boolean,
): string {
  const next = nextPathname || "/";
  if (!hostConfigured) return next;
  return locationPathname || next;
}

export function isClientHostConfigured(): boolean {
  return Boolean(getClientHostConfig());
}

export function readHostLocationPath(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

export function patchHostHistory(): void {
  if (typeof window === "undefined") return;
  if (!getClientHostConfig()) return;
  const history = window.history as PatchedHistory;
  if (!history || history.__oceanleoHostLocation) return;
  history.__oceanleoHostLocation = true;
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    history[method] = function patched(
      this: History,
      ...args: Parameters<History["pushState"]>
    ) {
      const result = original.apply(this, args as [unknown, string, string?]);
      window.dispatchEvent(new Event(HOST_LOCATION_EVENT));
      return result;
    };
  }
}

export function subscribeHostLocation(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  patchHostHistory();
  const onConfig = () => {
    patchHostHistory();
    onChange();
  };
  window.addEventListener("popstate", onChange);
  window.addEventListener(HOST_LOCATION_EVENT, onChange);
  const off = onClientHostConfigChange(onConfig);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(HOST_LOCATION_EVENT, onChange);
    off();
  };
}

export function useHostAwarePathname(nextPathname: string): string {
  const configured = useSyncExternalStore(
    onClientHostConfigChange,
    isClientHostConfigured,
    () => false,
  );
  const live = useSyncExternalStore(
    subscribeHostLocation,
    readHostLocationPath,
    () => nextPathname,
  );
  return hostAwareActivePath(nextPathname, live, configured);
}

export function resolveHostSession(
  hostSession: HostSessionPort | null | undefined,
): HostSessionPort | null {
  if (!getClientHostConfig()) return null;
  return hostSession ?? null;
}

export async function readShellUserEmail(
  hostSession: HostSessionPort | null | undefined,
  fallback: () => Promise<string | null>,
): Promise<string | null> {
  const session = resolveHostSession(hostSession);
  if (session) {
    const email = await session.getUserEmail();
    if (email) return email;
  }
  return fallback();
}

export function pushHostLocation(
  href: string,
  hostPush?: (next: string) => void,
): boolean {
  if (!getClientHostConfig()) return false;
  if (typeof hostPush === "function") {
    hostPush(href);
    return true;
  }
  if (typeof window === "undefined") return true;
  window.history.pushState({}, "", href);
  window.dispatchEvent(new Event(HOST_LOCATION_EVENT));
  return true;
}
