"use client";

// Program install / login on a computer over the gateway's REST controls
// (backend program_controls_router): start an operation, read it until it ends.
// The key routes stay in program-key-api.

import { CloudComputerError, cloudComputerRequest } from "./cloud-computer-api";
import type { ProgramLoginMethod, ProgramStatus } from "../native-agent-core/index";

export type ProgramOperation = {
  operation_id: string;
  kind: "install" | "login" | "logout";
  state: "running" | "succeeded" | "failed" | "cancelled";
  url?: string;
  needs_code?: boolean;
  /** Failure code (`exit_1`, `connection_lost`, `not_confirmed` …) or the install's done line. */
  message?: string;
  /** Install: the last output line. */
  progress?: string;
};

export type ProgramOptions = {
  program: string;
  installed: boolean;
  version: string | null;
  /** The computer's own probe row; null when the probe did not answer. */
  status: ProgramStatus | null;
  login?: { state: "logged_in" | "logged_out" | "unknown"; account?: string | null; plan?: string | null; mode?: string | null; methods: ProgramLoginMethod[]; can_logout?: boolean; agents_running?: number | null; key_replaces_login?: boolean };
};

const base = (computerId: string) => `/v1/computers/${encodeURIComponent(computerId)}`;
const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

/** The route's `{"error": code}` (busy, operation_not_running …); else the transport code. */
export function programControlCode(reason: unknown): string {
  if (!(reason instanceof CloudComputerError)) return "connection_lost";
  const code = reason.detail?.error;
  return typeof code === "string" && code ? code : reason.code;
}

export function getProgramOptions(computerId: string, program: string): Promise<ProgramOptions> {
  return cloudComputerRequest<ProgramOptions>(`${base(computerId)}/programs/${encodeURIComponent(program)}/options`);
}

export function startProgramInstall(computerId: string, program: string, dir: string): Promise<{ operation_id: string }> {
  return cloudComputerRequest(`${base(computerId)}/programs/${encodeURIComponent(program)}/install`, json(dir ? { dir } : {}));
}

export function startProgramLogin(computerId: string, program: string, method = "device", email?: string): Promise<{ operation_id: string; url?: string; needs_code?: boolean }> {
  return cloudComputerRequest(`${base(computerId)}/programs/${encodeURIComponent(program)}/login`, json({ method, ...(email ? { email } : {}) }));
}

export function startProgramLogout(computerId: string, program: string, confirm = false, provider?: string): Promise<{ operation_id: string }> {
  return cloudComputerRequest(`${base(computerId)}/programs/${encodeURIComponent(program)}/logout`, json({ confirm, ...(provider ? { provider } : {}) }));
}

export function submitProgramLoginCode(computerId: string, program: string, operationId: string, code: string): Promise<ProgramOperation> {
  return cloudComputerRequest(`${base(computerId)}/programs/${encodeURIComponent(program)}/login/code`, json({ operation_id: operationId, code }));
}

export function cancelProgramLogin(computerId: string, program: string, operationId: string): Promise<ProgramOperation> {
  return cloudComputerRequest(`${base(computerId)}/programs/${encodeURIComponent(program)}/login/cancel`, json({ operation_id: operationId }));
}

export function getProgramOperation(computerId: string, operationId: string): Promise<ProgramOperation> {
  return cloudComputerRequest(`${base(computerId)}/program-operations/${encodeURIComponent(operationId)}`);
}
