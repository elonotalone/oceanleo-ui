"use client";

// 四个程序的 key 都走合同 I3 的同一路由：POST/DELETE /v1/computers/{id}/programs/{program}/key。
// key 只进请求体，不落地、不进 localStorage、不进日志。

import { accessToken } from "../../../lib/auth/client";
import { GATEWAY_BASE } from "../../../lib/auth/config";
import { isWsProgram } from "./parse";
import type { WsProgram } from "./types";

export class ProgramKeyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProgramKeyError";
    this.code = code;
  }
}

function detailOf(payload: unknown): { code: string; message: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { code: "", message: "" };
  const detail = (payload as { detail?: unknown }).detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const record = detail as { code?: unknown; message?: unknown };
    return {
      code: typeof record.code === "string" ? record.code.trim() : "",
      message: typeof record.message === "string" ? record.message.trim() : "",
    };
  }
  if (typeof detail === "string") return { code: "", message: detail.trim() };
  const message = (payload as { message?: unknown }).message;
  return { code: "", message: typeof message === "string" ? message.trim() : "" };
}

async function request(
  computerId: string,
  program: WsProgram,
  init: { method: "POST" | "DELETE"; key?: string; provider?: string },
): Promise<Record<string, unknown>> {
  const id = computerId.trim();
  if (!id) throw new ProgramKeyError("computer_not_found", "");
  const token = await accessToken();
  if (!token) throw new ProgramKeyError("not_logged_in", "");
  const query =
    init.method === "DELETE" && init.provider ? `?provider=${encodeURIComponent(init.provider)}` : "";
  let res: Response;
  try {
    res = await fetch(
      `${GATEWAY_BASE}/v1/computers/${encodeURIComponent(id)}/programs/${encodeURIComponent(program)}/key${query}`,
      {
        method: init.method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(init.method === "POST"
          ? { body: JSON.stringify({ key: init.key ?? "", provider: init.provider ?? "" }) }
          : {}),
        cache: "no-store",
        credentials: "include",
      },
    );
  } catch {
    throw new ProgramKeyError("dialog_unreachable", "");
  }
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const detail = detailOf(payload);
    throw new ProgramKeyError(detail.code || "node_error", detail.message);
  }
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

export async function saveProgramKey(
  computerId: string,
  program: WsProgram,
  key: string,
  provider = "",
): Promise<{ ok: true; auth: string }> {
  if (!isWsProgram(program)) throw new ProgramKeyError("invalid_argument", "");
  const payload = await request(computerId, program, { method: "POST", key, provider });
  if (payload.ok !== true) throw new ProgramKeyError("node_error", "");
  return { ok: true, auth: typeof payload.auth === "string" ? payload.auth : "key" };
}

export async function removeProgramKey(
  computerId: string,
  program: WsProgram,
  provider = "",
): Promise<{ ok: true }> {
  if (!isWsProgram(program)) throw new ProgramKeyError("invalid_argument", "");
  const payload = await request(computerId, program, { method: "DELETE", provider });
  if (payload.ok !== true) throw new ProgramKeyError("node_error", "");
  return { ok: true };
}
