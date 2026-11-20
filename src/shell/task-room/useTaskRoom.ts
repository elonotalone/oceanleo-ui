"use client";

// One shared read of a task (room) per id: RoomView and every card in it use the same answer.
// Live: `task.card.updated` patches a child at once; reconnect, window focus and a visible tab
// read it again (a missed event never leaves a stale card for long).
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { taskRoomsApi, type TaskRoom, type TaskRoomChild } from "../../lib/task-rooms-api";
import type { ImMessage } from "../../lib/im/types";
import { useImEvent, useImResync } from "../messages/realtime/hooks";

function isTaskCard(message: ImMessage | null | undefined): boolean {
  return Boolean(message && (message.kind === "task" || message.card?.type === "task"));
}

export type TaskRoomState = "loading" | "ready" | "unavailable" | "not_member" | "error";

interface Entry {
  room: TaskRoom | null;
  state: TaskRoomState;
  inflight: Promise<void> | null;
  readAt: number;
  snapshot: { room: TaskRoom | null; state: TaskRoomState };
}

const entries = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();
const FOCUS_REREAD_MS = 5_000;
const EMPTY = { room: null, state: "loading" as TaskRoomState };

function entryFor(roomId: string): Entry {
  let entry = entries.get(roomId);
  if (!entry) {
    entry = { room: null, state: "loading", inflight: null, readAt: 0, snapshot: EMPTY };
    entries.set(roomId, entry);
  }
  return entry;
}

function publish(roomId: string, entry: Entry): void {
  entry.snapshot = { room: entry.room, state: entry.state };
  for (const listener of Array.from(listeners.get(roomId) ?? [])) listener();
}

export function readTaskRoom(roomId: string, force = false): Promise<void> {
  const entry = entryFor(roomId);
  if (entry.inflight) return entry.inflight;
  if (!force && entry.readAt && Date.now() - entry.readAt < FOCUS_REREAD_MS) return Promise.resolve();
  // Not a task (a card in an ordinary chat reads its chat once) or no task rooms on this server: a focus does not
  // ask again; membership changes and reconnects still do (forced).
  if (!force && entry.readAt && (entry.state === "not_member" || entry.state === "unavailable")) return Promise.resolve();
  entry.inflight = taskRoomsApi.getRoom(roomId).then((result) => {
    entry.inflight = null;
    entry.readAt = Date.now();
    if (result.ok) {
      entry.room = result.data?.room ?? null;
      entry.state = entry.room ? "ready" : "error";
    } else if (result.unavailable) {
      entry.state = "unavailable";
    } else if (result.code === "not_member" || result.status === 403 || result.status === 404) {
      entry.room = null;
      entry.state = "not_member";
    } else if (!entry.room) {
      entry.state = "error";
    }
    publish(roomId, entry);
  });
  return entry.inflight;
}

/** A child changed (realtime event, or this page changed it): update every view of the room now. */
export function patchTaskRoomChild(roomId: string, child: TaskRoomChild): void {
  const entry = entries.get(roomId);
  if (!entry?.room) return;
  const children = entry.room.children.some((item) => item.kind === child.kind && item.id === child.id)
    ? entry.room.children.map((item) => (item.kind === child.kind && item.id === child.id ? { ...item, ...child } : item))
    : [...entry.room.children, child];
  entry.room = { ...entry.room, children };
  publish(roomId, entry);
}

/** Forget a room (tests; account switch). */
export function clearTaskRooms(): void {
  entries.clear();
}

export function useTaskRoom(roomId: string | null): { room: TaskRoom | null; state: TaskRoomState; reload: () => void } {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!roomId) return () => {};
      let set = listeners.get(roomId);
      if (!set) listeners.set(roomId, (set = new Set()));
      set.add(listener);
      return () => {
        set!.delete(listener);
      };
    },
    [roomId],
  );
  const read = useCallback(() => (roomId ? entryFor(roomId).snapshot : EMPTY), [roomId]);
  const snapshot = useSyncExternalStore(subscribe, read, () => EMPTY);
  const reload = useCallback(() => {
    if (roomId) void readTaskRoom(roomId, true);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return undefined;
    void readTaskRoom(roomId);
    const again = () => {
      if (document.visibilityState === "hidden") return;
      void readTaskRoom(roomId);
    };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, [roomId]);

  useImEvent("task.card.updated", (event) => {
    if (roomId && event.conversation_id === roomId && event.child) patchTaskRoomChild(roomId, event.child);
  });
  // A child was attached (its card arrives as a new message) or removed (its card is recalled): the server sends no
  // `task.card.updated` for those, so the children list is read again.
  useImEvent("message.created", (event) => {
    if (roomId && event.conversation_id === roomId && isTaskCard(event.message)) void readTaskRoom(roomId, true);
  });
  useImEvent("message.updated", (event) => {
    if (roomId && event.conversation_id === roomId && isTaskCard(event.message) && event.message.recalled_at) {
      void readTaskRoom(roomId, true);
    }
  });
  useImResync(() => {
    if (roomId) void readTaskRoom(roomId, true);
  });
  return { room: snapshot.room, state: snapshot.state, reload };
}
