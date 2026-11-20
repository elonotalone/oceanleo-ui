"use client";

/**
 * Where a task sits in the task tree, for the task page layout, the header trail and "Discuss with people".
 * Every call to the task-room routes made by the right panel / task page goes through here.
 *
 * Before the task-room tables exist the server answers 503 `task_rooms_unavailable` (an older gateway: 404).
 * Then the chain is "unavailable" and every caller behaves exactly as before the feature: today's task page,
 * today's header, no new entry, no error. Once the server said so, this page session does not ask again.
 */
import { useEffect, useState } from "react";
import { taskRoomsApi, type TaskRoomChainItem } from "../../lib/task-rooms-api";
import type { WorkspaceTaskEntry } from "../workspace-actions";

export type TaskChainItem = TaskRoomChainItem;

export type TaskChainState =
  | { state: "loading"; chain: [] }
  | { state: "unavailable"; chain: [] }
  | { state: "ready"; chain: TaskChainItem[] };

/** How `/tasks/{id}` is laid out. */
export type TaskPageLayout =
  | { kind: "resolving" }
  /** Today's page: the agent task alone. */
  | { kind: "plain" }
  /** The id is a task (people's conversation): it is the page. */
  | { kind: "room"; roomId: string }
  /** A sub task with a parent task: the parent is the page, this sub task opens beside it. */
  | { kind: "child"; parentRoomId: string; entry: WorkspaceTaskEntry };

export const TASK_CHAIN_CHANGED_EVENT = "oceanleo:task-chain-changed";
const CACHE_MS = 30_000;
const LAYOUT_TIMEOUT_MS = 4_000;

let featureUnavailable = false;
const chainCache = new Map<string, { at: number; value: Promise<TaskChainState> }>();

type RoomsFailure = { ok: false; unavailable: boolean; status?: number; code?: string };

/** 503 `task_rooms_unavailable`, or a gateway that has no such route at all. */
function markIfUnavailable(result: RoomsFailure): void {
  if (result.unavailable || (result.status === 404 && !result.code)) featureUnavailable = true;
}

function validChain(value: unknown): TaskChainItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is TaskChainItem => Boolean(item) && typeof item === "object" &&
    (item.kind === "room" || item.kind === "agent_task") && typeof item.id === "string" && Boolean(item.id))
    .map((item) => ({ ...item, title: typeof item.title === "string" ? item.title : "" }));
}

async function fetchChain(taskId: string): Promise<TaskChainState> {
  if (featureUnavailable) return { state: "unavailable", chain: [] };
  try {
    const result = await taskRoomsApi.getTaskChain(taskId);
    if (!result.ok) {
      markIfUnavailable(result as RoomsFailure);
      return { state: "unavailable", chain: [] };
    }
    return { state: "ready", chain: validChain((result.data as { chain?: unknown })?.chain) };
  } catch {
    return { state: "unavailable", chain: [] };
  }
}

/** Root first, ending with this task. Cached briefly so the page, the panel and the header share one read. */
export function loadTaskChain(taskId: string): Promise<TaskChainState> {
  const cached = chainCache.get(taskId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const value = fetchChain(taskId);
  chainCache.set(taskId, { at: Date.now(), value });
  return value;
}

/** The task was wrapped / attached / detached: every view of it reads its place again. */
export function notifyTaskChainChanged(taskId: string): void {
  chainCache.delete(taskId);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(TASK_CHAIN_CHANGED_EVENT, { detail: { taskId } }));
  }
}

function useChainChanged(taskId: string | null | undefined, onChange: () => void): void {
  useEffect(() => {
    if (!taskId || typeof window === "undefined") return undefined;
    const receive = (event: Event) => {
      if ((event as CustomEvent<{ taskId?: string }>).detail?.taskId === taskId) onChange();
    };
    window.addEventListener(TASK_CHAIN_CHANGED_EVENT, receive);
    return () => window.removeEventListener(TASK_CHAIN_CHANGED_EVENT, receive);
  }, [taskId, onChange]);
}

/** The chain of a task for its header; `unavailable` (or no task yet) = today's header. */
export function useTaskChain(taskId: string | null | undefined): TaskChainState {
  const [value, setValue] = useState<{ taskId: string; state: TaskChainState } | null>(null);
  const [epoch, setEpoch] = useState(0);
  useChainChanged(taskId, useStableBump(setEpoch));
  useEffect(() => {
    if (!taskId) return undefined;
    let live = true;
    void loadTaskChain(taskId).then((state) => { if (live) setValue({ taskId, state }); });
    return () => { live = false; };
  }, [taskId, epoch]);
  if (!taskId) return { state: "unavailable", chain: [] };
  return value?.taskId === taskId ? value.state : { state: "loading", chain: [] };
}

function useStableBump(setEpoch: (update: (value: number) => number) => void): () => void {
  const [bump] = useState(() => () => setEpoch((value) => value + 1));
  return bump;
}

/** The parent task of a sub task, from its chain (the entry just before it), when that parent is a task. */
export function parentRoomOf(chain: readonly TaskChainItem[]): TaskChainItem | null {
  const parent = chain.length >= 2 ? chain[chain.length - 2] : null;
  return parent?.kind === "room" ? parent : null;
}

async function resolveLayout(id: string): Promise<TaskPageLayout> {
  if (featureUnavailable) return { kind: "plain" };
  const roomRead = taskRoomsApi.getRoom(id).then((result: { ok: true } | RoomsFailure) => {
    if (!result.ok) markIfUnavailable(result as RoomsFailure);
    return result.ok;
  }, () => false);
  const [isRoom, chain] = await Promise.all([roomRead, loadTaskChain(id)]);
  if (isRoom) return { kind: "room", roomId: id };
  if (chain.state !== "ready") return { kind: "plain" };
  const self = chain.chain[chain.chain.length - 1];
  const parent = parentRoomOf(chain.chain);
  if (!parent || !self || self.kind !== "agent_task" || self.id !== id) return { kind: "plain" };
  return { kind: "child", parentRoomId: parent.id, entry: { kind: "agent_task", id, title: self.title } };
}

/** Decide the `/tasks/{id}` layout: a cheap read of the room and the chain, today's page on any doubt. */
export function useTaskPageLayout(id: string): TaskPageLayout {
  const [layout, setLayout] = useState<{ id: string; epoch: number; value: TaskPageLayout } | null>(null);
  const [epoch, setEpoch] = useState(0);
  useChainChanged(id, useStableBump(setEpoch));
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      if (live) setLayout((current) => current?.id === id && current.epoch === epoch ? current : { id, epoch, value: { kind: "plain" } });
    }, LAYOUT_TIMEOUT_MS);
    void resolveLayout(id).catch((): TaskPageLayout => ({ kind: "plain" })).then((value) => {
      if (!live) return;
      clearTimeout(timer);
      // A page already shown after the timeout only changes when a re-read was asked for (epoch).
      setLayout((current) => current?.id === id && current.epoch === epoch ? current : { id, epoch, value });
    });
    return () => { live = false; clearTimeout(timer); };
  }, [id, epoch]);
  if (!id) return { kind: "plain" };
  // A re-read keeps showing the current layout until the new answer arrives (no flash).
  if (layout?.id === id) return layout.value;
  return { kind: "resolving" };
}

/** A `/tasks/{id}` link names either a sub task or a task; one cheap read tells which. */
export async function resolveTaskLinkKind(id: string): Promise<"agent_task" | "room"> {
  if (featureUnavailable) return "agent_task";
  try {
    const result = await taskRoomsApi.getRoom(id);
    if (!result.ok) markIfUnavailable(result as RoomsFailure);
    return result.ok ? "room" : "agent_task";
  } catch {
    return "agent_task";
  }
}

function clientId(): string {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `wrap-${random}`;
}

/** "Discuss with people": wrap this sub task into a new task (idempotent on the server). */
export async function startTaskDiscussion(taskId: string): Promise<{ ok: true; roomId: string } | { ok: false }> {
  try {
    const result = await taskRoomsApi.wrapTask(taskId, { client_id: clientId() });
    if (!result.ok) {
      markIfUnavailable(result as RoomsFailure);
      return { ok: false };
    }
    const roomId = (result.data as { room_id?: unknown })?.room_id;
    if (typeof roomId !== "string" || !roomId) return { ok: false };
    notifyTaskChainChanged(taskId);
    return { ok: true, roomId };
  } catch {
    return { ok: false };
  }
}

export function resetTaskChainForTests(): void {
  featureUnavailable = false;
  chainCache.clear();
}
