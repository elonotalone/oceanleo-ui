/**
 * 在线状态（awareness）：本机身份写进 `user` 字段（TipTap 协同光标也读这个字段），
 * 房间里其他人从 awareness 读出来；他们自报的颜色一律不信，按用户 id 重新算。
 */
import type { Awareness } from "y-protocols/awareness";
import type { CollabUser } from "./index";
import { colorForUser } from "./color";

export const AWARENESS_USER_FIELD = "user";

function safeAvatarUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return /^https?:\/\//i.test(value) ? value : null;
}

/** 把任意来源（服务端票、他人 awareness）的用户信息收成 `CollabUser`；缺 id 返回 null。 */
export function sanitizeCollabUser(raw: unknown): CollabUser | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  if (!id) return null;
  const name = typeof r.name === "string" ? r.name.slice(0, 80) : "";
  return { id, name, color: colorForUser(id), avatar_url: safeAvatarUrl(r.avatar_url) };
}

/** 票里的 self 的颜色以服务端为准，但缺失/异常时按同一算法兜底。 */
export function normalizeSelf(raw: unknown, fallbackId = ""): CollabUser {
  const user = sanitizeCollabUser(raw);
  if (user) {
    const claimed = (raw as Record<string, unknown>).color;
    return typeof claimed === "string" && /^hsl\(\d{1,3}, \d{1,3}%, \d{1,3}%\)$/.test(claimed)
      ? { ...user, color: claimed }
      : user;
  }
  return { id: fallbackId, name: "", color: colorForUser(fallbackId), avatar_url: null };
}

export function setLocalUser(awareness: Awareness, user: CollabUser): void {
  awareness.setLocalStateField(AWARENESS_USER_FIELD, {
    id: user.id,
    name: user.name,
    color: user.color,
    avatar_url: user.avatar_url,
  });
}

/** 其他人（按用户 id 去重，不含自己的任何标签页）。顺序：先进房间的在前（clientID 升序）。 */
export function readPeers(awareness: Awareness, selfId: string): CollabUser[] {
  const seen = new Set<string>();
  const peers: CollabUser[] = [];
  const entries = Array.from(awareness.getStates().entries()).sort((a, b) => a[0] - b[0]);
  for (const [clientId, state] of entries) {
    if (clientId === awareness.clientID) continue;
    const user = sanitizeCollabUser((state as Record<string, unknown> | null)?.[AWARENESS_USER_FIELD]);
    if (!user || user.id === selfId || seen.has(user.id)) continue;
    seen.add(user.id);
    peers.push(user);
  }
  return peers;
}

export function sameUsers(a: readonly CollabUser[], b: readonly CollabUser[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.id !== y.id || x.name !== y.name || x.color !== y.color || x.avatar_url !== y.avatar_url) return false;
  }
  return true;
}
