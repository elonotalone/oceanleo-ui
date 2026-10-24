"use client";

// W09B — the "copy to project" picker needs the caller's project list. The shared
// package has no projects client (the portal's lives in oceanleo/lib/projects.ts),
// so this is the smallest read-only wrapper over `GET /v1/projects`.
// Only projects the caller can edit are offered as copy targets.

import { accessToken } from "../../../lib/auth/client";
import { GATEWAY_BASE } from "../../../lib/auth/config";

export interface CopyTargetProject {
  id: string;
  name: string;
  icon: string;
  role: string;
}

/** Rows that are real project workspaces the caller may write into. */
export function copyTargetsFrom(items: unknown): CopyTargetProject[] {
  if (!Array.isArray(items)) return [];
  const out: CopyTargetProject[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) continue;
    // `kind='website'` rows are not project workspaces (01-facts F8).
    if (row.kind === "website") continue;
    const role = typeof row.role === "string" && row.role ? row.role : "owner";
    if (role !== "owner" && role !== "edit") continue;
    out.push({
      id,
      name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : id,
      icon: typeof row.icon === "string" ? row.icon : "",
      role,
    });
  }
  return out;
}

export async function listCopyTargetProjects(): Promise<
  { ok: true; data: CopyTargetProject[] } | { ok: false; status: number }
> {
  let token: string | null = null;
  try {
    token = await accessToken();
  } catch {
    token = null;
  }
  if (!token) return { ok: false, status: 401 };
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE.replace(/\/+$/, "")}/v1/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0 };
  }
  if (!res.ok) return { ok: false, status: res.status };
  const data: unknown = await res.json().catch(() => null);
  const items = data && typeof data === "object" ? (data as Record<string, unknown>).items : null;
  return { ok: true, data: copyTargetsFrom(items) };
}
