const PREFIX = "oceanleo.acp.unread.";

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function keyFor(computerId: string, program: string): string {
  return `${PREFIX}${computerId || "local"}.${program || "_"}`;
}

export function readUnreadSessions(computerId: string, program: string): string[] {
  try {
    const raw = storage()?.getItem(keyFor(computerId, program));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && Boolean(id));
  } catch {
    return [];
  }
}

export function writeUnreadSessions(computerId: string, program: string, ids: string[]): void {
  try {
    storage()?.setItem(keyFor(computerId, program), JSON.stringify([...new Set(ids)]));
  } catch {
    /* Storage may be unavailable. */
  }
}
