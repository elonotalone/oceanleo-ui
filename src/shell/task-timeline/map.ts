import type { AgentAttachment, AgentMessage } from "../../lib/agent";
import type {
  TaskState,
  TaskLocalMessageInput,
  TaskTimelineLiveFrame,
  TaskTimelineEntry,
  TaskProgram,
} from "../../lib/task-timeline-api";
import { PROGRAM_LABEL } from "../../lib/native-programs";

/** The small state vocabulary the task page renders. */
export type TaskUiStatus =
  | "working" | "waiting_user" | "queued" | "stopping" | "stopped"
  | "failed" | "offline" | "saving_delayed" | "idle";

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
  savingDelayed?: boolean;
};

export type TaskTimelineProjectionCache = { sessions: Map<string, unknown> };
export type TaskTimelineMapOptions = { live?: readonly TaskTimelineLiveFrame[]; cache?: TaskTimelineProjectionCache };
export type TaskLocalDelivery = "sending" | "sent" | "unsent";

export function createTaskTimelineProjectionCache(): TaskTimelineProjectionCache {
  return { sessions: new Map() };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
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
export function taskProgramLabel(program: TaskProgram): string { return engineLabel(program); }

function annotate(row: AgentMessage, entry: TaskTimelineEntry, rowKey: string): AgentMessage {
  const frame = record(entry.frame);
  const messageId = typeof frame?.message_id === "string" && frame.message_id ? frame.message_id : "";
  const id = row.role === "user" && messageId
    ? stableNegativeId(`user:${messageId}`)
    : stableNegativeId(`${entry.source}:${entry.session_id ?? "leo"}:${rowKey}`);
  return {
    ...row,
    id,
    created_at: row.created_at || entry.created_at,
    meta: {
      ...(row.meta ?? {}),
      engine: entry.program,
      engine_label: engineLabel(entry.program),
      task_timeline_cursor: entry.cursor,
      task_timeline_source: entry.source,
      task_timeline_row_id: rowKey,
      ...(messageId ? { client_message_id: messageId } : {}),
      task_timeline_server: true,
      ...(entry.__live ? { task_timeline_live: true } : { task_timeline_committed: true }),
      ...(entry.session_id ? { task_timeline_session_id: entry.session_id } : {}),
    },
  };
}

type InternalEntry = TaskTimelineEntry & { __live?: boolean };

type RowState = { row: AgentMessage; key: string; turnId?: string; lastText?: string };

function frameText(frame: Record<string, unknown>): string {
  for (const key of ["text", "content", "message"]) if (typeof frame[key] === "string") return String(frame[key]);
  return "";
}

function frameType(frame: Record<string, unknown>): string {
  return typeof frame.t === "string" ? frame.t : typeof frame.type === "string" ? frame.type : "";
}

function mergeText(previous: string, next: string): string {
  if (!next) return previous;
  if (!previous) return next;
  if (next.startsWith(previous)) return next;
  if (previous.startsWith(next)) return previous;
  return `${previous}${next}`;
}

function mapNativeEntries(entries: readonly InternalEntry[]): AgentMessage[] {
  const rows: RowState[] = [];
  const byKey = new Map<string, RowState>();
  const byTurn = new Map<string, RowState>();
  for (const entry of entries) {
    const frame = record(entry.frame);
    if (!frame) continue;
    const type = frameType(frame);
    const turnId = typeof frame.turn_id === "string" ? frame.turn_id : typeof frame.acp_turn_id === "string" ? frame.acp_turn_id : undefined;
    const session = entry.session_id ?? "task";
    const text = frameText(frame);
    let row: RowState | undefined;
    if (type === "user_message" || type === "user" || type === "prompt") {
      const messageId = typeof frame.message_id === "string" ? frame.message_id : `${session}:${entry.cursor}`;
      const key = `user:${messageId}`;
      row = byKey.get(key);
      const mapped = annotate({ id: 0, role: "user", kind: "text", content: text, meta: {} }, entry, key);
      if (row) {
        row.row = { ...row.row, ...mapped, id: row.row.id, meta: { ...(row.row.meta ?? {}), ...(mapped.meta ?? {}) } };
      } else {
        row = { row: mapped, key, turnId, lastText: text };
        byKey.set(key, row); rows.push(row);
      }
      continue;
    }
    if (["delta", "assistant", "assistant_message", "text", "thought", "reasoning", "done", "turn_end", "tool", "tool_call", "permission", "question", "notice", "error"].includes(type)) {
      const key = turnId ? `turn:${session}:${turnId}` : `assistant:${session}`;
      row = byTurn.get(key);
      const role: "assistant" = "assistant";
      const kind = type === "thought" || type === "reasoning" ? "thinking" : type === "tool" || type === "tool_call" ? "step" : "text";
      const meta: AgentMessage["meta"] = { ...(kind === "thinking" ? { interim: true } : {}), ...(type === "done" || type === "turn_end" ? { final: true } : {}) };
      if (type === "tool" || type === "tool_call") meta.tool = frame.tool ?? frame;
      const nextText = type === "done" || type === "turn_end" ? (row?.lastText ?? text) : text;
      const mapped = annotate({ id: 0, role, kind, content: nextText, meta }, entry, key);
      if (row) {
        const content = type === "delta" || type === "assistant" || type === "assistant_message" || type === "text" || type === "thought" || type === "reasoning"
          ? mergeText(row.lastText ?? row.row.content, text) : (text || row.row.content);
        row.lastText = content;
        row.row = { ...row.row, ...mapped, id: row.row.id, content, kind: row.row.kind === "text" ? kind : row.row.kind, meta: { ...(row.row.meta ?? {}), ...(mapped.meta ?? {}) } };
      } else {
        row = { row: { ...mapped, content: nextText }, key, turnId, lastText: nextText };
        byTurn.set(key, row); rows.push(row);
      }
      continue;
    }
  }
  return rows.map((state) => state.row);
}

function liveEntry(entry: TaskTimelineLiveFrame): InternalEntry {
  return {
    cursor: `~live:${entry.session_id}:${entry.no}`,
    source: "native",
    program: entry.program,
    session_id: entry.session_id,
    created_at: entry.at,
    frame: { ...(entry.frame ?? {}), program: entry.program, acp_session: entry.session_id },
    no_from: entry.no,
    no_to: entry.no,
    __live: true,
  };
}

function mapLeoEntry(entry: TaskTimelineEntry): AgentMessage[] {
  const message = record(entry.message);
  if (!message || typeof message.id !== "number" || (message.role !== "user" && message.role !== "assistant")) return [];
  return [annotate(message as unknown as AgentMessage, entry, `leo:${message.id}`)];
}

function priority(row: AgentMessage): number {
  return row.meta?.task_timeline_server || row.meta?.task_timeline_committed || row.meta?.task_timeline_live ? 5
    : row.meta?.task_timeline_queued ? 2 : row.meta?.task_timeline_local ? 1 : 0;
}

export function localTaskMessage(input: TaskLocalMessageInput, delivery: TaskLocalDelivery = "sending", reason?: string, createdAt = new Date().toISOString()): AgentMessage {
  return {
    id: stableNegativeId(`user:${input.clientMessageId}`), role: "user", kind: "text", content: input.text, created_at: createdAt,
    meta: { task_timeline_local: true, client_message_id: input.clientMessageId, delivery, ...(reason ? { unsent_reason: reason } : {}), ...(input.attachments?.length ? { attachments: input.attachments } : {}), engine: input.program, engine_label: engineLabel(input.program) },
  };
}

/** Merge server, queued, and local user rows while retaining the first row position/id. */
export function mergeTaskTimelineUserRows(rows: readonly AgentMessage[]): AgentMessage[] {
  const selected = new Map<string, { row: AgentMessage; priority: number; position: number }>();
  const order: AgentMessage[] = [];
  for (const row of rows) {
    if (row.role !== "user") { order.push(row); continue; }
    const id = typeof row.meta?.client_message_id === "string" ? row.meta.client_message_id : "";
    if (!id) { order.push(row); continue; }
    const score = priority(row); const previous = selected.get(id);
    if (!previous) { selected.set(id, { row, priority: score, position: order.length }); order.push(row); }
    else if (score >= previous.priority) { const replacement = { ...row, id: previous.row.id }; selected.set(id, { ...previous, row: replacement, priority: score }); order[previous.position] = replacement; }
  }
  return order;
}

export function uniqueTimelineEntries(entries: readonly TaskTimelineEntry[]): TaskTimelineEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => Boolean(entry && typeof entry.cursor === "string" && !seen.has(entry.cursor) && (seen.add(entry.cursor), true)));
}

function committedThrough(entries: readonly TaskTimelineEntry[], sessionId: string): number {
  let through = 0;
  for (const entry of entries) if (entry.source === "native" && entry.session_id === sessionId && Number.isFinite(entry.no_to)) through = Math.max(through, Number(entry.no_to));
  return through;
}

export function mapTaskTimelineEntries(entries: readonly TaskTimelineEntry[], options: TaskTimelineMapOptions = {}): AgentMessage[] {
  const committed = uniqueTimelineEntries(entries);
  const live = [...(options.live ?? [])]
    .filter((entry) => entry && typeof entry.session_id === "string" && Number.isSafeInteger(entry.no) && entry.no > committedThrough(committed, entry.session_id))
    .sort((a, b) => a.session_id.localeCompare(b.session_id) || a.no - b.no)
    .map(liveEntry);
  const ordered = [...committed as InternalEntry[], ...live];
  const out: AgentMessage[] = [];
  const positions = new Map<string, number>();
  const nativeBySession = new Map<string, InternalEntry[]>();
  const nativeRows = new Map<string, AgentMessage[]>();
  for (const entry of ordered) {
    if (entry.source !== "native") continue;
    const key = `${entry.program}:${entry.session_id ?? "task"}`;
    const batch = nativeBySession.get(key) ?? []; batch.push(entry); nativeBySession.set(key, batch);
    nativeRows.set(key, mapNativeEntries(batch));
    const rows = nativeRows.get(key) ?? [];
    // A session's projection is rebuilt cheaply; replace rows in their original positions.
    for (const row of rows) {
      const rowKey = `${key}:${String(row.meta?.task_timeline_row_id ?? row.id)}`;
      const position = positions.get(rowKey);
      if (position === undefined) { positions.set(rowKey, out.length); out.push(row); }
      else out[position] = { ...row, id: out[position].id };
    }
  }
  // Leo rows retain their cursor position; append native rows already represented above in source order is enough for task rendering.
  for (const entry of committed) if (entry.source === "leo") out.push(...mapLeoEntry(entry));
  // Restore server order for Leo/native interleaving by cursor where possible.
  const byCursor = new Map<string, AgentMessage>();
  for (const row of out) { const cursor = typeof row.meta?.task_timeline_cursor === "string" ? row.meta.task_timeline_cursor : ""; if (cursor) byCursor.set(cursor, row); }
  const orderedRows: AgentMessage[] = [];
  const seen = new Set<number>();
  for (const entry of [...committed, ...live]) {
    const matching = [...byCursor.entries()].find(([cursor]) => cursor === entry.cursor)?.[1];
    if (matching && !seen.has(matching.id)) { orderedRows.push(matching); seen.add(matching.id); }
  }
  for (const row of out) if (!seen.has(row.id)) orderedRows.push(row);
  const deduped: AgentMessage[] = [];
  const seenUsers = new Set<string>();
  for (const row of orderedRows) {
    if (row.role === "user") {
      const id = typeof row.meta?.client_message_id === "string" ? row.meta.client_message_id : "";
      if (id && seenUsers.has(id)) continue;
      if (id) seenUsers.add(id);
    }
    deduped.push(row);
  }
  let currentEngine = "";
  return deduped.map((row) => {
    if (row.role === "user") return row;
    const engine = typeof row.meta?.engine === "string" ? row.meta.engine : "";
    const label = engine && engine !== currentEngine ? engineLabel(engine as TaskProgram) : undefined;
    currentEngine = engine || currentEngine;
    return label ? { ...row, meta: { ...(row.meta ?? {}), engine_label: label } } : row;
  });
}

export const mapTimelineEntries = mapTaskTimelineEntries;

function hasQueued(state: TaskState): boolean { return state.queued.length > 0; }
export function mapTaskState(state: TaskState): TaskUiState {
  const raw = String(state.status || "idle");
  let status: TaskUiStatus;
  if (raw === "saving_delayed" || /saving[_ -]?delayed/i.test(state.reason ?? "")) status = "saving_delayed";
  else if (["offline", "failed", "stopping", "stopped", "waiting_user", "queued", "working"].includes(raw)) status = raw as TaskUiStatus;
  else if (hasQueued(state)) status = "queued";
  else status = "idle";
  return { status, program: state.program, sessionId: state.session_id, since: state.since, lastOutputAt: state.last_output_at, reason: state.reason, request: state.request, pendingStop: state.pending_stop === true, computer: state.computer, savingDelayed: state.saving_delayed === true || status === "saving_delayed" };
}

export function queuedTaskMessages(state: TaskState): AgentMessage[] {
  return state.queued.map((queued) => ({ id: stableNegativeId(`queued:${queued.client_message_id}`), role: "user", kind: "text", content: typeof queued.text === "string" ? queued.text : "", created_at: queued.created_at, meta: { engine: queued.program, engine_label: engineLabel(queued.program), queued: true, client_message_id: queued.client_message_id, task_timeline_queued: true, ...(Array.isArray(queued.attachments) && queued.attachments.length ? { attachments: queued.attachments as AgentAttachment[] } : {}) } }));
}

export const mapQueuedItems = queuedTaskMessages;
export const taskStateToUi = mapTaskState;
export function resetTaskTimelineMapping(): void { /* projection cache is per hook invocation */ }
