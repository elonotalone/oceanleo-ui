import type { AgentAttachment, AgentMessage } from "../../lib/agent";
import type {
  TaskAcceptedMessage,
  TaskState,
  TaskLocalMessageInput,
  TaskTimelineEntry,
  TaskTimelineInflightEntry,
  TaskProgram,
} from "../../lib/task-timeline-api";
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

type InternalTimelineEntry = TaskTimelineEntry & {
  __inflight?: boolean;
  __epoch?: string;
  __s?: number;
};

type SessionProjectionCache = {
  entries: TaskTimelineEntry[];
  projection: NativeProjection;
  snapshots: Map<string, AgentMessage[]>;
};

/** Reusable reducer memory for a task. A live delta only advances its session. */
export type TaskTimelineProjectionCache = {
  sessions: Map<string, SessionProjectionCache>;
};

export type TaskTimelineMapOptions = {
  inflight?: readonly TaskTimelineInflightEntry[];
  cache?: TaskTimelineProjectionCache;
};

export type TaskLocalDelivery = "sending" | "sent" | "unsent";

export function createTaskTimelineProjectionCache(): TaskTimelineProjectionCache {
  return { sessions: new Map() };
}

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

export function taskProgramLabel(program: TaskProgram): string {
  return engineLabel(program);
}

function stripEngineLabel(meta: AgentMessage["meta"]): AgentMessage["meta"] | undefined {
  if (!meta || !Object.prototype.hasOwnProperty.call(meta, "engine_label")) return meta;
  const { engine_label: _engineLabel, ...rest } = meta;
  return rest;
}

function annotate(row: AgentMessage, entry: InternalTimelineEntry, program: TaskProgram, id: string): AgentMessage {
  const label = engineLabel(program);
  const frame = record(entry.frame);
  const messageId = typeof frame?.message_id === "string" && frame.message_id
    ? frame.message_id
    : typeof row.meta?.native_message_id === "string" && row.meta.native_message_id
      ? row.meta.native_message_id
      : "";
  const rowId = row.role === "user" && messageId ? stableNegativeId(`user:${messageId}`) : stableNegativeId(`${entry.source}:${entry.session_id ?? "leo"}:${id}`);
  return {
    ...row,
    id: rowId,
    meta: {
      ...(row.meta ?? {}),
      engine: program,
      engine_label: label,
      task_timeline_cursor: entry.cursor,
      task_timeline_source: entry.source,
      ...(messageId ? { client_message_id: messageId } : {}),
      ...(entry.__inflight ? { task_timeline_inflight: true } : { task_timeline_committed: true }),
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

function mapNativeEntry(entry: InternalTimelineEntry, nativeStates: Map<string, NativeProjection>): AgentMessage[] {
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
    nextRows.push(prior ? {
      ...annotated,
      id: prior.id,
      meta: {
        ...(annotated.meta ?? {}),
        ...(prior.meta?.task_timeline_source ? { task_timeline_source: prior.meta.task_timeline_source } : {}),
        ...(prior.meta?.task_timeline_committed ? { task_timeline_committed: true } : {}),
        ...(prior.meta?.task_timeline_inflight ? { task_timeline_inflight: true } : {}),
      },
    } : annotated);
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

export function localTaskMessage(
  input: TaskLocalMessageInput,
  delivery: TaskLocalDelivery = "sending",
  reason?: string,
  createdAt = new Date().toISOString(),
): AgentMessage {
  return {
    id: stableNegativeId(`user:${input.clientMessageId}`),
    role: "user",
    kind: "text",
    content: input.text,
    created_at: createdAt,
    meta: {
      task_timeline_local: true,
      client_message_id: input.clientMessageId,
      delivery,
      ...(reason ? { unsent_reason: reason } : {}),
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      engine: input.program,
      engine_label: engineLabel(input.program),
    },
  };
}

export function acceptedTaskMessage(message: TaskAcceptedMessage): AgentMessage {
  const input: TaskLocalMessageInput = {
    clientMessageId: message.client_message_id,
    text: message.text,
    attachments: message.attachments ?? [],
    program: message.program,
  };
  const row = localTaskMessage(input, "sent", undefined, message.created_at);
  return {
    ...row,
    meta: {
      ...(row.meta ?? {}),
      task_timeline_local: false,
      task_timeline_accepted: true,
      task_timeline_session_id: message.session_id,
    },
  };
}

function taskTimelineUserPriority(row: AgentMessage): number {
  return row.meta?.task_timeline_committed ? 5
    : row.meta?.task_timeline_inflight ? 4
      : row.meta?.task_timeline_accepted ? 3
        : row.meta?.task_timeline_queued ? 2
          : row.meta?.task_timeline_local ? 1 : 0;
}

/** Merge the five D8 user-row sources while retaining the first row position/id. */
export function mergeTaskTimelineUserRows(rows: readonly AgentMessage[]): AgentMessage[] {
  const selected = new Map<string, { row: AgentMessage; priority: number; position: number }>();
  const order: AgentMessage[] = [];
  for (const row of rows) {
    if (row.role !== "user") {
      order.push(row);
      continue;
    }
    const id = typeof row.meta?.client_message_id === "string" ? row.meta.client_message_id : "";
    if (!id) {
      order.push(row);
      continue;
    }
    const priority = taskTimelineUserPriority(row);
    const previous = selected.get(id);
    if (!previous) {
      selected.set(id, { row, priority, position: order.length });
      order.push(row);
    } else if (priority >= previous.priority) {
      const replacement = { ...row, id: previous.row.id };
      selected.set(id, { ...previous, row: replacement, priority });
      order[previous.position] = replacement;
    }
  }
  return order;
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

function timelineEntryKey(entry: TaskTimelineEntry): string {
  return entry.cursor;
}

function sameEntryPrefix(cached: readonly TaskTimelineEntry[], current: readonly TaskTimelineEntry[]): boolean {
  if (cached.length > current.length) return false;
  for (let index = 0; index < cached.length; index += 1) {
    if (cached[index] !== current[index]) return false;
  }
  return true;
}

function inflightEntry(entry: TaskTimelineInflightEntry): InternalTimelineEntry {
  const frame = { ...(entry.frame ?? {}), program: entry.program, acp_session: entry.session_id };
  return {
    cursor: `~inflight:${entry.epoch}:${entry.s}`,
    source: "native",
    program: entry.program,
    session_id: entry.session_id,
    created_at: entry.at,
    frame,
    __inflight: true,
    __epoch: entry.epoch,
    __s: entry.s,
  };
}

function projectSession(
  committed: readonly TaskTimelineEntry[],
  live: readonly InternalTimelineEntry[],
  cache?: TaskTimelineProjectionCache,
  sessionKey = "",
): Map<string, AgentMessage[]> {
  const cached = cache?.sessions.get(sessionKey);
  const reusable = cached && sameEntryPrefix(cached.entries, committed);
  const projection: NativeProjection = reusable
    ? { state: cached.projection.state, rows: cached.projection.rows }
    : { state: { ...initialDialogState(), program: committed[0]?.program ?? live[0]?.program ?? "oceanleo" }, rows: [] };
  const snapshots = reusable ? new Map(cached.snapshots) : new Map<string, AgentMessage[]>();
  const start = reusable ? cached.entries.length : 0;
  for (let index = start; index < committed.length; index += 1) {
    const entry = committed[index] as InternalTimelineEntry;
    snapshots.set(timelineEntryKey(entry), mapNativeEntry(entry, new Map([[sessionKey, projection]])));
  }
  // The committed baseline is cached independently. Coverage can remove the
  // live tail without forcing a 7,801-frame session through the reducer again.
  if (cache) {
    cache.sessions.set(sessionKey, { entries: [...committed], projection: { state: projection.state, rows: projection.rows }, snapshots: new Map(snapshots) });
  }
  for (const entry of live) {
    snapshots.set(timelineEntryKey(entry), mapNativeEntry(entry, new Map([[sessionKey, projection]])));
  }
  return snapshots;
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
export function mapTaskTimelineEntries(entries: readonly TaskTimelineEntry[], options: TaskTimelineMapOptions = {}): AgentMessage[] {
  const orderedCommitted = uniqueTimelineEntries(entries);
  const live = [...(options.inflight ?? [])]
    .filter((entry) => entry && typeof entry.session_id === "string" && typeof entry.epoch === "string" && Number.isFinite(entry.s))
    .sort((a, b) => a.session_id.localeCompare(b.session_id) || a.epoch.localeCompare(b.epoch) || a.s - b.s)
    .map(inflightEntry);
  const ordered: InternalTimelineEntry[] = [...orderedCommitted as InternalTimelineEntry[], ...live];
  const committedBySession = new Map<string, TaskTimelineEntry[]>();
  const liveBySession = new Map<string, InternalTimelineEntry[]>();
  for (const entry of orderedCommitted) {
    if (entry.source !== "native") continue;
    const key = nativeKey(entry);
    const list = committedBySession.get(key) ?? [];
    list.push(entry);
    committedBySession.set(key, list);
  }
  for (const entry of live) {
    const key = nativeKey(entry);
    const list = liveBySession.get(key) ?? [];
    list.push(entry);
    liveBySession.set(key, list);
  }
  const snapshotsBySession = new Map<string, Map<string, AgentMessage[]>>();
  for (const key of new Set([...committedBySession.keys(), ...liveBySession.keys()])) {
    snapshotsBySession.set(key, projectSession(committedBySession.get(key) ?? [], liveBySession.get(key) ?? [], options.cache, key));
  }
  const out: AgentMessage[] = [];
  const byRow = new Map<string, number>();
  for (const entry of ordered) {
    const rows = entry.source === "leo"
      ? mapLeoEntry(entry)
      : snapshotsBySession.get(nativeKey(entry))?.get(timelineEntryKey(entry)) ?? [];
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
  const userRows = new Map<string, { row: AgentMessage; priority: number; at: number }>();
  const userPositions = new Map<string, number>();
  const priorityOf = (row: AgentMessage): number => row.meta?.task_timeline_committed ? 5
    : row.meta?.task_timeline_inflight ? 4
      : row.meta?.task_timeline_accepted ? 3
        : row.meta?.task_timeline_queued ? 2
          : row.meta?.task_timeline_local ? 1 : 0;
  for (let index = 0; index < out.length; index += 1) {
    const row = out[index];
    if (row.role !== "user") continue;
    const id = typeof row.meta?.client_message_id === "string" ? row.meta.client_message_id : "";
    if (!id) continue;
    const priority = priorityOf(row);
    const old = userRows.get(id);
    if (!old || priority >= old.priority) {
      userRows.set(id, { row: { ...row, id: old?.row.id ?? row.id }, priority, at: index });
      if (!userPositions.has(id)) userPositions.set(id, index);
    }
  }
  for (const [id, value] of userRows) {
    const at = userPositions.get(id);
    if (at !== undefined) out[at] = value.row;
  }
  const seenUsers = new Set<string>();
  const deduped = out.filter((row) => {
    if (row.role !== "user") return true;
    const id = typeof row.meta?.client_message_id === "string" ? row.meta.client_message_id : "";
    if (!id) return true;
    if (seenUsers.has(id)) return false;
    seenUsers.add(id);
    return true;
  });
  let currentEngine = "";
  return deduped.map((row) => {
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
      ...(Array.isArray(queued.attachments) && queued.attachments.length
        ? { attachments: queued.attachments as AgentAttachment[] }
        : {}),
    },
  }));
}

export const mapQueuedItems = queuedTaskMessages;
export const taskStateToUi = mapTaskState;
