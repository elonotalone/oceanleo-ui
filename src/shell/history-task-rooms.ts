"use client";

// 「我的任务」里的任务（人的会话）：`GET /v1/task-rooms?scope=mine`。
// 读不到（迁移没上 = 503 / 旧网关没有路由 / 没登录 / 网络）→ `null`：列表就是今天的平铺列表。
// 一次失败不清掉上一份成功的结果（与任务列表同一条规矩：不拿编造的空结果顶替）。
import { useEffect, useState } from "react";
import type { HistoryTaskRoom } from "./history-model";
import type { TaskRoomCall, TaskRoomSummaryLite } from "./messages/tasks/task-room-calls";

// 按需加载：任务接口走 LeoChat 的网关客户端，「我的任务」列表本身不静态依赖它。
async function readMyTaskRooms(signal: AbortSignal): Promise<TaskRoomCall<TaskRoomSummaryLite[]>> {
  try {
    const { listMyTaskRooms } = await import("./messages/tasks/task-room-calls");
    return await listMyTaskRooms(signal);
  } catch {
    return { ok: false, unavailable: false, status: 0, code: "load_failed", message: "" };
  }
}

const ROOMS_POLL_MS = 30_000;

export function useMyTaskRooms(enabled = true): HistoryTaskRoom[] | null {
  const [rooms, setRooms] = useState<HistoryTaskRoom[] | null>(null);
  useEffect(() => {
    if (!enabled) {
      setRooms(null);
      return;
    }
    let alive = true;
    let controller: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const read = async () => {
      controller?.abort();
      const own = new AbortController();
      controller = own;
      const result = await readMyTaskRooms(own.signal);
      if (!alive || own.signal.aborted) return;
      if (result.ok) {
        setRooms((current) => (current && sameRooms(current, result.data) ? current : result.data));
      } else if (result.unavailable || result.status === 401) {
        setRooms(null);
      }
      // Not available on this server (before the database change): no polling; a window focus asks again.
      if (result.ok || !result.unavailable) timer = setTimeout(() => void read(), ROOMS_POLL_MS);
    };
    void read();
    const onFocus = () => {
      if (timer) clearTimeout(timer);
      void read();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      controller?.abort();
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled]);
  return rooms;
}

function sameRooms(a: HistoryTaskRoom[], b: HistoryTaskRoom[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((room, index) => {
    const other = b[index];
    return room.id === other.id && room.title === other.title && room.last_message_at === other.last_message_at &&
      (room.unread ?? 0) === (other.unread ?? 0) && (room.project?.name ?? null) === (other.project?.name ?? null);
  });
}
