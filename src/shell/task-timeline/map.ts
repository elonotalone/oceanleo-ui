// Read by oceanleo-app mobile (features/native-agent/task-timeline.ts); the web task page no longer uses it.
import type { NativeAgentAttachment as AgentAttachment, NativeAgentMessage as AgentMessage } from "../../native-agent-core/index";
import type {
  TaskState,
  TaskLocalMessageInput,
  TaskTimelineLiveFrame,
  TaskTimelineEntry,
  TaskProgram,
} from "./types";
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
  savingDelayed: boolean;
};

type NativeProjection = {
  state: DialogState;
  rows: AgentMessage[];
  mappedMessages: Map<string, { message: AgentDialogMessage; rows: AgentMessage[] }>;
};

type InternalTimelineEntry = TaskTimelineEntry & {
  __live?: boolean;
  __no?: number;
};

type SessionProjectionCache = {
  entries: TaskTimelineEntry[];
  projection: NativeProjection;
  snapshots: Map<string, AgentMessage[]>;
};

/** Reusable reducer memory for a task. A live delta only advances its session. */
export type TaskTimelineProjectionCache = {
  sessions: Map<string, SessionProjectionCache>;
  rendered?: AgentMessage[];
  committedCursors?: string[];
  liveSignature?: string;
};

export type TaskTimelineMapOptions = {
  live?: readonly TaskTimelineLiveFrame[];
  cache?: TaskTimelineProjectionCache;
};

export type TaskLocalDelivery = "sending" | "sent" | "unsent";

export function createTaskTimelineProjectionCache(): TaskTimelineProjectionCache {
  return { sessions: new Map(), rendered: [] };
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
  // A projected dialog contains rows from the whole turn. The frame currently
  // being reduced may belong to a later assistant delta, so its message_id is
  // not an identity for every row in `row`. Only a user row may inherit the
  // current frame id, and only when its own mapper metadata has no id.
  const ownMessageId = row.role === "user" && typeof row.meta?.native_message_id === "string" && row.meta.native_message_id
    ? row.meta.native_message_id
    : row.role === "user" && typeof row.meta?.client_message_id === "string" && row.meta.client_message_id
      ? row.meta.client_message_id
      : row.role === "user" && typeof frame?.message_id === "string" && frame.message_id
        ? frame.message_id
        : "";
  const rowId = row.role === "user" && ownMessageId
    ? stableNegativeId(`user:${ownMessageId}`)
    : row.id;
  return {
    ...row,
    id: rowId,
    meta: {
      ...(row.meta ?? {}),
      engine: program,
      engine_label: label,
      task_timeline_cursor: entry.cursor,
      task_timeline_source: entry.source,
      ...(ownMessageId ? { client_message_id: ownMessageId } : {}),
      task_timeline_server: true,
      ...(entry.__live ? { task_timeline_live: true } : { task_timeline_committed: true }),
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
  const projection = { state, rows: [], mappedMessages: new Map() };
  nativeStates.set(key, projection);
  return projection;
}

function frameIsDialogMessage(frame: Record<string, unknown>): frame is Record<string, unknown> & { kind: string } {
  return typeof frame.kind === "string" && (frame.kind === "user" || frame.kind === "turn" || frame.kind === "notice");
}

function sameProjectedRow(previous: AgentMessage, next: AgentMessage): boolean {
  if (previous.id !== next.id || previous.role !== next.role || previous.kind !== next.kind || previous.content !== next.content || previous.created_at !== next.created_at) return false;
  const withoutCursor = (meta: AgentMessage["meta"]): Record<string, unknown> => {
    const out = { ...(meta ?? {}) };
    delete out.task_timeline_cursor;
    return out;
  };
  const oldMeta = withoutCursor(previous.meta);
  const nextMeta = withoutCursor(next.meta);
  const oldKeys = Object.keys(oldMeta);
  const nextKeys = Object.keys(nextMeta);
  return oldKeys.length === nextKeys.length && nextKeys.every((name) => {
    if (oldMeta[name] === nextMeta[name]) return true;
    // Attachment previews are reconstructed as fresh arrays by the dialog
    // mapper even when the user row itself did not change.
    return name === "attachments" && JSON.stringify(oldMeta[name]) === JSON.stringify(nextMeta[name]);
  });
}

function dialogItemKey(item: { kind: string; id?: string; seq?: number; text?: string }): string {
  return `${item.kind}:${item.seq ?? item.id ?? item.text ?? ""}`;
}

function mapDialogMessageIncremental(
  message: AgentDialogMessage,
  previous: { message: AgentDialogMessage; rows: AgentMessage[] } | undefined,
  program: TaskProgram,
): AgentMessage[] {
  if (!previous || message.kind !== "turn" || previous.message.kind !== "turn") {
    return dialogToAgentMessages([message], { live: false, engine: program });
  }
  const oldItems = new Map(previous.message.items.map((item) => [dialogItemKey(item), item]));
  const changedItems = message.items.filter((item) => oldItems.get(dialogItemKey(item)) !== item);
  if (!changedItems.length) return [];
  const partial = { ...message, items: changedItems };
  const mapped = dialogToAgentMessages([partial], { live: false, engine: program });
  const stepOffset = previous.rows.reduce((max, row) => Math.max(max, typeof row.meta?.step_index === "number" ? row.meta.step_index : 0), 0);
  return mapped.map((row) => typeof row.meta?.step_index === "number"
    ? { ...row, meta: { ...(row.meta ?? {}), step_index: row.meta.step_index + stepOffset } }
    : row);
}

function mapNativeEntry(entry: InternalTimelineEntry, nativeStates: Map<string, NativeProjection>): AgentMessage[] {
  const frame = record(entry.frame);
  if (!frame) return [];
  const projection = projectionFor(entry, nativeStates);
  if (frameIsDialogMessage(frame)) {
    const mapped = dialogToAgentMessages([frame as unknown as AgentDialogMessage], { live: false, engine: entry.program });
    const rows = mapped.map((row) => {
      const annotated = annotate(row, entry, entry.program, String(row.id));
      annotated.meta = { ...(annotated.meta ?? {}), task_timeline_row_id: String(row.id) };
      return annotated;
    });
    const previous = new Map(projection.rows.map((row) => [String(row.meta?.task_timeline_row_id ?? row.id), row]));
    projection.rows = [...rows, ...projection.rows.filter((row) => !rows.some((next) => String(next.meta?.task_timeline_row_id ?? next.id) === String(row.meta?.task_timeline_row_id ?? row.id)))];
    return rows.filter((row) => previous.get(String(row.meta?.task_timeline_row_id ?? row.id)) !== row);
  }
  projection.state = applyDialog(projection.state, { type: "frame", frame });
  const activeKeys = new Set<string>();
  const mapped: AgentMessage[] = [];
  for (const message of projection.state.messages) {
    const key = `${message.kind}:${message.id}`;
    activeKeys.add(key);
    const previous = projection.mappedMessages.get(key);
    const changedRows = previous?.message === message
      ? []
      : mapDialogMessageIncremental(message, previous, entry.program);
    const rows = previous ? previous.rows.slice() : [];
    for (const row of changedRows) {
      const at = rows.findIndex((old) => old.id === row.id);
      if (at >= 0) rows[at] = row;
      else rows.push(row);
    }
    projection.mappedMessages.set(key, { message, rows });
    mapped.push(...rows);
  }
  for (const key of projection.mappedMessages.keys()) {
    if (!activeKeys.has(key)) projection.mappedMessages.delete(key);
  }
  const previous = new Map(projection.rows.map((row) => [String(row.meta?.task_timeline_row_id ?? row.id), row]));
  const nextRows: AgentMessage[] = [];
  for (const row of mapped) {
    const rowKey = String(row.id);
    const prior = previous.get(rowKey);
    const annotated = annotate(row, entry, entry.program, rowKey);
    annotated.meta = { ...(annotated.meta ?? {}), task_timeline_row_id: rowKey };
    if (prior && sameProjectedRow(prior, annotated)) {
      nextRows.push(prior);
    } else {
      nextRows.push(prior ? {
        ...annotated,
        id: prior.id,
        meta: {
          ...(annotated.meta ?? {}),
          ...(prior.meta?.task_timeline_source ? { task_timeline_source: prior.meta.task_timeline_source } : {}),
          ...(prior.meta?.task_timeline_server ? { task_timeline_server: true } : {}),
          ...(prior.meta?.task_timeline_committed ? { task_timeline_committed: true } : {}),
          ...(prior.meta?.task_timeline_live ? { task_timeline_live: true } : {}),
        },
      } : annotated);
    }
  }
  const changedRows = nextRows.filter((row) => previous.get(String(row.meta?.task_timeline_row_id ?? row.id)) !== row);
  projection.rows = [...nextRows, ...projection.rows.filter((row) => !nextRows.some((next) => String(next.meta?.task_timeline_row_id ?? next.id) === String(row.meta?.task_timeline_row_id ?? row.id)))];
  // A raw delta updates the existing row in place. The caller merges this
  // replacement by task_timeline_row_id, preserving Leo/native cursor order.
  return changedRows;
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

function taskTimelineUserPriority(row: AgentMessage): number {
  return row.meta?.task_timeline_server || row.meta?.task_timeline_committed || row.meta?.task_timeline_live ? 5
    : row.meta?.task_timeline_queued ? 2
      : row.meta?.task_timeline_local ? 1 : 0;
}

/** Merge server, queued, and local user rows while retaining the first row position/id. */
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

function snapshotRowKey(row: AgentMessage): string {
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  return `${row.role}:${meta.task_timeline_source ?? ""}:${meta.task_timeline_session_id ?? ""}:${meta.task_timeline_row_id ?? row.id}`;
}

/** Keep each row's first position and latest value, rather than every delta's text. */
function compactSnapshots(snapshots: Map<string, AgentMessage[]>): Map<string, AgentMessage[]> {
  const firstCursor = new Map<string, string>();
  const latest = new Map<string, AgentMessage>();
  for (const [cursor, rows] of snapshots) {
    for (const row of rows) {
      const key = snapshotRowKey(row);
      if (!firstCursor.has(key)) firstCursor.set(key, cursor);
      latest.set(key, row);
    }
  }
  const compacted = new Map<string, AgentMessage[]>();
  for (const [key, cursor] of firstCursor) {
    const row = latest.get(key);
    if (!row) continue;
    const rows = compacted.get(cursor) ?? [];
    rows.push(row);
    compacted.set(cursor, rows);
  }
  return compacted;
}

function normalizeDisplayRows(rows: readonly AgentMessage[]): AgentMessage[] {
  let currentEngine = "";
  return rows.map((row) => {
    if (row.role === "user") {
      const meta = stripEngineLabel(row.meta);
      return meta === row.meta ? row : { ...row, meta };
    }
    const sender = row.meta?.sender;
    const engine = typeof row.meta?.engine === "string"
      ? row.meta.engine
      : sender && typeof sender === "object" && typeof (sender as Record<string, unknown>).program === "string"
        ? String((sender as Record<string, unknown>).program)
        : "";
    if (!engine) {
      const meta = stripEngineLabel(row.meta);
      return meta === row.meta ? row : { ...row, meta };
    }
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

function sameEntryPrefix(cached: readonly TaskTimelineEntry[], current: readonly TaskTimelineEntry[]): boolean {
  if (cached.length > current.length) return false;
  for (let index = 0; index < cached.length; index += 1) {
    if (cached[index] !== current[index]) return false;
  }
  return true;
}

function liveEntry(entry: TaskTimelineLiveFrame): InternalTimelineEntry {
  const frame = { ...(entry.frame ?? {}), program: entry.program, acp_session: entry.session_id };
  return {
    cursor: `~live:${entry.session_id}:${entry.no}`,
    source: "native",
    program: entry.program,
    session_id: entry.session_id,
    created_at: entry.at,
    frame,
    no_from: entry.no,
    no_to: entry.no,
    __live: true,
    __no: entry.no,
  };
}

function mapColdSingleNativeSession(
  committed: readonly TaskTimelineEntry[],
  liveFrames: readonly TaskTimelineLiveFrame[],
  cache?: TaskTimelineProjectionCache,
): AgentMessage[] {
  const first = committed[0];
  if (!first) return [];
  const projection: NativeProjection = {
    state: { ...initialDialogState(), program: first.program },
    rows: [],
    mappedMessages: new Map(),
  };
  for (const entry of committed) {
    const frame = record(entry.frame);
    if (frame) projection.state = applyDialog(projection.state, { type: "frame", frame });
  }
  const live = liveFrames
    .slice()
    .sort((a, b) => a.no - b.no)
    .map(liveEntry);
  for (const entry of live) {
    const frame = record(entry.frame);
    if (frame) projection.state = applyDialog(projection.state, { type: "frame", frame });
  }
  const mapped = dialogToAgentMessages(projection.state.messages, { live: live.length > 0, engine: first.program });
  const anchor = committed.at(-1)!;
  const rows = mapped.map((row) => {
    const annotated = annotate(row, anchor as InternalTimelineEntry, first.program, String(row.id));
    annotated.meta = {
      ...(annotated.meta ?? {}),
      task_timeline_row_id: String(row.id),
      ...(live.length && row.meta?.native_turn_live === true
        ? { task_timeline_cursor: live.at(-1)?.cursor ?? annotated.meta?.task_timeline_cursor, task_timeline_live: true, task_timeline_committed: undefined }
        : {}),
    };
    return annotated;
  });
  projection.rows = rows;
  // Seed per-dialog-message mappings so the first post-hydration delta only
  // maps its changed turn/item and can preserve every untouched row object.
  const annotatedById = new Map(rows.map((row) => [row.id, row]));
  for (const message of projection.state.messages) {
    const key = `${message.kind}:${message.id}`;
    const messageRows = dialogToAgentMessages([message], { live: live.length > 0, engine: first.program });
    projection.mappedMessages.set(key, {
      message,
      rows: messageRows.map((row) => annotatedById.get(row.id) ?? row),
    });
  }
  if (cache) {
    const key = nativeKey(first);
    cache.sessions.set(key, {
      entries: [...committed],
      projection,
      snapshots: new Map([[timelineEntryKey(first), rows]]),
    });
  }
  return normalizeDisplayRows(rows);
}

function projectSession(
  committed: readonly TaskTimelineEntry[],
  live: readonly InternalTimelineEntry[],
  cache?: TaskTimelineProjectionCache,
  sessionKey = "",
): Map<string, AgentMessage[]> {
  const cached = cache?.sessions.get(sessionKey);
  const reusable = cached && sameEntryPrefix(cached.entries, committed);
  const cachedSuffix = cached && cached.entries.length <= committed.length && cached.entries.every((entry, index) => {
    const at = committed.length - cached.entries.length + index;
    return committed[at]?.cursor === entry.cursor;
  });
  const projection: NativeProjection = reusable
    ? { state: cached.projection.state, rows: cached.projection.rows, mappedMessages: cached.projection.mappedMessages }
    : { state: { ...initialDialogState(), program: committed[0]?.program ?? live[0]?.program ?? "oceanleo" }, rows: [], mappedMessages: new Map() };
  let snapshots = reusable ? new Map(cached.snapshots) : new Map<string, AgentMessage[]>();
  // Older turn pages arrive as a prefix. Re-project that prefix only and keep
  // the cached suffix snapshots (and their row objects) intact.
  const start = reusable ? cached.entries.length : cachedSuffix ? 0 : 0;
  const end = reusable ? committed.length : cachedSuffix ? committed.length - cached.entries.length : committed.length;
  const prefixProjection: NativeProjection = cachedSuffix && !reusable
    ? { state: { ...initialDialogState(), program: committed[0]?.program ?? live[0]?.program ?? "oceanleo" }, rows: [], mappedMessages: new Map() }
    : projection;
  for (let index = start; index < end; index += 1) {
    const entry = committed[index] as InternalTimelineEntry;
    snapshots.set(timelineEntryKey(entry), mapNativeEntry(entry, new Map([[sessionKey, prefixProjection]])));
  }
  if (cachedSuffix && !reusable) {
    for (const [cursor, rows] of cached.snapshots) snapshots.set(cursor, rows);
  }
  snapshots = compactSnapshots(snapshots);
  // The committed baseline is cached independently. Number coverage can remove
  // the live tail without forcing a 7,801-frame session through the reducer again.
  if (cache) {
    cache.sessions.set(sessionKey, {
      entries: [...committed],
      // Keep the already-complete suffix reducer as the append baseline. The
      // prefix snapshots are independent and need no replay of newer rows.
      projection: reusable
        ? projection
        : cachedSuffix
          ? cached.projection
          : prefixProjection,
      snapshots: new Map(snapshots),
    });
  }
  const liveProjection: NativeProjection = reusable
    ? projection
    : cachedSuffix
      ? cached.projection
      : prefixProjection;
  for (const entry of live) {
    snapshots.set(timelineEntryKey(entry), mapNativeEntry(entry, new Map([[sessionKey, liveProjection]])));
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
  const cache = options.cache;
  const liveSignature = (options.live ?? []).map((frame) => `${frame.session_id}:${frame.no}`).join(",");
  const cachedCursors = cache?.committedCursors ?? [];
  // An older page is a prefix. Keep the already-rendered tail and project only
  // that prefix; this avoids replaying thousands of native deltas on scroll-up.
  if (cache?.rendered?.length && cachedCursors.length && liveSignature === cache.liveSignature &&
    cachedCursors.length <= orderedCommitted.length && cachedCursors.every((cursor, index) => orderedCommitted[orderedCommitted.length - cachedCursors.length + index]?.cursor === cursor)) {
    const prefix = orderedCommitted.slice(0, orderedCommitted.length - cachedCursors.length);
    if (prefix.length) {
      const prefixRows = mapTaskTimelineEntries(prefix);
      const merged = prefixRows.slice();
      const positions = new Map(merged.map((row, index) => [snapshotRowKey(row), index]));
      for (const row of cache.rendered) {
        const key = snapshotRowKey(row);
        const at = positions.get(key);
        if (at === undefined) { positions.set(key, merged.length); merged.push(row); }
        else merged[at] = row;
      }
      cache.committedCursors = orderedCommitted.map((entry) => entry.cursor);
      cache.sessions.forEach((session, key) => {
        const sessionPrefix = prefix.filter((entry) => entry.source === "native" && nativeKey(entry) === key);
        if (sessionPrefix.length) session.entries = [...sessionPrefix, ...session.entries];
      });
      cache.rendered = merged;
      return merged;
    }
  }
  const nativeKeys = new Set(orderedCommitted.filter((entry) => entry.source === "native").map(nativeKey));
  if (orderedCommitted.length > 100 && nativeKeys.size === 1 && orderedCommitted.every((entry) => entry.source === "native") && !cache?.sessions.size) {
    const rows = mapColdSingleNativeSession(orderedCommitted, options.live ?? [], cache);
    if (cache) {
      cache.rendered = rows;
      cache.committedCursors = orderedCommitted.map((entry) => entry.cursor);
      cache.liveSignature = liveSignature;
    }
    return rows;
  }
  const throughBySession = new Map<string, number>();
  for (const entry of orderedCommitted) {
    if (entry.source !== "native" || entry.session_id == null || !Number.isFinite(entry.no_to)) continue;
    throughBySession.set(entry.session_id, Math.max(throughBySession.get(entry.session_id) ?? 0, entry.no_to as number));
  }
  const live = [...(options.live ?? [])]
    .filter((entry) => entry && typeof entry.session_id === "string" && Number.isSafeInteger(entry.no))
    .filter((entry) => entry.no > (throughBySession.get(entry.session_id) ?? 0))
    .sort((a, b) => a.session_id.localeCompare(b.session_id) || a.no - b.no)
    .map(liveEntry);
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
  const priorityOf = (row: AgentMessage): number => row.meta?.task_timeline_server || row.meta?.task_timeline_committed || row.meta?.task_timeline_live ? 5
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
      const stableRow = !old || old.row.id === row.id ? row : { ...row, id: old.row.id };
      userRows.set(id, { row: stableRow, priority, at: index });
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
  const nextRendered = normalizeDisplayRows(deduped);
  const previousRendered = options.cache?.rendered ?? [];
  const previousByKey = new Map<string, AgentMessage>();
  const timelineMeta = (meta: AgentMessage["meta"]): Record<string, unknown> => (meta ?? {}) as Record<string, unknown>;
  for (const row of previousRendered) {
    const meta = timelineMeta(row.meta);
    const key = `${row.role}:${meta.task_timeline_source ?? ""}:${meta.task_timeline_session_id ?? ""}:${meta.task_timeline_row_id ?? row.id}`;
    previousByKey.set(key, row);
  }
  const rendered = nextRendered.map((row) => {
    const meta = timelineMeta(row.meta);
    const key = `${row.role}:${meta.task_timeline_source ?? ""}:${meta.task_timeline_session_id ?? ""}:${meta.task_timeline_row_id ?? row.id}`;
    const prior = previousByKey.get(key);
    if (!prior || prior.id !== row.id || prior.role !== row.role || prior.kind !== row.kind || prior.content !== row.content || prior.created_at !== row.created_at) return row;
    const priorMeta = timelineMeta(prior.meta);
    const nextMeta = meta;
    const priorKeys = Object.keys(priorMeta);
    const nextKeys = Object.keys(nextMeta);
    if (priorKeys.length !== nextKeys.length || nextKeys.some((name) => priorMeta[name] !== nextMeta[name])) return row;
    return prior;
  });
  if (options.cache) {
    options.cache.rendered = rendered;
    options.cache.committedCursors = orderedCommitted.map((entry) => entry.cursor);
    options.cache.liveSignature = liveSignature;
  }
  return rendered;
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
    savingDelayed: state.saving_delayed === true || status === "saving_delayed",
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
