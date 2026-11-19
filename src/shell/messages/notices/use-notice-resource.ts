"use client";

import { useEffect, useState } from "react";
import type { NotificationResult } from "../../../api/notifications";

export const NOTICES_CHANGED = "oceanleo:notices-changed";

export function noticesChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTICES_CHANGED));
}

/** Retry read requests while online and visible; dispose all work on account/section changes. */
export function useNoticeResource<T>(enabled: boolean, load: () => Promise<NotificationResult<T>>) {
  const [state, setState] = useState<NotificationResult<T> | null>(null);
  useEffect(() => {
    setState(null);
    if (!enabled) return;
    let disposed = false;
    let busy = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (disposed || busy) return;
      clearTimeout(timer);
      if (document.hidden || navigator.onLine === false) {
        timer = setTimeout(poll, 60_000);
        return;
      }
      busy = true;
      let result: NotificationResult<T>;
      try { result = await load(); } catch { result = { ok: false }; }
      busy = false;
      if (disposed) return;
      setState(previous => result.ok || !previous?.ok ? result : previous);
      failures = result.ok ? 0 : failures + 1;
      timer = setTimeout(poll, failures ? Math.min(60_000, 1000 * 2 ** Math.min(failures - 1, 6)) : 60_000);
    };
    void poll();
    const wake = () => { void poll(); };
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    window.addEventListener(NOTICES_CHANGED, wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener(NOTICES_CHANGED, wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [enabled, load]);
  return enabled ? state : null;
}
