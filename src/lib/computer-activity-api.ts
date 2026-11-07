"use client";

// @oceanleo/ui — what runs on one computer right now (2026-11-07 UX wave, contract §2.3).
// GET  /v1/computers/{cid}/activity          → ComputerActivity
// POST /v1/computers/{cid}/activity/end      {slot} | {session_id} → ComputerActivity (after the end)
// POST /v1/computers/{cid}/activity/end-all  → ComputerActivity
// Ending goes through the same gateway path as the task page's Close. The node upgrade
// stays the existing route (`upgradeNode`); its 409 `confirm_required` detail lists what
// the restart ends, read here with `upgradeConfirmList`.

import { cloudComputerRequest, upgradeNode, type CloudComputerError } from "./cloud-computer-api";

export type ComputerUsage = {
  cpu_percent: number;
  mem_used_bytes: number;
  mem_total_bytes: number;
  sampled_at: string;
};

export type ActivityProgram = {
  slot: string;
  program: string;
  pid: number | null;
  alive: boolean;
  started_at: string | null;
  rss_bytes: number | null;
  cpu_percent: number | null;
  task_id: string | null;
  task_title: string | null;
  session_id: string | null;
};

export type ActivityTerminal = {
  session_id: string;
  task_id: string | null;
  title: string | null;
  started_at: string | null;
};

export type ComputerActivity = {
  online: boolean;
  node_version: string;
  latest_version: string | null;
  update_available: boolean;
  /** null: the node is too old to report usage. */
  usage: ComputerUsage | null;
  programs: ActivityProgram[];
  terminals: ActivityTerminal[];
};

export type ActivityEndTarget = { slot: string } | { session_id: string };

function activityPath(computerId: string, suffix = "") {
  return `/v1/computers/${encodeURIComponent(computerId)}/activity${suffix}`;
}

export function getComputerActivity(computerId: string) {
  return cloudComputerRequest<ComputerActivity>(activityPath(computerId));
}

export function endComputerActivity(computerId: string, target: ActivityEndTarget) {
  return cloudComputerRequest<ComputerActivity>(activityPath(computerId, "/end"), {
    method: "POST",
    body: JSON.stringify(target),
  });
}

export function endAllComputerActivity(computerId: string) {
  return cloudComputerRequest<ComputerActivity>(activityPath(computerId, "/end-all"), { method: "POST" });
}

/** The live programs (the card's count and the panel's list). */
export function runningPrograms(activity: ComputerActivity): ActivityProgram[] {
  return activity.programs.filter((item) => item.alive);
}

/** Whole percent of the machine's memory in use, or null when the node sent no total. */
export function memoryPercent(usage: ComputerUsage): number | null {
  return usage.mem_total_bytes > 0 ? Math.round((usage.mem_used_bytes / usage.mem_total_bytes) * 100) : null;
}

/** What the upgrade's 409 says the restart will end; null when the error is not that refusal. */
export function upgradeConfirmList(error: unknown): { programs: ActivityProgram[]; terminals: ActivityTerminal[] } | null {
  const failure = error as Partial<CloudComputerError> | null;
  if (!failure || failure.status !== 409 || failure.code !== "confirm_required") return null;
  const detail = failure.detail ?? {};
  return {
    programs: Array.isArray(detail.programs) ? (detail.programs as ActivityProgram[]) : [],
    terminals: Array.isArray(detail.terminals) ? (detail.terminals as ActivityTerminal[]) : [],
  };
}

export type ComputerActivityClient = {
  getActivity: typeof getComputerActivity;
  endActivity: typeof endComputerActivity;
  endAll: typeof endAllComputerActivity;
  upgradeNode: typeof upgradeNode;
};

export const computerActivityApi: ComputerActivityClient = {
  getActivity: getComputerActivity,
  endActivity: endComputerActivity,
  endAll: endAllComputerActivity,
  upgradeNode,
};
