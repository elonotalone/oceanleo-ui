import type { AgentMessage } from "../../lib/agent";
import { latestTurn } from "./turn";

/** `localStorage[TTFV_DEBUG_FLAG] = "1"` 时每条记录同时打到 console。 */
export const TTFV_DEBUG_FLAG = "oleo.debug.ttfv";

const MAX_RECORDS = 100;
const MAX_PENDING = 50;

/**
 * 一轮对话的「按下发送 → 回复第一次渲染出非空文字」。时刻都是 `Date.now()` 毫秒；
 * `firstTokenMs` / `replyPath` 原样抄自回复行的 `meta.first_token_ms` / `meta.reply_path`，
 * 用来和服务端逐条对照、分桶。
 */
export interface TtfvRecord {
  taskId: string;
  turnKey: string;
  ttfvMs: number;
  sentAt: number;
  visibleAt: number;
  messageId?: number;
  firstTokenMs?: number;
  replyPath?: string;
}

export interface TtfvReplyDetail {
  messageId?: number;
  firstTokenMs?: number;
  replyPath?: string;
}

declare global {
  interface Window {
    __oleoAgentTtfv?: TtfvRecord[];
  }
}

const pending = new Map<string, number>();
const serverSideRecords: TtfvRecord[] = [];

export function ttfvClock(): number {
  return Date.now();
}

function pendingKey(taskId: string, turnKey: string | number): string {
  return `${taskId}\u0000${String(turnKey)}`;
}

function records(): TtfvRecord[] {
  if (typeof window === "undefined") return serverSideRecords;
  if (!Array.isArray(window.__oleoAgentTtfv)) window.__oleoAgentTtfv = [];
  return window.__oleoAgentTtfv;
}

function debugEnabled(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage?.getItem(TTFV_DEBUG_FLAG) === "1";
  } catch {
    return false;
  }
}

/** 用户按下发送。新建对话要等 task id 回来才能记，所以时刻可以由调用方补传。 */
export function markSend(taskId: string, turnKey: string | number, at: number = ttfvClock()): void {
  if (!taskId) return;
  const key = pendingKey(taskId, turnKey);
  pending.delete(key);
  pending.set(key, at);
  while (pending.size > MAX_PENDING) {
    const oldest = pending.keys().next().value;
    if (oldest === undefined) break;
    pending.delete(oldest);
  }
}

/** 这一轮还在等首字时，用户是什么时候按下发送的。 */
export function sentAtFor(taskId: string, turnKey: string | number): number | null {
  return pending.get(pendingKey(taskId, turnKey)) ?? null;
}

/** 回复第一次渲染出非空文字。没有对应的发送（例如刷新后回看旧回答）或已记过就不记。 */
export function markFirstVisible(
  taskId: string,
  turnKey: string | number,
  detail: TtfvReplyDetail = {},
): TtfvRecord | null {
  const key = pendingKey(taskId, turnKey);
  const sentAt = pending.get(key);
  if (sentAt === undefined) return null;
  pending.delete(key);
  const visibleAt = ttfvClock();
  const record: TtfvRecord = {
    taskId,
    turnKey: String(turnKey),
    ttfvMs: Math.max(0, visibleAt - sentAt),
    sentAt,
    visibleAt,
    ...(detail.messageId !== undefined ? { messageId: detail.messageId } : {}),
    ...(detail.firstTokenMs !== undefined ? { firstTokenMs: detail.firstTokenMs } : {}),
    ...(detail.replyPath !== undefined ? { replyPath: detail.replyPath } : {}),
  };
  const list = records();
  list.push(record);
  if (list.length > MAX_RECORDS) list.splice(0, list.length - MAX_RECORDS);
  if (debugEnabled()) {
    console.info(
      `[oleo:ttfv] task=${taskId} turn=${record.turnKey} ttfv=${record.ttfvMs}ms` +
        ` first_token_ms=${record.firstTokenMs ?? "-"} reply_path=${record.replyPath ?? "-"}` +
        ` message=${record.messageId ?? "-"}`,
    );
  }
  return record;
}

export function readTtfv(): TtfvRecord[] {
  return [...records()];
}

/** 看一眼当前消息表：本轮回复出了字就记一笔（每轮只记第一次）。 */
export function noteFirstVisibleReply(taskId: string, messages: AgentMessage[]): TtfvRecord | null {
  if (!taskId) return null;
  const { turn, firstText } = latestTurn(messages);
  if (!firstText || sentAtFor(taskId, turn) === null) return null;
  const firstTokenMs = firstText.meta?.first_token_ms;
  const replyPath = firstText.meta?.reply_path;
  return markFirstVisible(taskId, turn, {
    messageId: firstText.id,
    ...(typeof firstTokenMs === "number" && Number.isFinite(firstTokenMs) ? { firstTokenMs } : {}),
    ...(typeof replyPath === "string" && replyPath ? { replyPath } : {}),
  });
}
