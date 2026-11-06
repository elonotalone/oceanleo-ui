import type { AgentMessage } from "../../lib/agent";

/** The cache is intentionally small: it is a paint hint, never a transcript store. */
export const TASK_TAIL_CACHE_ROWS = 30;
export const TASK_TAIL_CACHE_TASKS = 20;
export const TASK_TAIL_CACHE_TEXT = 600;
const KEY_PREFIX = "oceanleo.task-tail:";
const INDEX_SUFFIX = ":index";

type CachedRow = {
  id: number;
  role: AgentMessage["role"];
  kind: string;
  content: string;
  created_at?: string;
  meta?: Record<string, unknown>;
};
type CacheIndexRow = { taskId: string; touchedAt: number };

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function key(userId: string, taskId: string): string {
  return userId && taskId ? `${KEY_PREFIX}${encodeURIComponent(userId)}:${encodeURIComponent(taskId)}` : "";
}

function indexKey(userId: string): string {
  return userId ? `${KEY_PREFIX}${encodeURIComponent(userId)}${INDEX_SUFFIX}` : "";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, TASK_TAIL_CACHE_TEXT) : "";
}

const SAFE_META = new Set([
  "client_message_id", "engine", "engine_label", "final", "stopped",
  "native_turn_id", "native_turn_live", "native_turn_finishing",
  "task_timeline_cursor", "task_timeline_source", "task_timeline_row_id",
  "task_timeline_server", "task_timeline_committed", "task_timeline_live",
]);

function safeMeta(meta: AgentMessage["meta"]): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const name of SAFE_META) {
    const value = meta[name];
    if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") out[name] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Remove attachment URLs, tool payloads, and arbitrary metadata before storage. */
export function serializeTaskTail(rows: readonly AgentMessage[]): CachedRow[] {
  return rows.slice(-TASK_TAIL_CACHE_ROWS).map((row) => ({
    id: Number.isSafeInteger(row.id) ? row.id : 0,
    role: row.role,
    kind: text(row.kind),
    content: text(row.content),
    ...(row.created_at ? { created_at: row.created_at } : {}),
    ...(safeMeta(row.meta) ? { meta: safeMeta(row.meta) } : {}),
  }));
}

export function deserializeTaskTail(value: unknown): AgentMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-TASK_TAIL_CACHE_ROWS).flatMap((raw): AgentMessage[] => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Partial<CachedRow>;
    const id = row.id;
    if (!Number.isSafeInteger(id) || (row.role !== "user" && row.role !== "assistant")) return [];
    return [{
      id: id as number,
      role: row.role,
      kind: text(row.kind),
      content: text(row.content),
      ...(typeof row.created_at === "string" ? { created_at: row.created_at } : {}),
      ...(row.meta && typeof row.meta === "object" && !Array.isArray(row.meta) ? { meta: safeMeta(row.meta) } : {}),
    }];
  });
}

function readIndex(userId: string): CacheIndexRow[] {
  const store = storage();
  const raw = indexKey(userId) && store?.getItem(indexKey(userId));
  if (!raw) return [];
  try {
    const rows = JSON.parse(raw) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows.filter((row): row is CacheIndexRow => Boolean(row) && typeof row === "object" &&
      typeof (row as CacheIndexRow).taskId === "string" && Number.isFinite((row as CacheIndexRow).touchedAt));
  } catch {
    return [];
  }
}

function writeIndex(userId: string, rows: CacheIndexRow[]): void {
  const store = storage();
  const target = indexKey(userId);
  if (!store || !target) return;
  try { store.setItem(target, JSON.stringify(rows.slice(-TASK_TAIL_CACHE_TASKS))); } catch { /* private mode/quota */ }
}

export function readTaskTailCache(userId: string, taskId: string): AgentMessage[] {
  const store = storage();
  const target = key(userId, taskId);
  if (!store || !target) return [];
  try {
    const raw = store.getItem(target);
    return raw ? deserializeTaskTail(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function writeTaskTailCache(userId: string, taskId: string, rows: readonly AgentMessage[]): void {
  const store = storage();
  const target = key(userId, taskId);
  if (!store || !target || !rows.length) return;
  try {
    store.setItem(target, JSON.stringify(serializeTaskTail(rows)));
    const now = Date.now();
    const index = readIndex(userId).filter((entry) => entry.taskId !== taskId);
    index.push({ taskId, touchedAt: now });
    const keep = index.sort((a, b) => a.touchedAt - b.touchedAt).slice(-TASK_TAIL_CACHE_TASKS);
    const dropped = new Set(index.map((entry) => entry.taskId));
    for (const entry of keep) dropped.delete(entry.taskId);
    for (const oldTask of dropped) store.removeItem(key(userId, oldTask));
    writeIndex(userId, keep);
  } catch {
    /* private mode/quota */
  }
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleTaskTailCache(userId: string, taskId: string, rows: readonly AgentMessage[], delayMs = 1_000): void {
  const target = key(userId, taskId);
  if (!target || !rows.length) return;
  const prior = pending.get(target);
  if (prior) clearTimeout(prior);
  const timer = setTimeout(() => {
    pending.delete(target);
    writeTaskTailCache(userId, taskId, rows);
  }, Math.max(1_000, delayMs));
  pending.set(target, timer);
}
