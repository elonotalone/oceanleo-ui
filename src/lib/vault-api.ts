"use client";

import { cloudComputerRequest } from "./cloud-computer-api";
import type { VaultSealKey, VaultSealedEnvelope } from "./vault-seal";

export type VaultKind = "api_key" | "password" | "text";
export type VaultEnvironment = "preview" | "production";
export type VaultMachine = {
  computer_id: string; computer_name: string; grant: string; grant_id?: string | null;
  placements: Array<{ slot_ref: string; label: string; status: string; placed_version: number }>;
};
export type VaultSecret = {
  id: string; name: string; kind: VaultKind; username: string; description: string;
  fingerprint: string; version: number; value_len: number; created_at: string; updated_at: string;
  last_used_at: string | null; needs_reentry: boolean; machines: VaultMachine[];
};
export type VaultReference = {
  id: string; secret_id: string; secret_name: string; kind: VaultKind; fingerprint: string; version: number;
  scope: "project" | "browser" | "connector"; project_id: string | null; env_name: string;
  environment: VaultEnvironment; purpose: string; origin: string; created_at: string; updated_at: string;
  binding: Record<string, unknown>;
};
export type VaultStatus = {
  enabled: boolean; limits: { max_secrets: number; max_value_bytes: number };
  secrets: VaultSecret[];
  pending: Array<{ grant_id: string; secret_name: string; computer_name: string; reason: string }>;
};
export type CreateVaultSecret = {
  name: string; kind: VaultKind; username: string; description: string; sealed: VaultSealedEnvelope;
};
export type UpdateVaultSecret = Partial<Pick<CreateVaultSecret, "name" | "username" | "description" | "sealed">>;
export type CreateVaultReference = {
  secret_id: string; purpose: "runtime_env"; env_name: string; environment: VaultEnvironment;
};
export type VaultErrorCode = "signed_out" | "reauth_required" | "disabled" | "unavailable" | "not_found" | "invalid" | "conflict" | "quota" | "rate_limited" | "network" | "forbidden";

/** Never retain or render arbitrary transport text: it can contain submitted data. */
export class VaultApiError extends Error {
  constructor(readonly code: VaultErrorCode, readonly status: number) {
    super(code);
    this.name = "VaultApiError";
  }
}

async function request<T>(path: string, method = "GET", body?: object, signal?: AbortSignal): Promise<T> {
  try {
    // The shared request reads the current bearer/native session on every call,
    // uses the configured gateway, and always sends cache: no-store.
    return await cloudComputerRequest<T>(path, {
      method, signal, ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (cause) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const error = cause as { code?: unknown; status?: unknown } | null;
    const status = typeof error?.status === "number" ? error.status : 0;
    const rawCode = typeof error?.code === "string" ? error.code : "";
    const code: VaultErrorCode = status === 401 ? "signed_out"
      : rawCode === "reauth_required" ? "reauth_required"
      : rawCode === "vault_disabled" ? "disabled"
      : status === 403 ? "forbidden"
      : status === 404 ? "not_found"
      : rawCode === "vault_quota" ? "quota"
      : status === 409 ? "conflict"
      : status === 429 ? "rate_limited"
      : status === 400 || status === 422 ? "invalid"
      : status === 0 ? "network" : "unavailable";
    throw new VaultApiError(code, status);
  }
}

export const getVault = (signal?: AbortSignal) => request<VaultStatus>("/v1/vault", "GET", undefined, signal);
export const getVaultSealKey = (signal?: AbortSignal) => request<VaultSealKey>("/v1/vault/seal-key", "GET", undefined, signal);

export function createVaultSecret(input: CreateVaultSecret, signal?: AbortSignal) {
  const { name, kind, username, description, sealed } = input;
  return request<{ secret: VaultSecret }>("/v1/vault/secrets", "POST", { name, kind, username, description, sealed }, signal);
}
export function updateVaultSecret(id: string, input: UpdateVaultSecret, signal?: AbortSignal) {
  const { name, username, description, sealed } = input;
  return request<{ secret: VaultSecret }>(`/v1/vault/secrets/${encodeURIComponent(id)}`, "PATCH", { name, username, description, sealed }, signal);
}
export const deleteVaultSecret = (id: string, signal?: AbortSignal) =>
  request<{ deleted: boolean; removing: number }>(`/v1/vault/secrets/${encodeURIComponent(id)}`, "DELETE", undefined, signal);
export const getVaultReferences = (signal?: AbortSignal) =>
  request<{ references: VaultReference[] }>("/v1/vault/references", "GET", undefined, signal);

const projectPath = (projectId: string) => `/v1/website-projects/${encodeURIComponent(projectId)}/vault/references`;
export const getProjectVaultReferences = (projectId: string, signal?: AbortSignal) =>
  request<{ references: VaultReference[] }>(projectPath(projectId), "GET", undefined, signal);
export function createProjectVaultReference(projectId: string, input: CreateVaultReference, signal?: AbortSignal) {
  // Pick only binding metadata, even when a caller passes a wider JS object.
  const { secret_id, purpose, env_name, environment } = input;
  return request<{ reference: VaultReference }>(projectPath(projectId), "POST", { secret_id, purpose, env_name, environment }, signal);
}
export const deleteProjectVaultReference = (projectId: string, id: string, signal?: AbortSignal) =>
  request<{ reference: VaultReference }>(`${projectPath(projectId)}/${encodeURIComponent(id)}`, "DELETE", undefined, signal);
export const deleteVaultBrowserBinding = (id: string, signal?: AbortSignal) =>
  request<{ reference: VaultReference }>(`/v1/vault/browser-bindings/${encodeURIComponent(id)}`, "DELETE", undefined, signal);

/** Do not accidentally display a raw value if a malformed response reaches the UI. */
export function safeVaultFingerprint(kind: VaultKind, fingerprint?: string): string {
  if (kind === "text") return "";
  if (kind === "password") return "••••••";
  return typeof fingerprint === "string" && /^(?:[^\s\x00-\x1f]{4}…[^\s\x00-\x1f]{4}|…[^\s\x00-\x1f]{2}|•{4})$/u.test(fingerprint) ? fingerprint : "••••";
}

export function validVaultEnvName(name: string): boolean {
  return /^[A-Z_][A-Z0-9_]{0,127}$/.test(name)
    && !/^(?:VITE_|NEXT_PUBLIC_|PUBLIC_|REACT_APP_|NUXT_PUBLIC_|EXPO_PUBLIC_|OCEANLEO_)/.test(name)
    && !["PORT", "PATH", "HOME", "SHELL", "ENV", "BASH_ENV", "NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "LD_LIBRARY_PATH", "PYTHONPATH", "PYTHONSTARTUP"].includes(name);
}
