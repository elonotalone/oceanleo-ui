// Platform-independent task timeline wire contract shared by browser and native clients.
import type { NativeAgentAttachment as AgentAttachment } from "../../native-agent-core/index";

export type TaskProgram = "claude" | "codex" | "cursor" | "hermes" | "oceanleo";
export type TaskTimelineFrame = Record<string, unknown>;
export type TaskTimelineEntry = {
  cursor: string;
  source: "native" | "leo";
  program: TaskProgram;
  session_id: string | null;
  created_at: string;
  /** Number range assigned by the session archive writer (null on legacy rows). */
  no_from?: number | null;
  no_to?: number | null;
  frame?: TaskTimelineFrame;
  message?: Record<string, unknown>;
};
export type TaskTimelineLiveFrame = {
  session_id: string;
  program: TaskProgram;
  no: number;
  frame: TaskTimelineFrame;
  at: string;
};
export type TaskLocalMessageInput = {
  clientMessageId: string;
  text: string;
  attachments: AgentAttachment[];
  program: TaskProgram;
};
export type TaskSessionSummary = { id: string; program: TaskProgram | null; run_status: string; created_at: string };
export type TaskRequest = { id: string; kind: "permission" | "question"; [key: string]: unknown };
export type TaskState = {
  status: "idle" | "working" | "waiting_user" | "queued" | "stopping" | "stopped" | "failed" | "offline" | "saving_delayed";
  program: TaskProgram | null;
  session_id: string | null;
  since: string | null;
  last_output_at: string | null;
  request: TaskRequest | null;
  queued: { client_message_id: string; program: TaskProgram; created_at: string; text?: string; attachments?: unknown[] }[];
  reason: string | null;
  pending_stop: boolean;
  computer: { id: string | null; online: boolean };
  /** True while the gateway is streaming but has not durably saved the tail. */
  saving_delayed?: boolean;
};
export type TimelinePage = {
  task_id: string;
  entries: TaskTimelineEntry[];
  has_older: boolean;
  next_before: string | null;
  state: TaskState;
  sessions: TaskSessionSummary[];
};
