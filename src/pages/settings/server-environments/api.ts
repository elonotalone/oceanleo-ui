"use client";

import { cloudComputerRequest } from "../../../lib/cloud-computer-api";

export type EnvironmentGroupId = "website" | "game" | "app" | "common";
export type EnvironmentItem = {
  id: string;
  title: string;
  summary: string;
  version: string;
  size_mb: number;
  installed: boolean | null;
};
export type EnvironmentGroup = { id: EnvironmentGroupId; title: string; items: EnvironmentItem[] };
export type EnvironmentsResponse = { groups: EnvironmentGroup[] };
export type InstallJob = {
  job_id: string;
  item_id: string;
  status: "running" | "ready" | "failed";
  lines: string[];
  error_tail: string[];
  started_at: string;
  finished_at: string | null;
};
export type DetectResponse = { found: string[]; missing: string[] };

const pathFor = (computerId: string, suffix = "") =>
  `/v1/computers/${encodeURIComponent(computerId)}/environments${suffix}`;

export function listEnvironments(computerId: string) {
  return cloudComputerRequest<EnvironmentsResponse>(pathFor(computerId));
}

export function installEnvironment(computerId: string, itemId: string) {
  return cloudComputerRequest<InstallJob>(pathFor(computerId, `/${encodeURIComponent(itemId)}/install`), { method: "POST" });
}

export function getEnvironmentInstallJob(computerId: string, jobId: string) {
  return cloudComputerRequest<InstallJob>(pathFor(computerId, `/jobs/${encodeURIComponent(jobId)}`));
}

export function detectEnvironments(computerId: string, path: string) {
  return cloudComputerRequest<DetectResponse>(pathFor(computerId, "/detect"), {
    method: "POST",
    body: JSON.stringify({ path }),
  });
}

export function askAgentToInstall(computerId: string, itemId: string, jobId?: string) {
  return cloudComputerRequest<{ task_id: string; url?: string }>(pathFor(computerId, `/${encodeURIComponent(itemId)}/agent`), {
    method: "POST",
    body: JSON.stringify(jobId ? { job_id: jobId } : {}),
  });
}

export type EnvironmentApi = {
  listEnvironments: typeof listEnvironments;
  installEnvironment: typeof installEnvironment;
  getEnvironmentInstallJob: typeof getEnvironmentInstallJob;
  detectEnvironments: typeof detectEnvironments;
  askAgentToInstall: typeof askAgentToInstall;
};

export const environmentApi: EnvironmentApi = {
  listEnvironments,
  installEnvironment,
  getEnvironmentInstallJob,
  detectEnvironments,
  askAgentToInstall,
};
