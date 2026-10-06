"use client";

/**
 * `useCollabRoom`：打开作品时连房间，离开时断开。`enabled` 为 false（境内、未登录、没有作品）
 * 或没有 `resource` 时返回 null，什么都不连。
 *
 * 组件拿到 room 后用 `useCollabRoomVersion(room)` 订阅状态变化重画；
 * `useCollabReadOnly` / `useCollabSaveGate` 已经自带订阅。
 */
import { useEffect, useReducer, useState } from "react";
import type { ImEditorKind } from "../../lib/im/types";
import type { CollabRoom } from "./index";
import { canSaveVersion, createCollabProvider, isCollabReadOnly } from "./provider";
import { currentCollabWsUrl, fetchCollabTicket } from "./grants-api";

export interface UseCollabRoomOptions {
  resource: { kind: "artifact" | "task"; id: string } | null;
  editorKind: ImEditorKind | "task";
  enabled: boolean;
}

export function useCollabRoom(opts: UseCollabRoomOptions): CollabRoom | null {
  const kind = opts.resource?.kind ?? null;
  const id = opts.resource?.id ?? null;
  const { editorKind, enabled } = opts;
  const [room, setRoom] = useState<CollabRoom | null>(null);

  useEffect(() => {
    if (!enabled || !kind || !id) {
      setRoom(null);
      return undefined;
    }
    const resource = { kind, id };
    const provider = createCollabProvider({
      roomKey: `${kind}:${id}`,
      fetchTicket: () => fetchCollabTicket(resource, editorKind),
      wsUrl: currentCollabWsUrl,
    });
    setRoom(provider);
    return () => {
      provider.destroy();
      setRoom(null);
    };
  }, [enabled, kind, id, editorKind]);

  // 订阅在子组件里做；这里只在房间对象换了之后返回新的。
  return room;
}

/** 订阅房间的状态变化（role/status/isSaver/lock/peers），变化时让调用方重画。 */
export function useCollabRoomVersion(room: CollabRoom | null): number {
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => (room ? room.subscribe(bump) : undefined), [room]);
  return version;
}

export function useCollabReadOnly(room: CollabRoom | null): boolean {
  useCollabRoomVersion(room);
  return isCollabReadOnly(room);
}

export function useCollabSaveGate(room: CollabRoom | null): boolean {
  useCollabRoomVersion(room);
  return canSaveVersion(room);
}
