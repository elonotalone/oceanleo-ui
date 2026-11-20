"use client";

// Gateway client for the one account name (contract §1.1):
//   GET  /v1/account/name              -> { name, can_change_at }
//   PUT  /v1/account/name { name }     -> { name, can_change_at } | 409/422/429/503 { detail: { code, can_change_at? } }
//   GET  /v1/account/name/available    -> { available, code }
// Failures come back as codes; the page picks the sentence in the current language.

import { AUTH_STATE_EVENT, accessToken } from "../auth/client";
import { GATEWAY_BASE } from "../auth/config";

export type AccountNameCode =
  | "name_taken"
  | "name_invalid"
  | "name_reserved"
  | "name_change_too_soon"
  | "name_unavailable"
  | "network"
  | "signed_out";

export interface AccountNameState {
  name: string;
  canChangeAt: string | null;
}

export type AccountNameResult =
  | { ok: true; state: AccountNameState }
  | { ok: false; code: AccountNameCode; canChangeAt: string | null };

export type NameAvailability =
  | { ok: true; available: boolean; code: AccountNameCode | null }
  | { ok: false; code: AccountNameCode };

const KNOWN: ReadonlySet<string> = new Set([
  "name_taken", "name_invalid", "name_reserved", "name_change_too_soon", "name_unavailable",
]);

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function knownCode(value: unknown): AccountNameCode | null {
  const code = str(value);
  return KNOWN.has(code) ? (code as AccountNameCode) : null;
}

async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown } | AccountNameCode> {
  const token = await accessToken().catch(() => null);
  if (!token) return "signed_out";
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${(GATEWAY_BASE || "").replace(/\/+$/, "")}${path}`, { ...init, headers });
  } catch {
    return "network";
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

function failure(status: number, body: unknown): { code: AccountNameCode; canChangeAt: string | null } {
  const top = (body ?? {}) as Record<string, unknown>;
  const detail = (top.detail && typeof top.detail === "object" ? top.detail : top) as Record<string, unknown>;
  const code = knownCode(detail.code) ?? knownCode(top.code);
  const canChangeAt = str(detail.can_change_at) || str(top.can_change_at) || null;
  if (code) return { code, canChangeAt };
  // A gateway without the route (404/405) or without the migration answers "not available yet".
  if (status === 404 || status === 405 || status >= 500) return { code: "name_unavailable", canChangeAt: null };
  if (status === 401) return { code: "signed_out", canChangeAt: null };
  return { code: "name_unavailable", canChangeAt: null };
}

function stateOf(body: unknown): AccountNameState | null {
  const row = (body ?? {}) as Record<string, unknown>;
  const name = str(row.name).trim();
  if (!name) return null;
  return { name, canChangeAt: str(row.can_change_at) || null };
}

export async function getAccountName(): Promise<AccountNameResult> {
  const got = await call("/v1/account/name");
  if (typeof got === "string") return { ok: false, code: got, canChangeAt: null };
  if (got.status >= 200 && got.status < 300) {
    const state = stateOf(got.body);
    return state ? { ok: true, state } : { ok: false, code: "name_unavailable", canChangeAt: null };
  }
  return { ok: false, ...failure(got.status, got.body) };
}

export async function saveAccountName(name: string): Promise<AccountNameResult> {
  const got = await call("/v1/account/name", { method: "PUT", body: JSON.stringify({ name }) });
  if (typeof got === "string") return { ok: false, code: got, canChangeAt: null };
  if (got.status >= 200 && got.status < 300) {
    const state = stateOf(got.body);
    if (!state) return { ok: false, code: "name_unavailable", canChangeAt: null };
    // The sidebar footer and every open account view re-read the profile on this event.
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(AUTH_STATE_EVENT));
    return { ok: true, state };
  }
  return { ok: false, ...failure(got.status, got.body) };
}

export async function checkNameAvailable(name: string): Promise<NameAvailability> {
  const got = await call(`/v1/account/name/available?name=${encodeURIComponent(name)}`);
  if (typeof got === "string") return { ok: false, code: got };
  if (got.status >= 200 && got.status < 300) {
    const row = (got.body ?? {}) as Record<string, unknown>;
    return { ok: true, available: row.available === true, code: knownCode(row.code) };
  }
  return { ok: false, code: failure(got.status, got.body).code };
}
