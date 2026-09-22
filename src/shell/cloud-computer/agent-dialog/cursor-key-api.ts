"use client";

import { accessToken } from "../../../lib/auth/client";
import { GATEWAY_BASE } from "../../../lib/auth/config";

export class CursorKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CursorKeyError";
  }
}

function humanDetail(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as { detail?: unknown; message?: unknown };
  const detail = record.detail;
  if (typeof detail === "string") return detail.trim();
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string") return message.trim();
  }
  return typeof record.message === "string" ? record.message.trim() : "";
}

export async function saveCursorKey(
  computerId: string,
  key: string,
): Promise<{ saved: true }> {
  const id = computerId.trim();
  if (!id) throw new CursorKeyError("没留下。");
  const token = await accessToken();
  if (!token) throw new CursorKeyError("没留下。");
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}/v1/computers/${encodeURIComponent(id)}/cursor-key`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key }),
      cache: "no-store",
      credentials: "include",
    });
  } catch {
    throw new CursorKeyError("没留下。");
  }
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok || !payload || typeof payload !== "object" || (payload as { saved?: unknown }).saved !== true) {
    throw new CursorKeyError(humanDetail(payload));
  }
  return { saved: true };
}
