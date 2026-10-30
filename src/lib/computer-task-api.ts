"use client";
import { cloudComputerRequest } from "./cloud-computer-api";
export type ComputerTaskSession = {
  id: string; task_id: string; computer_id: string; computer_name: string;
  kind: "acp" | "cli" | "terminal";
  program: "oceanleo" | "cursor" | "claude" | "codex" | "hermes" | null;
  native_session_id: string | null; created_at: string; updated_at: string;
  saved_at?: string | null; sync_status: "saved" | "pending" | "error";
  /** Graphical sessions only; CLI/terminal stay "associated" (no observable agent turn). */
  run_status?: "associated" | "running" | "waiting_user" | "completed" | "failed" | "cancelled";
};
export type CreateComputerTaskSessionInput = Pick<ComputerTaskSession, "kind"> & {
  program?: ComputerTaskSession["program"]; task_id?: string; native_session_id?: string;
  title?: string; request_id: string;
};
type Options = { signal?: AbortSignal };
export function createComputerTaskSession(computerId: string, input: CreateComputerTaskSessionInput, options: Options = {}) {
  return cloudComputerRequest<{task_id: string; session: ComputerTaskSession}>(`/v1/computers/${encodeURIComponent(computerId)}/task-sessions`, {method:"POST", body:JSON.stringify(input), ...options});
}
export function listComputerTaskSessions(taskId: string, options: Options = {}) {
  return cloudComputerRequest<{sessions: ComputerTaskSession[]}>(`/v1/computer-task-sessions?${new URLSearchParams({task_id:taskId})}`, options);
}
export function getComputerTaskTranscript(id: string, options: Options & {before?: number; limit?: number} = {}) {
  const {before, limit, ...requestOptions} = options;
  const query = new URLSearchParams();
  if (before !== undefined) query.set("before", String(before));
  if (limit !== undefined) query.set("limit", String(limit));
  return cloudComputerRequest<{next_before?: number|null; has_older?: boolean; session: ComputerTaskSession; frames: Record<string,unknown>[]; saved_at: string|null; sync_status: ComputerTaskSession["sync_status"]}>(`/v1/computer-task-sessions/${encodeURIComponent(id)}/transcript${query.size ? `?${query}` : ""}`, requestOptions);
}
export function bindComputerTaskSession(id: string, nativeSessionId: string, options: Options = {}) {
  return cloudComputerRequest<{session: ComputerTaskSession}>(`/v1/computer-task-sessions/${encodeURIComponent(id)}`, {method:"PATCH",body:JSON.stringify({native_session_id:nativeSessionId}),...options});
}
