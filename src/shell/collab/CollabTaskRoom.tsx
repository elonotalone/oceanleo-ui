"use client";

/** AI 任务页的同看头像（实体）：连任务房间、只显示在线头像，不绑文档。由 `CollabTaskGate.tsx` 懒加载。 */
import { useEffect } from "react";
import { CollabPresenceBar } from "./CollabPresenceBar";
import { useCollabRoom } from "./use-collab-room";

export function CollabTaskRoom({ taskId }: { taskId: string }) {
  const room = useCollabRoom({ resource: { kind: "task", id: taskId }, editorKind: "task", enabled: true });
  // 任务页不绑文档：被指派做种子也立刻交差，别占着 30 秒租约。
  useEffect(() => {
    if (!room) return undefined;
    const settle = () => {
      if (room.needsSeed) room.completeSeed([]);
    };
    settle();
    return room.subscribe(settle);
  }, [room]);
  return room ? <CollabPresenceBar room={room} /> : null;
}
