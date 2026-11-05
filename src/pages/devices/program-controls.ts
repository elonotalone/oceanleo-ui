"use client";

import { cloudComputerRequest } from "../../lib/cloud-computer-api";
import type { NativeProgram } from "../../lib/native-programs";

export type ProgramOption = { id: string; label: string; default?: boolean };
export type ProgramOptions = {
  program: NativeProgram;
  installed: boolean;
  version?: string | null;
  login?: { state: "logged_in" | "logged_out" | "unknown"; account?: string | null };
  auth?: "login" | "key" | "none" | "unknown" | "malformed";
  models?: ProgramOption[];
  modes?: ProgramOption[];
  efforts?: ProgramOption[];
  fast?: boolean | { available: boolean };
};
export type ProgramOperation = {
  operation_id: string;
  kind: "install" | "login";
  state: "running" | "needs_code" | "succeeded" | "failed" | "cancelled";
  url?: string;
  message?: string;
  progress?: number;
};

const base = (computerId: string, program: NativeProgram) => `/v1/computers/${encodeURIComponent(computerId)}/programs/${encodeURIComponent(program)}`;
export function getProgramOptions(computerId: string, program: NativeProgram, signal?: AbortSignal) {
  return cloudComputerRequest<ProgramOptions>(`${base(computerId, program)}/options`, { signal });
}
export function startProgramInstall(computerId: string, program: NativeProgram, signal?: AbortSignal) {
  return cloudComputerRequest<ProgramOperation>(`${base(computerId, program)}/install`, { method: "POST", signal });
}
export function startProgramLogin(computerId: string, program: NativeProgram, signal?: AbortSignal) {
  return cloudComputerRequest<ProgramOperation>(`${base(computerId, program)}/login`, { method: "POST", body: JSON.stringify({}), signal });
}
export function submitProgramLoginCode(computerId: string, program: NativeProgram, operationId: string, code: string, signal?: AbortSignal) {
  return cloudComputerRequest<ProgramOperation>(`${base(computerId, program)}/login/code`, { method: "POST", body: JSON.stringify({ operation_id: operationId, code }), signal });
}
export function cancelProgramOperation(computerId: string, program: NativeProgram, operationId: string, signal?: AbortSignal) {
  return cloudComputerRequest<{ ok: boolean }>(`${base(computerId, program)}/login/cancel`, { method: "POST", body: JSON.stringify({ operation_id: operationId }), signal });
}
export function getProgramOperation(computerId: string, program: NativeProgram, operationId: string, signal?: AbortSignal) {
  return cloudComputerRequest<ProgramOperation>(`/v1/computers/${encodeURIComponent(computerId)}/program-operations/${encodeURIComponent(operationId)}`, { signal });
}
export async function waitProgramOperation(computerId: string, program: NativeProgram, operationId: string, signal?: AbortSignal, pollMs = 1_000): Promise<ProgramOperation> {
  for (;;) {
    const operation = await getProgramOperation(computerId, program, operationId, signal);
    if (["succeeded", "failed", "cancelled", "needs_code"].includes(operation.state)) return operation;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, pollMs);
      signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    });
  }
}
