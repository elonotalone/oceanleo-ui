// Own-task link recognition (wave 2026-11-10 contract C2).
//
// A task link is a URL on the current page origin, or on any OceanLeo family
// portal host (oceanleo.com / oceanleo.cn / oceanbizs.com and their
// subdomains), whose path is `/tasks/<uuid>` or `/history?task=<uuid>`.
// User-content domains (oceanleo.app, leoapp.cn) never count: familyForHost()
// gives them undefined. Whether the task is the *user's own* task is decided by
// the caller through the task API; this helper only parses.

import { familyForHost, runtimePageOrigin } from "../contracts/domain-family";

export interface TaskLink {
  taskId: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toUrl(raw: string): URL | null {
  const text = raw.trim();
  if (!text) return null;
  const withScheme = /^www\./i.test(text) ? `https://${text}` : text;
  if (!/^https?:\/\//i.test(withScheme)) return null;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

function isTaskOrigin(url: URL, currentOrigin: string): boolean {
  if (currentOrigin && url.origin === currentOrigin) return true;
  return familyForHost(url.hostname) !== undefined;
}

/**
 * Parse a task link. `currentOrigin` defaults to the running page's origin
 * (LeoDev slots and localhost count only as same-origin).
 */
export function parseTaskLink(
  url: string,
  currentOrigin: string = runtimePageOrigin(),
): TaskLink | null {
  const parsed = toUrl(url);
  if (!parsed || parsed.username || parsed.password) return null;
  if (!isTaskOrigin(parsed, currentOrigin)) return null;
  const path = parsed.pathname.replace(/\/+$/, "");
  const taskMatch = /^\/tasks\/([^/]+)$/.exec(path);
  let candidate: string | null = null;
  if (taskMatch) {
    try {
      candidate = decodeURIComponent(taskMatch[1]);
    } catch {
      return null;
    }
  } else if (path === "/history") {
    candidate = parsed.searchParams.get("task");
  }
  if (!candidate || !UUID_RE.test(candidate)) return null;
  return { taskId: candidate.toLowerCase() };
}
