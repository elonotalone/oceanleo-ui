"use client";

import { accessToken } from "./auth/client";
import { gatewayBase } from "./auth/config";

export type WebsiteStack = "static" | "vite-react" | "next" | string;

export interface WebsiteProjectFile {
  path: string;
  size?: number;
  content?: string;
  content_base64?: string;
  type?: string;
  encoding?: string;
  is_binary?: boolean;
  sha256?: string;
}

export interface WebsiteCommit {
  id?: string;
  sha?: string;
  commit?: string;
  message?: string;
  author?: string;
  created_at?: string;
  files?: WebsiteProjectFile[];
}

export interface WebsiteDeployment {
  id: string;
  status?: string;
  url?: string;
  provider?: string;
  revision_id?: string;
  version?: string;
  created_at?: string;
}

export interface WebsiteDatabaseUsage {
  provider?: string;
  used_bytes?: number;
  quota_bytes?: number | null;
  state?: string;
  status?: string;
}

export interface WebsiteDatabaseTable {
  name: string;
  schema?: string;
  columns?: Array<{ name: string; type?: string }>;
  rows?: Record<string, unknown>[];
}

export interface WebsitePreview {
  tier?: "static" | "sandbox";
  stack?: WebsiteStack;
  url?: string;
  /** Public capability host on the user-content domain (static tier). */
  public_url?: string;
  status?: string;
  boot_progress?: number;
  session_id?: string;
}

export interface WebsiteProjectSummary {
  project_id?: string;
  display_name?: string;
  slug?: string;
  stack?: WebsiteStack;
  stack_key?: WebsiteStack;
  environment?: string;
  env_refs?: Record<string, string>;
  git_repo?: string;
  git_head?: string;
  working_revision_id?: string | null;
  published_revision_id?: string | null;
  role?: string;
  project_access?: { role?: string; state?: string };
  [key: string]: unknown;
}

export interface WebsiteCapabilitySnapshot {
  role?: string;
  permissions?: Record<string, boolean>;
  availability?: Record<string, unknown>;
  detected?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WebsiteStorageBinding {
  provider?: string;
  allowed_buckets?: string[];
  allowed_prefix?: string;
  max_object_bytes?: number;
  status?: string;
  quota_bytes?: number | null;
  used_bytes?: number;
  updated_at?: string;
  [key: string]: unknown;
}

export interface WebsiteStorageBucket {
  name: string;
  public?: boolean;
  file_size_limit?: number | null;
  allowed_mime_types?: string[] | null;
  [key: string]: unknown;
}

export interface WebsiteStorageObject {
  name: string;
  id?: string | null;
  bucket?: string;
  path?: string;
  size?: number;
  updated_at?: string;
  created_at?: string;
  mime_type?: string;
  [key: string]: unknown;
}

export interface WebsiteStorageObjects {
  items: WebsiteStorageObject[];
  next_cursor?: string | null;
}

export interface WebsiteDomain {
  id?: string;
  domain: string;
  dns_records?: Array<{ type: string; name: string; value: string }>;
  target?: string;
  provider?: string;
  status?: string;
  verification_status?: string;
  verification?: unknown;
  certificate_status?: string;
  is_primary?: boolean;
  [key: string]: unknown;
}

export interface WebsiteSecretReference {
  id?: string;
  name: string;
  target?: string;
  environment?: string;
  fingerprint?: string;
  version?: number;
  updated_at?: string;
}

export interface WebsiteUsageMetric {
  status?: string;
  value?: number | null;
  unit?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface WebsiteUsageSettings {
  range?: { start?: string; end?: string; label?: string };
  metrics?: Record<string, WebsiteUsageMetric>;
  cost_ledger?: {
    status?: string;
    reason?: string;
    totals?: Record<string, number>;
    unpriced_kinds?: string[];
    events?: Array<{
      kind?: string;
      quantity?: number;
      unit?: string;
      unit_cost?: number | null;
      currency?: string;
      cost?: number | null;
      resource_id?: string;
      occurred_at?: string;
    }>;
  };
  [key: string]: unknown;
}

export interface WebsiteAnalyticsSummary {
  status?: string;
  range?: { start?: string; end?: string };
  metrics?: Record<string, number | null>;
  timeseries?: Array<Record<string, unknown>>;
  unavailable_metrics?: string[];
  [key: string]: unknown;
}

export interface WebsiteAuthUser {
  id?: string;
  email?: string;
  created_at?: string;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  [key: string]: unknown;
}

export interface WebsitePlatformApi {
  project(projectId: string, signal?: AbortSignal): Promise<WebsiteProjectSummary>;
  capabilities(projectId: string, signal?: AbortSignal): Promise<WebsiteCapabilitySnapshot>;
  history(projectId: string, signal?: AbortSignal): Promise<{ commits: WebsiteCommit[] }>;
  files(projectId: string, revisionId?: string, signal?: AbortSignal): Promise<{ files: WebsiteProjectFile[] }>;
  file(projectId: string, path: string, revisionId?: string, signal?: AbortSignal): Promise<WebsiteProjectFile>;
  save(projectId: string, changes: Record<string, string | null>, baseCommit?: string, message?: string, signal?: AbortSignal): Promise<{ commit: string }>;
  preview(projectId: string, revisionId?: string, signal?: AbortSignal): Promise<WebsitePreview>;
  usage(projectId: string, signal?: AbortSignal): Promise<WebsiteDatabaseUsage>;
  schema(projectId: string, signal?: AbortSignal): Promise<{ tables?: WebsiteDatabaseTable[] }>;
  query(projectId: string, sql: string, signal?: AbortSignal): Promise<{ columns?: string[]; rows?: Record<string, unknown>[] }>;
  deployments(projectId: string, signal?: AbortSignal): Promise<{ deployments: WebsiteDeployment[] }>;
  publish(projectId: string, revisionId?: string, provider?: string, signal?: AbortSignal): Promise<{ deployment: WebsiteDeployment }>;
  rollback(projectId: string, deploymentId: string, expectedVersion?: string, signal?: AbortSignal): Promise<{ deployment?: WebsiteDeployment }>;
  storageBinding(projectId: string, signal?: AbortSignal): Promise<WebsiteStorageBinding | null>;
  storageBuckets(projectId: string, signal?: AbortSignal): Promise<{ items: WebsiteStorageBucket[] }>;
  storageObjects(projectId: string, bucket: string, prefix?: string, search?: string, cursor?: string, signal?: AbortSignal): Promise<WebsiteStorageObjects>;
  storageDownload(projectId: string, bucket: string, path: string, signal?: AbortSignal): Promise<{ url: string; expires_at?: string }>;
  storageDelete(projectId: string, bucket: string, path: string, expectedVersion?: string, signal?: AbortSignal): Promise<{ deleted?: boolean }>;
  domains(projectId: string, signal?: AbortSignal): Promise<{ domains: WebsiteDomain[] }>;
  addDomain(projectId: string, domain: string, signal?: AbortSignal): Promise<{ domain: WebsiteDomain }>;
  verifyDomain(projectId: string, domain: string, signal?: AbortSignal): Promise<{ domain: WebsiteDomain }>;
  setPrimaryDomain(projectId: string, domain: string, signal?: AbortSignal): Promise<{ domain: WebsiteDomain }>;
  removeDomain(projectId: string, domain: string, signal?: AbortSignal): Promise<{ deleted?: boolean }>;
  secrets(projectId: string, signal?: AbortSignal): Promise<{ secrets: WebsiteSecretReference[] }>;
  usageSettings(projectId: string, signal?: AbortSignal): Promise<WebsiteUsageSettings>;
  analytics(projectId: string, start?: string, end?: string, signal?: AbortSignal): Promise<WebsiteAnalyticsSummary>;
  authUsers(projectId: string, signal?: AbortSignal): Promise<{ users?: WebsiteAuthUser[]; total?: number; [key: string]: unknown }>;
}

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const token = await accessToken().catch(() => null);
  const response = await fetch(`${gatewayBase()}${path}`, {
    ...init,
    signal,
    cache: "no-store",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof body?.detail === "string"
        ? body.detail
        : `Website request failed (${response.status})`,
    );
  }
  return body as T;
}

const segment = (value: string) => encodeURIComponent(value);

/**
 * Editable text of a source file. The gateway sends text as `content`, but
 * files stored as base64 (older create-flow sites) arrive as `content_base64`
 * only; decode them when they are valid UTF-8 without NUL bytes. Anything
 * else is binary and is not shown as text.
 */
export function websiteFileText(file: WebsiteProjectFile | null | undefined): { text: string; binary: boolean } {
  if (typeof file?.content === "string") return { text: file.content, binary: false };
  const encoded = String(file?.content_base64 || "");
  if (!encoded) return { text: "", binary: false };
  try {
    const raw = atob(encoded);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
    if (bytes.includes(0)) return { text: "", binary: true };
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), binary: false };
  } catch {
    return { text: "", binary: true };
  }
}

const USER_CONTENT_ROOTS = ["oceanleo.app", "leoapp.cn"] as const;

/**
 * The URL the editor may frame and open in a new tab: an absolute https URL on
 * an isolated user-content domain (`*.oceanleo.app`, twin `*.ws.oceanleo.app`,
 * CN `*.leoapp.cn`; same roots as the gateway's USER_CONTENT_DOMAIN).
 * Anything else — notably the authenticated
 * `/v1/website-projects/{id}/preview/static/...` API route, which an iframe
 * cannot call without the bearer header — is refused.
 */
export function websitePreviewFrameUrl(preview: WebsitePreview | null | undefined): string {
  const candidates = [preview?.public_url, preview?.url];
  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (!value) continue;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:") continue;
    const host = parsed.hostname.toLowerCase();
    if (!USER_CONTENT_ROOTS.some((root) => host.endsWith(`.${root}`))) continue;
    return parsed.toString();
  }
  return "";
}

export const websitePlatformApi: WebsitePlatformApi = {
  project: async (projectId, signal) => {
    const body = await request<{ project?: WebsiteProjectSummary }>(`/v1/website-projects/${segment(projectId)}`, {}, signal);
    return body.project || {};
  },

  capabilities: (projectId, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/capabilities`, {}, signal),

  history: (projectId, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/create-flow/history`, {}, signal),

  files: (projectId, revisionId, signal) =>
    request(
      `/v1/website-projects/${segment(projectId)}/source/files${
        revisionId ? `?revision_id=${segment(revisionId)}` : ""
      }`,
      {},
      signal,
    ),

  file: (projectId, path, revisionId, signal) =>
    request(
      `/v1/website-projects/${segment(projectId)}/source/file?path=${segment(path)}${
        revisionId ? `&revision_id=${segment(revisionId)}` : ""
      }`,
      {},
      signal,
    ),

  save: (projectId, changes, baseCommit, message = "Update website", signal) =>
    request(`/v1/website-projects/${segment(projectId)}/create-flow/save`, {
      method: "POST",
      body: JSON.stringify({ changes, base_commit: baseCommit, message }),
    }, signal),

  // One preview route for every stack (static capability host or warm sandbox).
  preview: async (projectId, revisionId, signal) => {
    const body = await request<{
      url?: string | null;
      preview_url?: string | null;
      public_url?: string | null;
      tier?: WebsitePreview["tier"];
      preview_tier?: WebsitePreview["tier"];
      stack?: WebsiteStack;
      preview_stack?: WebsiteStack;
      session_id?: string;
      status?: string;
      state?: string;
      ready?: boolean;
      boot_progress?: number;
    }>(
      `/v1/website-projects/${segment(projectId)}/preview`,
      { method: "POST", body: JSON.stringify(revisionId ? { git_commit: revisionId } : {}) },
      signal,
    );
    const url = String(body.url || body.preview_url || "") || undefined;
    return {
      tier: body.tier || body.preview_tier,
      stack: body.stack || body.preview_stack,
      url,
      public_url: body.public_url || undefined,
      session_id: body.session_id,
      status: body.status || body.state || (body.ready ? "ready" : "starting"),
      boot_progress:
        typeof body.boot_progress === "number" ? body.boot_progress : body.ready ? 100 : 65,
    };
  },

  usage: (projectId, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/database/usage`, {}, signal),

  schema: (projectId, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/database/schema`, {}, signal),

  query: (projectId, sql, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/database/query`, {
      method: "POST",
      body: JSON.stringify({ sql }),
    }, signal),

  deployments: (projectId, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/deployments`, {}, signal),

  publish: (projectId, revisionId, provider = "oceanleo-static", signal) =>
    request(`/v1/website-projects/${segment(projectId)}/deployments`, {
      method: "POST",
      body: JSON.stringify({
        revision_id: revisionId,
        provider,
        repo_name: projectId,
        idempotency_key: `ui-${Date.now()}`,
      }),
    }, signal),

  rollback: (projectId, deploymentId, expectedVersion, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/deployments/${segment(deploymentId)}/rollback`, {
      method: "POST",
      headers: {
        "Idempotency-Key": `rollback-${Date.now()}`,
        ...(expectedVersion ? { "If-Match": expectedVersion } : {}),
      },
      body: JSON.stringify(expectedVersion ? { expected_version: expectedVersion } : {}),
    }, signal),

  storageBinding: async (projectId, signal) => {
    const body = await request<{ binding?: WebsiteStorageBinding | null }>(`/v1/website-projects/${segment(projectId)}/storage/binding`, {}, signal);
    return body.binding || null;
  },

  storageBuckets: (projectId, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/storage/buckets`, {}, signal),

  storageObjects: (projectId, bucket, prefix = "", search = "", cursor = "", signal) => {
    const query = new URLSearchParams({ bucket, prefix, search, ...(cursor ? { cursor } : {}) });
    query.set("page_size", "50");
    return request(`/v1/website-projects/${segment(projectId)}/storage/objects?${query}`, {}, signal);
  },

  storageDownload: (projectId, bucket, path, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/storage/objects/sign-download`, {
      method: "POST",
      body: JSON.stringify({ bucket, path }),
    }, signal),

  storageDelete: (projectId, bucket, path, expectedVersion, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/storage/objects`, {
      method: "DELETE",
      body: JSON.stringify({ bucket, path, ...(expectedVersion ? { expected_version: expectedVersion } : {}) }),
    }, signal),

  domains: async (projectId, signal) => {
    const body = await request<WebsiteDomain[] | { items?: WebsiteDomain[]; domains?: WebsiteDomain[] }>(`/v1/website-projects/${segment(projectId)}/domains`, {}, signal);
    return { domains: Array.isArray(body) ? body : body.domains || body.items || [] };
  },

  addDomain: (projectId, domain, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/domains`, { method: "POST", body: JSON.stringify({ domain }) }, signal),

  verifyDomain: (projectId, domain, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/domains/${segment(domain)}/verify`, { method: "POST" }, signal),

  setPrimaryDomain: (projectId, domain, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/settings/domains/${segment(domain)}/primary`, { method: "PUT" }, signal),

  removeDomain: (projectId, domain, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/domains/${segment(domain)}`, { method: "DELETE" }, signal),

  secrets: async (projectId, signal) => {
    const body = await request<{ items?: WebsiteSecretReference[]; secrets?: WebsiteSecretReference[] }>(`/v1/website-projects/${segment(projectId)}/settings/secrets`, {}, signal);
    return { secrets: body.secrets || body.items || [] };
  },

  usageSettings: (projectId, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/settings/usage`, {}, signal),

  analytics: (projectId, start, end, signal) => {
    const query = new URLSearchParams();
    if (start) query.set("start", start);
    if (end) query.set("end", end);
    const suffix = query.toString() ? `?${query}` : "";
    return request(`/v1/website-projects/${segment(projectId)}/analytics/summary${suffix}`, {}, signal);
  },

  authUsers: (projectId, signal) =>
    request(`/v1/website-projects/${segment(projectId)}/database/auth/users`, {}, signal),
};
