"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener("hashchange", onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("hashchange", onChange);
  };
}

// Browser-only locations are unknown on the server and during hydration.
// Route-aware callers should supply their server route instead when available.
export function useHydratedPageHref(): string {
  return useSyncExternalStore(subscribe, () => window.location.href, () => "");
}
