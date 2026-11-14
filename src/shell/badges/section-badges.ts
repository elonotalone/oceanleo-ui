"use client";

import { useCallback, useEffect, useState } from "react";
import { accessToken } from "../../lib/auth/client";
import { gatewayBase } from "../../lib/auth/config";

export type BadgeSection = "tasks" | "chat" | "bay" | "schedules" | "devices";
export type SectionBadgeCounts = Record<BadgeSection, number>;
export type BadgeSnapshot = { sections: SectionBadgeCounts; total: number; account: { dot: boolean; reasons: string[] } };
const SECTIONS: BadgeSection[] = ["tasks", "chat", "bay", "schedules", "devices"];
export const EMPTY_BADGES: BadgeSnapshot = {
  sections: { tasks: 0, chat: 0, bay: 0, schedules: 0, devices: 0 }, total: 0,
  account: { dot: false, reasons: [] },
};

export function badgeSectionForHref(href: string): BadgeSection | undefined {
  const sections: Partial<Record<string, BadgeSection>> = { "/history": "tasks", "/leochat": "chat", "/bay": "bay", "/schedules": "schedules", "/devices": "devices" };
  return sections[href];
}

export function readBadgeSnapshot(value: unknown): BadgeSnapshot {
  const data = value as Partial<BadgeSnapshot> | null;
  const sections = { ...EMPTY_BADGES.sections };
  for (const key of SECTIONS) {
    const n = data?.sections?.[key];
    if (typeof n === "number" && Number.isSafeInteger(n) && n > 0) sections[key] = n;
  }
  return { sections, total: Object.values(sections).reduce((a, b) => a + b, 0),
    account: { dot: data?.account?.dot === true,
      reasons: Array.isArray(data?.account?.reasons) ? data.account.reasons.filter((r): r is string => typeof r === "string") : [] } };
}

async function request(path: string, signal: AbortSignal, body?: unknown): Promise<unknown> {
  const token = await accessToken();
  if (!token || signal.aborted) return null;
  const response = await fetch(`${gatewayBase()}${path}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", signal,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 404 || response.status === 503) return null;
  if (!response.ok) throw new Error("badges_unavailable");
  return response.json();
}

/** One poller owned by the persistent sidebar, including its collapsed form. */
export function useWebSectionBadges(accountKey: string | null, activePath: string) {
  const [state, setState] = useState<{ key: string | null; data: BadgeSnapshot }>({ key: null, data: EMPTY_BADGES });
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey(key => key + 1), []);
  useEffect(() => {
    if (!accountKey) return;
    const controller = new AbortController();
    let busy = false;
    const poll = async () => {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        const task = /^\/tasks\/([^/?#]+)$/.exec(activePath)?.[1];
        if (task) await request("/v1/badges/seen", controller.signal, { section: "tasks", ids: [decodeURIComponent(task)] });
        const data = readBadgeSnapshot(await request("/v1/badges", controller.signal));
        if (!controller.signal.aborted) setState({ key: accountKey, data });
      } catch { /* Keep the last acknowledged counts through a transient outage. */ }
      finally { busy = false; }
    };
    void poll();
    const tick = setInterval(() => { void poll(); }, 30_000);
    const focus = () => { void poll(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      controller.abort(); clearInterval(tick);
      window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus);
    };
  }, [accountKey, activePath, refreshKey]);
  return { ...(state.key === accountKey ? state.data : EMPTY_BADGES), refresh };
}
