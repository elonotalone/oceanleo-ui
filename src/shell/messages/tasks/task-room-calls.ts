// LeoChat / My tasks 用到的任务（人的会话）接口：只是薄薄一层，走 im 客户端（带 token、网关地址、ImApiError）。
// 口径：task-rooms wave 合同 §2.2（`POST /v1/task-rooms`、`GET /v1/task-rooms?scope=mine`、
// `POST /v1/im/conversations/{id}/start-task`）。完整的类型化客户端归 TU1（`src/lib/task-rooms-api.ts`），
// 合并时这些调用可以换成它的 `createRoom` / `listMyRooms` / `startTaskFromConversation`。
// 迁移还没上的网关回 503 `task_rooms_unavailable`（旧网关没有这条路由 = 404/405）：一律当「暂不可用」，
// 调用方据此退回今天的样子，绝不编造内容。
import { ImApiError, imFetch } from "../../../lib/im/client";

/** 任务名称的长度上限（输入框 maxLength、默认名截断）。 */
export const TASK_TITLE_MAX = 80;

export interface TaskRoomSummaryLite {
  id: string;
  title: string;
  project: { id: string; name: string } | null;
  last_message_at: string | null;
  last_preview: string | null;
  unread: number;
  children_count: number;
}

export type TaskRoomCall<T> =
  | { ok: true; data: T }
  | { ok: false; unavailable: true }
  | { ok: false; unavailable: false; status: number; code: string; message: string };

/** 这条错误是不是「任务功能还没上 / 网关还没有这条路由」。 */
export function isTaskRoomsUnavailable(error: unknown): boolean {
  if (!(error instanceof ImApiError)) return false;
  if (error.code === "task_rooms_unavailable") return true;
  if (error.status === 503) return true;
  // 旧网关没有这条路由：FastAPI 默认的 404 / 405（没有我们自己的 code）。
  return (error.status === 404 || error.status === 405) && error.code.startsWith("http_");
}

async function call<T>(run: () => Promise<T>): Promise<TaskRoomCall<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    if (isTaskRoomsUnavailable(error)) return { ok: false, unavailable: true };
    if (error instanceof ImApiError) {
      return { ok: false, unavailable: false, status: error.status, code: error.code, message: error.message };
    }
    return { ok: false, unavailable: false, status: 0, code: "network", message: "" };
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** 把网关给的一行收拾成安全形状；没有 id 的行丢掉。 */
export function normalizeRoomSummary(raw: unknown): TaskRoomSummaryLite | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const id = text(row.id).trim();
  if (!id) return null;
  const project = row.project && typeof row.project === "object" ? (row.project as Record<string, unknown>) : null;
  return {
    id,
    title: text(row.title),
    project: project && text(project.id) ? { id: text(project.id), name: text(project.name) } : null,
    last_message_at: text(row.last_message_at) || null,
    last_preview: text(row.last_preview) || null,
    unread: count(row.unread),
    children_count: count(row.children_count),
  };
}

/** 我是成员的任务（不含项目根任务），最新活动在前。 */
export function listMyTaskRooms(signal?: AbortSignal): Promise<TaskRoomCall<TaskRoomSummaryLite[]>> {
  return call(async () => {
    const body = await imFetch<{ rooms?: unknown[] }>("/v1/task-rooms?scope=mine", { signal });
    const rows = Array.isArray(body?.rooms) ? body.rooms : [];
    return rows.map(normalizeRoomSummary).filter((row): row is TaskRoomSummaryLite => row !== null);
  });
}

export interface CreateTaskRoomInput {
  title?: string;
  member_ids: string[];
  first_message?: { body: string; attachments?: unknown[] };
  project_id?: string;
  client_id: string;
}

/** 新建一个任务（人的会话）；回任务 id（= im 会话 id）。 */
export function createTaskRoom(input: CreateTaskRoomInput): Promise<TaskRoomCall<{ id: string; title: string }>> {
  return call(async () => {
    const body = await imFetch<{ room?: { id?: unknown; title?: unknown } }>("/v1/task-rooms", { method: "POST", json: input });
    const id = text(body?.room?.id);
    if (!id) throw new ImApiError(502, "invalid", "");
    return { id, title: text(body?.room?.title) };
  });
}

export interface StartTaskInput {
  message_ids: string[];
  member_ids?: string[];
  title?: string;
  client_id: string;
}

/** 选中的消息开一个新任务；任务卡片贴在原会话里。 */
export function startTaskFromConversation(
  conversationId: string,
  input: StartTaskInput,
): Promise<TaskRoomCall<{ room_id: string; card_message_id: string | null }>> {
  return call(async () => {
    const body = await imFetch<{ room_id?: unknown; card_message_id?: unknown }>(
      `/v1/im/conversations/${encodeURIComponent(conversationId)}/start-task`,
      { method: "POST", json: input },
    );
    const roomId = text(body?.room_id);
    if (!roomId) throw new ImApiError(502, "invalid", "");
    return { room_id: roomId, card_message_id: text(body?.card_message_id) || null };
  });
}

/** 一次提交一个 client_id：重复点按钮 / 网络重试时服务端只建一个。 */
export function newClientId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
