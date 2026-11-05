import type { AgentMessage } from "../../lib/agent";
import type { TaskState, TaskTimelineEntry, TaskProgram } from "../../lib/task-timeline-api";
import { PROGRAM_LABEL } from "../../native-agent-core/index";
import { applyDialog, initialDialogState } from "../cloud-computer/agent-dialog/reduce";
import { dialogToAgentMessages } from "../native-thread/map-dialog";
import type { AgentDialogMessage, DialogState } from "../../native-agent-core/index";

/** The small state vocabulary the task page renders. `stuck` is intentionally absent. */
export type TaskUiStatus =
  | "working"
  | "waiting_user"
  | "queued"
  | "stopping"
  | "stopped"
  | "failed"
  | "offline"
  | "saving_delayed"
  | "idle";

export type TaskUiState = {
  status: TaskUiStatus;
  program: TaskProgram | null;
  sessionId: string | null;
  since: string | null;
  lastOutputAt: string | null;
  reason: string | null;
  request: TaskState["request"];
  pendingStop: boolean;
  computer: TaskState["computer"];
};

type NativeProjection = {
  state: DialogState;
  rows: AgentMessage[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stableNegativeId(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return -((hash % 2147483646) + 1);
}

function engineLabel(program: TaskProgram): string {
  return PROGRAM_LABEL[program] ?? program;
}

function stripEngineLabel(meta: AgentMessage["meta"]): AgentMessage["meta"] | undefined {
  if (!meta || !Object.prototype.hasOwnProperty.call(meta, "engine_label")) return meta;
  const { engine_label: _engineLabel, ...rest } = meta;
  return rest;
}

function annotate(row: AgentMessage, entry: TaskTimelineEntry, program: TaskProgram, id: string): AgentMessage {
  const label = engineLabel(program);
  return {
    ...row,
    id: stableNegativeId(`${entry.source}:${entry.session_id ?? "leo"}:${id}`),
    meta: {
      ...(row.meta ?? {}),
      engine: program,
      engine_label: label,
      task_timeline_cursor: entry.cursor,
      task_timeline_source: entry.source,
      ...(entry.session_id ? { task_timeline_session_id: entry.session_id } : {}),
    },
  };
}

function nativeKey(entry: TaskTimelineEntry): string {
  return `${entry.program}:${entry.session_id ?? "task"}`;
}

function projectionFor(entry: TaskTimelineEntry, nativeStates: Map<string, NativeProjection>): NativeProjection {
  const key = nativeKey(entry);
  const existing = nativeStates.get(key);
  if (existing) return existing;
  const state = { ...initialDialogState(), program: entry.program };
  const projection = { state, rows: [] };
  nativeStates.set(key, projection);
  return projection;
}

function frameIsDialogMessage(frame: Record<string, unknown>): frame is Record<string, unknown> & { kind: string } {
  return typeof frame.kind === "string" && (frame.kind === "user" || frame.kind === "turn" || frame.kind === "notice");
}

function mapNativeEntry(entry: TaskTimelineEntry, nativeStates: Map<string, NativeProjection>): AgentMessage[] {
  const frame = record(entry.frame);
  if (!frame) return [];
  const projection = projectionFor(entry, nativeStates);
  if (frameIsDialogMessage(frame)) {
    const mapped = dialogToAgentMessages([frame as unknown as AgentDialogMessage], { live: false, engine: entry.program });
    return mapped.map((row) => annotate(row, entry, entry.program, String(row.id)));
  }
  projection.state = applyDialog(projection.state, { type: "frame", frame });
  const mapped = dialogToAgentMessages(projection.state.messages, { live: false, engine: entry.program });
  const previous = new Map(projection.rows.map((row) => [String(row.meta?.task_timeline_row_id ?? row.id), row]));
  const nextRows: AgentMessage[] = [];
  for (const row of mapped) {
    const rowKey = String(row.id);
    const prior = previous.get(rowKey);
    const annotated = annotate(row, entry, entry.program, rowKey);
    annotated.meta = { ...(annotated.meta ?? {}), task_timeline_row_id: rowKey };
    nextRows.push(prior ? { ...annotated, id: prior.id } : annotated);
  }
  projection.rows = nextRows;
  // A raw delta updates the existing row in place. The caller merges this
  // replacement by task_timeline_row_id, preserving Leo/native cursor order.
  return nextRows;
}

function mapLeoEntry(entry: TaskTimelineEntry): AgentMessage[] {
  const message = record(entry.message);
  if (!message || typeof message.id !== "number" || (message.role !== "user" && message.role !== "assistant")) return [];
  const row = message as unknown as AgentMessage;
  return [{
    ...annotate(row, entry, entry.program, String(row.id)),
    ...(entry.created_at && !row.created_at ? { created_at: entry.created_at } : {}),
  }];
}

/** Drop repeated cursors while retaining the server's total order. */
export function uniqueTimelineEntries(entries: readonly TaskTimelineEntry[]): TaskTimelineEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!entry || typeof entry.cursor !== "string" || seen.has(entry.cursor)) return false;
    seen.add(entry.cursor);
    return true;
  });
}

/** Reset reducer memory between task switches or after a server reset. */
export function resetTaskTimelineMapping(): void {
  // Kept as a compatibility seam for hosts that used the first preview of the
  // mapper. Mapping itself is pure and owns reducer memory per invocation.
}

/**
 * Convert one server-ordered page/tail into the shared AgentMessage stream.
 * Entries are never grouped by session for display; a native row may be
 * replaced in place as a later delta arrives, while Leo/native interleaving is
 * retained by cursor order.
 */
export function mapTaskTimelineEntries(entries: readonly TaskTimelineEntry[]): AgentMessage[] {
  const ordered = uniqueTimelineEntries(entries);
  const nativeStates = new Map<string, NativeProjection>();
  const out: AgentMessage[] = [];
  const byRow = new Map<string, number>();
  for (const entry of ordered) {
    const rows = entry.source === "leo" ? mapLeoEntry(entry) : mapNativeEntry(entry, nativeStates);
    for (const row of rows) {
      const rowKey = `${entry.source}:${entry.session_id ?? "leo"}:${String(row.meta?.task_timeline_row_id ?? row.id)}`;
      const at = byRow.get(rowKey);
      if (at === undefined) {
        byRow.set(rowKey, out.length);
        out.push(row);
      } else {
        out[at] = { ...row, id: out[at].id };
      }
    }
  }
  let currentEngine = "";
  return out.map((row) => {
    if (row.role === "user") {
      return { ...row, meta: stripEngineLabel(row.meta) };
    }
    const sender = row.meta?.sender;
    const engine = typeof row.meta?.engine === "string"
      ? row.meta.engine
      : sender && typeof sender === "object" && typeof (sender as Record<string, unknown>).program === "string"
        ? String((sender as Record<string, unknown>).program)
        : "";
    if (!engine) return { ...row, meta: stripEngineLabel(row.meta) };
    const showLabel = engine !== currentEngine;
    currentEngine = engine;
    return {
      ...row,
      meta: {
        ...(stripEngineLabel(row.meta) ?? {}),
        ...(showLabel ? { engine_label: engineLabel(engine as TaskProgram) } : {}),
      },
    };
  });
}

export const mapTimelineEntries = mapTaskTimelineEntries;

function hasQueued(state: TaskState): boolean {
  return state.queued.length > 0;
}

/** Project I3 into the task page's honest UI states. */
export function mapTaskState(state: TaskState): TaskUiState {
  const raw = String(state.status || "idle");
  let status: TaskUiStatus;
  if (raw === "saving_delayed" || /saving[_ -]?delayed/i.test(state.reason ?? "")) status = "saving_delayed";
  else if (raw === "offline") status = "offline";
  else if (raw === "failed") status = "failed";
  else if (raw === "stopping") status = "stopping";
  else if (raw === "stopped") status = "stopped";
  else if (raw === "waiting_user") status = "waiting_user";
  else if (raw === "queued" || hasQueued(state)) status = "queued";
  else if (raw === "working") status = "working";
  else status = "idle";
  return {
    status,
    program: state.program,
    sessionId: state.session_id,
    since: state.since,
    lastOutputAt: state.last_output_at,
    reason: state.reason,
    request: state.request,
    pendingStop: state.pending_stop === true,
    computer: state.computer,
  };
}

/** Render queued prompts as ordinary user rows, preserving their immutable id. */
export function queuedTaskMessages(state: TaskState): AgentMessage[] {
  return state.queued.map((queued) => ({
    id: stableNegativeId(`queued:${queued.client_message_id}`),
    role: "user",
    kind: "text",
    content: typeof queued.text === "string" ? queued.text : "",
    created_at: queued.created_at,
    meta: {
      engine: queued.program,
      engine_label: engineLabel(queued.program),
      queued: true,
      client_message_id: queued.client_message_id,
      task_timeline_queued: true,
      ...(Array.isArray(queued.attachments) && queued.attachments.length ? { attachments: queued.attachments } : {}),
    },
  }));
}

export const mapQueuedItems = queuedTaskMessages;
export const taskStateToUi = mapTaskState;
