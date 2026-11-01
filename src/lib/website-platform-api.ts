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
  status?: string;
  boot_progress?: number;
  session_id?: string;
}

export interface WebsitePlatformApi {
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

/** URL for the immutable, no-sandbox static gateway preview. */
export function websiteStaticPreviewUrl(projectId: string, commit: string, path = "index.html"): string {
  return `${gatewayBase()}/v1/website-projects/${segment(projectId)}/preview/static/${segment(commit)}/${path
    .split("/")
    .map(segment)
    .join("/")}`;
}

export const websitePlatformApi: WebsitePlatformApi = {
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

  // Framework previews use the existing warm website session endpoint. The
  // backend has no generic /preview endpoint yet; the static tier is handled
  // by websiteStaticPreviewUrl in the panel so it never waits on a sandbox.
  preview: async (projectId, revisionId, signal) => {
    const body = await request<{
      preview_url?: string;
      preview_tier?: WebsitePreview["tier"];
      preview_stack?: WebsiteStack;
      session_id?: string;
      state?: string;
      ready?: boolean;
    }>(
      `/v1/website-projects/${segment(projectId)}/sessions`,
      { method: "POST", body: JSON.stringify(revisionId ? { revision_id: revisionId } : {}) },
      signal,
    );
    return {
      tier: body.preview_tier,
      stack: body.preview_stack,
      url: body.preview_url,
      session_id: body.session_id,
      status: body.state || (body.ready ? "ready" : "starting"),
      boot_progress: body.ready ? 100 : 65,
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
};
