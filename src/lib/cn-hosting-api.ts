"use client";

import { accessToken } from "./auth/client";
import { gatewayBase } from "./auth/config";

export interface CnHostingTarget {
  account_id: string;
  region: string;
  bucket: string;
  domain: string;
  icp_number: string;
}
export interface CnHostingAccount extends Partial<CnHostingTarget> {
  connected?: boolean;
  credential_version?: number;
  allocated_domain?: string;
}
export interface CnDeployment {
  id: string;
  status: string;
  version?: string;
  url?: string;
  active?: boolean;
  pending?: boolean;
  error?: string;
}
export interface CnHostingStatus {
  deployments: CnDeployment[];
  domain: string;
  cname?: string;
  state: string;
  busy?: boolean;
  can_retry_setup?: boolean;
  retry_delete?: string | null;
}

async function request<T>(projectId: string, suffix: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const token = await accessToken();
  if (!token) throw new Error("Sign in to manage hosting");
  const response = await fetch(`${gatewayBase()}/v1/website-projects/${encodeURIComponent(projectId)}/hosting/aliyun/${suffix}`, {
    method, signal, cache: "no-store", credentials: "include",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Never echo a submitted credential body or an arbitrary validation payload.
    const detail = typeof value.detail === "string" && !/[\u3400-\u9fff]/.test(value.detail) ? value.detail : `Hosting request failed (${response.status})`;
    throw new Error(detail);
  }
  return value as T;
}

export const cnHostingApi = {
  account: (id: string, signal?: AbortSignal) => request<CnHostingAccount>(id, "account", "GET", undefined, signal),
  connect: (id: string, target: CnHostingTarget, accessKeyId: string, accessKeySecret: string, expectedVersion: number | undefined, createBucket: boolean) =>
    request<CnHostingAccount>(id, "account", "PUT", { target, access_key_id: accessKeyId, access_key_secret: accessKeySecret, expected_version: expectedVersion, create_bucket: createBucket }),
  configure: (id: string, certificateId: number, consent: boolean) => request<{ state: string; cname?: string }>(id, "configure", "POST", { certificate_id: certificateId, consent }),
  list: (id: string, signal?: AbortSignal) => request<CnHostingStatus>(id, "deployments", "GET", undefined, signal),
  publish: (id: string, revisionId: string, key: string) => request<{ deployment: CnDeployment }>(id, "deployments", "POST", { revision_id: revisionId, idempotency_key: key }),
  refresh: (id: string, deploymentId: string) => request<{ deployment: CnDeployment }>(id, `deployments/${encodeURIComponent(deploymentId)}/refresh`, "POST"),
  rollback: (id: string, deployment: CnDeployment) => request<{ deployment: CnDeployment }>(id, `deployments/${encodeURIComponent(deployment.id)}/rollback`, "POST", { expected_version: deployment.version }),
  unpublish: (id: string, deployment: CnDeployment) => request<{ deployment: CnDeployment }>(id, `deployments/${encodeURIComponent(deployment.id)}/unpublish`, "POST", { expected_version: deployment.version }),
  delete: (id: string, deployment: CnDeployment) => request<{ deleted: boolean }>(id, `deployments/${encodeURIComponent(deployment.id)}`, "DELETE", { expected_version: deployment.version }),
};
