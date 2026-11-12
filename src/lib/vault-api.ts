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
  scope: "project" | "browser" | "connector" | "project_connector"; project_id: string | null; env_name: string;
  environment: VaultEnvironment; purpose: string; origin: string; created_at: string; updated_at: string;
  binding: Record<string, unknown>;
  parent_ref_id?: string | null; slot?: "database" | "auth" | "storage" | "";
};
export type VaultManagedCredential = {
  id: string; label: string;
  auth_kind: "token" | "bearer" | "header" | "url" | "url+token" | "oauth" | "none" | "other";
  enabled: boolean; expires_at?: string;
};
export type VaultManagedCredentials = { available: boolean; items: VaultManagedCredential[] };
export type VaultStatus = {
  enabled: boolean; limits: { max_secrets: number; max_value_bytes: number };
  migration_pending?: "quota" | "rate_limited";
  managed_credentials?: VaultManagedCredentials;
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
export type CreateVaultBrowserBinding = {
  secret_id: string; purpose: "browser_login"; origin: string;
};
export type VaultErrorCode = "signed_out" | "reauth_required" | "disabled" | "unavailable" | "not_found" | "invalid" | "conflict" | "quota" | "rate_limited" | "network" | "forbidden" | "mutation_committed_runtime_unavailable"
  | "fence_settling" | "fence_uncertain" | "fence_busy";
export type VaultFenceRow = {
  scope: "owner" | "project"; project_id: string | null; state: "held" | "uncertain"; retry_after: number;
};
export type VaultFenceStatus = { fences: VaultFenceRow[] };
export type VaultRecovery = {
  recovered: number; runtime_restart_required: string[]; pending: Array<{ project_id: string; retry_after: number }>;
};

/** Never retain or render arbitrary transport text: it can contain submitted data. */
export class VaultApiError extends Error {
  constructor(readonly code: VaultErrorCode, readonly status: number, readonly retryAfter: number | null = null) {
    super(code);
    this.name = "VaultApiError";
  }
}

export function vaultMutationWasCommitted(cause: unknown): boolean {
  return cause instanceof VaultApiError && cause.code === "mutation_committed_runtime_unavailable";
}

/** A previous change has not been proven settled; the owner may run recovery. */
export function vaultFenceState(cause: unknown): "settling" | "uncertain" | null {
  if (!(cause instanceof VaultApiError)) return null;
  return cause.code === "fence_settling" ? "settling" : cause.code === "fence_uncertain" ? "uncertain" : null;
}

// Whole seconds, bounded so a malformed value cannot disable recovery for long.
function retrySeconds(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.min(Math.ceil(value), 86400) : null;
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
    const error = cause as { code?: unknown; status?: unknown; retry_after?: unknown; retryAfter?: unknown; detail?: { retry_after?: unknown } } | null;
    const status = typeof error?.status === "number" ? error.status : 0;
    const rawCode = typeof error?.code === "string" ? error.code : "";
    const code: VaultErrorCode = status === 401 ? "signed_out"
      : rawCode === "vault_mutation_committed_runtime_unavailable" ? "mutation_committed_runtime_unavailable"
      : rawCode === "vault_runtime_fence_settling" ? "fence_settling"
      : rawCode === "vault_runtime_fence_uncertain" ? "fence_uncertain"
      : rawCode === "vault_runtime_fence_busy" ? "fence_busy"
      : rawCode === "reauth_required" ? "reauth_required"
      : rawCode === "vault_disabled" ? "disabled"
      : status === 403 ? "forbidden"
      : status === 404 ? "not_found"
      : rawCode === "vault_quota" ? "quota"
      : status === 409 ? "conflict"
      : status === 429 ? "rate_limited"
      : status === 400 || status === 422 ? "invalid"
      : status === 0 ? "network" : "unavailable";
    // Keep only the numeric wait; the detail message is never retained.
    throw new VaultApiError(code, status, retrySeconds(error?.retry_after ?? error?.retryAfter ?? error?.detail?.retry_after));
  }
}

export const getVault = (signal?: AbortSignal) => request<VaultStatus>("/v1/vault", "GET", undefined, signal);
export const checkVaultWriteAccess = (signal?: AbortSignal) => request<{ ready: boolean }>("/v1/vault/write-access", "GET", undefined, signal);
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

/** Display names of the owner's websites for use-location labels; best effort, never required. */
export async function getVaultProjectNames(signal?: AbortSignal): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  try {
    const result = await request<{ items?: unknown }>("/v1/website-projects?limit=200", "GET", undefined, signal);
    for (const item of Array.isArray(result?.items) ? result.items : []) {
      const row = item as { project_id?: unknown; display_name?: unknown; slug?: unknown } | null;
      const label = typeof row?.display_name === "string" && row.display_name.trim() ? row.display_name.trim()
        : typeof row?.slug === "string" ? row.slug.trim() : "";
      if (typeof row?.project_id === "string" && label) names[row.project_id] = label.slice(0, 80);
    }
  } catch (cause) {
    if (signal?.aborted) throw cause;
  }
  return names;
}

const projectPath = (projectId: string) => `/v1/website-projects/${encodeURIComponent(projectId)}/vault/references`;
export const getProjectVaultReferences = (projectId: string, signal?: AbortSignal) =>
  request<{ references: VaultReference[] }>(projectPath(projectId), "GET", undefined, signal);
export function createProjectVaultReference(projectId: string, input: CreateVaultReference, signal?: AbortSignal) {
  // Pick only binding metadata, even when a caller passes a wider JS object.
  const { secret_id, purpose, env_name, environment } = input;
  if (!validVaultEnvName(env_name)) return Promise.reject(new VaultApiError("invalid", 400));
  return request<{ reference: VaultReference }>(projectPath(projectId), "POST", { secret_id, purpose, env_name, environment }, signal);
}
export const deleteProjectVaultReference = (projectId: string, id: string, signal?: AbortSignal) =>
  request<{ reference: VaultReference }>(`${projectPath(projectId)}/${encodeURIComponent(id)}`, "DELETE", undefined, signal);

/** Exact website metadata only; the server still enforces ownership, auth and fences. */
export function createVaultBrowserBinding(input: CreateVaultBrowserBinding, signal?: AbortSignal) {
  const { secret_id, purpose, origin } = input;
  const normalized = normalizeVaultBrowserOrigin(origin);
  if (purpose !== "browser_login" || !normalized) return Promise.reject(new VaultApiError("invalid", 400));
  return request<{ reference: VaultReference }>("/v1/vault/browser-bindings", "POST", { secret_id, purpose: "browser_login", origin: normalized }, signal);
}
export const deleteVaultBrowserBinding = (id: string, signal?: AbortSignal) =>
  request<{ reference: VaultReference }>(`/v1/vault/browser-bindings/${encodeURIComponent(id)}`, "DELETE", undefined, signal);

/**
 * Match VaultService._origin's exact HTTPS boundary before POST. Check the raw
 * form first: URL() otherwise removes dot paths, whitespace or empty delimiters.
 * Canonical URL hosts (including IDNA/IPv6) are sent to the server unchanged;
 * default 443 is omitted and other valid HTTPS ports remain part of the origin.
 */
export function normalizeVaultBrowserOrigin(origin: string): string | null {
  if (typeof origin !== "string" || origin.length > 300 || /[\s\x00-\x20\x7f\\@*%?#]/u.test(origin)) return null;
  const match = /^https:\/\/(\[[0-9a-f:.]+\]|[^:\/\[\]]+)(?::([0-9]+))?\/?$/i.exec(origin);
  if (!match || (match[2] !== undefined && (Number(match[2]) < 1 || Number(match[2]) > 65535))) return null;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    if (!host || host.endsWith(".")) return null;
    if (!host.startsWith("[") && (host.length > 253 || !host.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))) return null;
    return url.origin;
  } catch { return null; }
}

/** `null` means unknown (an older gateway without fence reporting), never an error on its own. */
export async function getVaultFenceStatus(signal?: AbortSignal): Promise<VaultFenceStatus | null> {
  let result: { fences?: unknown };
  try { result = await request<{ fences?: unknown }>("/v1/vault/fence-status", "GET", undefined, signal); }
  catch (cause) {
    if (cause instanceof VaultApiError && (cause.status === 404 || cause.status === 503)) return null;
    throw cause;
  }
  if (!Array.isArray(result?.fences)) return null;
  const fences: VaultFenceRow[] = [];
  for (const row of result.fences as Array<Partial<VaultFenceRow> | null>) {
    if (!row || (row.scope !== "owner" && row.scope !== "project") || (row.state !== "held" && row.state !== "uncertain")) continue;
    fences.push({ scope: row.scope, project_id: typeof row.project_id === "string" ? row.project_id : null, state: row.state, retry_after: retrySeconds(row.retry_after) ?? 0 });
  }
  return { fences };
}

export async function recoverVault(signal?: AbortSignal): Promise<{ recovery: VaultRecovery }> {
  const result = await request<{ recovery?: Partial<VaultRecovery> }>("/v1/vault/recover", "POST", undefined, signal);
  const recovery = result?.recovery;
  return { recovery: {
    recovered: typeof recovery?.recovered === "number" && Number.isFinite(recovery.recovered) ? recovery.recovered : 0,
    runtime_restart_required: Array.isArray(recovery?.runtime_restart_required) ? recovery.runtime_restart_required.filter((id): id is string => typeof id === "string") : [],
    pending: Array.isArray(recovery?.pending) ? recovery.pending.flatMap((row) => row && typeof row.project_id === "string" ? [{ project_id: row.project_id, retry_after: retrySeconds(row.retry_after) ?? 0 }] : []) : [],
  } };
}

/** Do not accidentally display a raw value if a malformed response reaches the UI. */
export function safeVaultFingerprint(kind: VaultKind, fingerprint?: string): string {
  if (kind === "text") return "";
  if (kind === "password") return "••••••";
  return typeof fingerprint === "string" && /^(?:[^\s\x00-\x1f]{4}…[^\s\x00-\x1f]{4}|…[^\s\x00-\x1f]{2}|•{4})$/u.test(fingerprint) ? fingerprint : "••••";
}

// Mirror app.vault.client.runtime_env_name_allowed. The gateway remains the
// authority; the sibling-source policy test detects changes to either side.
export const VAULT_RUNTIME_ENV_DENIED = ["PORT", "PATH", "HOME", "SHELL", "ENV", "BASH_ENV", "CDPATH", "IFS",
  "USER", "LOGNAME", "PWD", "OLDPWD", "SHELLOPTS", "BASHOPTS", "BASH_XTRACEFD",
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "FTP_PROXY", "RSYNC_PROXY",
  "GCONV_PATH", "LOCPATH", "GLIBC_TUNABLES", "CLASSPATH", "JAVA_TOOL_OPTIONS",
  "SSL_CERT_FILE", "SSL_CERT_DIR", "CURL_CA_BUNDLE", "REQUESTS_CA_BUNDLE", "KUBECONFIG",
  "AWS_CONFIG_FILE", "AWS_SHARED_CREDENTIALS_FILE", "TMPDIR", "TMP", "TEMP", "FLASK_DEBUG",
  "FLASK_ENV", "WERKZEUG_DEBUG_PIN", "DJANGO_SETTINGS_MODULE"] as const;
export const VAULT_RUNTIME_ENV_DENIED_PREFIXES = ["OCEANLEO_", "VITE_", "NEXT_PUBLIC_", "PUBLIC_", "REACT_APP_", "NUXT_PUBLIC_",
  "EXPO_PUBLIC_", "__VITE_", "LD_", "DYLD_", "PYTHON", "NODE_", "NPM_CONFIG_", "GIT_", "SSH_",
  "DOCKER_", "SANDBOX_", "SITE_", "BASH_", "PERL", "RUBY", "JDK_", "JAVA_", "GCONV_",
  "WATCHPACK_", "CHOKIDAR_", "WATCHFILES_", "UVICORN_", "SUPABASE_"] as const;
export const VAULT_RUNTIME_ENV_PROVIDER_KEYS = ["SUPABASE_AUTH_URL", "SUPABASE_AUTH_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_URL", "SUPABASE_STORAGE_SERVICE_ROLE_KEY"] as const;

export function validVaultEnvName(name: string): boolean {
  return typeof name === "string" && /^[A-Z_][A-Z0-9_]{0,127}$/.test(name)
    && (VAULT_RUNTIME_ENV_PROVIDER_KEYS.some((key) => name === key)
      || (!VAULT_RUNTIME_ENV_DENIED.some((key) => name === key)
        && !VAULT_RUNTIME_ENV_DENIED_PREFIXES.some((prefix) => name.startsWith(prefix))));
}
