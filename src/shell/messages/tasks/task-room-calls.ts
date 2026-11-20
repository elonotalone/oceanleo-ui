// LeoChat / My tasks 用到的任务（人的会话）接口：只是 TU1 的唯一客户端 `taskRoomsApi`（src/lib/task-rooms-api.ts）
// 上面薄薄一层形状整理，不另起一份网络请求。口径：task-rooms wave 合同 §2.2（`POST /v1/task-rooms`、
// `GET /v1/task-rooms?scope=mine`、`POST /v1/im/conversations/{id}/start-task`）。
// 迁移还没上的网关回 503 `task_rooms_unavailable`（旧网关没有这条路由 = 404/405）：客户端一律读成「暂不可用」，
// 调用方据此退回今天的样子，绝不编造内容。
import { taskRoomsApi, type TaskRoomsResult } from "../../../lib/task-rooms-api";

/** 任务名称的长度上限（输入框 maxLength、默认名截断；与网关 TITLE_MAX 一致）。 */
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

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** 客户端的失败形状 → 这里的形状（「暂不可用」不带细节）。 */
function failed<T>(result: Exclude<TaskRoomsResult<unknown>, { ok: true }>): TaskRoomCall<T> {
  if (result.unavailable) return { ok: false, unavailable: true };
  return { ok: false, unavailable: false, status: result.status, code: result.code, message: result.message };
}

const invalid = { ok: false as const, unavailable: false as const, status: 502, code: "invalid", message: "" };

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

// 这台网关上有没有任务功能（迁移上了没有）。只记确定的答案：读成功 = 有；503 / 没有这条路由 = 没有；
// 别的失败（没登录、网络）不记，下次再问。入口（例如「发给人」）在确定「有」之前不出现：迁移前一切照旧。
let availability: boolean | null = null;
let availabilityProbe: Promise<boolean> | null = null;

function noteAvailability(result: TaskRoomsResult<unknown>): void {
  if (result.ok) availability = true;
  else if (result.unavailable) availability = false;
}

/** 已知的答案（没问过 / 没问出来 = null）。 */
export function knownTaskRoomsAvailability(): boolean | null {
  return availability;
}

/** 任务功能在不在：一次便宜的读（我的任务列表），整页共用一个答案。 */
export function taskRoomsAvailable(): Promise<boolean> {
  if (availability !== null) return Promise.resolve(availability);
  availabilityProbe ??= taskRoomsApi.listMyRooms().then((result) => {
    noteAvailability(result);
    availabilityProbe = null;
    return availability === true;
  }, () => {
    availabilityProbe = null;
    return false;
  });
  return availabilityProbe;
}

/** 测试用：忘掉答案。 */
export function resetTaskRoomsAvailability(): void {
  availability = null;
  availabilityProbe = null;
}

/** 我是成员的任务（不含项目根任务），最新活动在前。`signal` 已中止时不再整理结果。 */
export async function listMyTaskRooms(signal?: AbortSignal): Promise<TaskRoomCall<TaskRoomSummaryLite[]>> {
  const result = await taskRoomsApi.listMyRooms();
  noteAvailability(result);
  if (signal?.aborted) return { ok: false, unavailable: false, status: 0, code: "aborted", message: "" };
  if (!result.ok) return failed(result);
  const rows = Array.isArray((result.data as { rooms?: unknown })?.rooms) ? (result.data.rooms as unknown[]) : [];
  return { ok: true, data: rows.map(normalizeRoomSummary).filter((row): row is TaskRoomSummaryLite => row !== null) };
}

export interface CreateTaskRoomInput {
  title?: string;
  member_ids: string[];
  first_message?: { body: string };
  project_id?: string;
  client_id: string;
}

/** 新建一个任务（人的会话）；回任务 id（= im 会话 id）。 */
export async function createTaskRoom(input: CreateTaskRoomInput): Promise<TaskRoomCall<{ id: string; title: string }>> {
  const result = await taskRoomsApi.createRoom(input);
  if (!result.ok) return failed(result);
  const room = (result.data as { room?: { id?: unknown; title?: unknown } } | null)?.room;
  const id = text(room?.id);
  return id ? { ok: true, data: { id, title: text(room?.title) } } : invalid;
}

export interface StartTaskInput {
  message_ids: string[];
  member_ids?: string[];
  title?: string;
  client_id: string;
}

/** 选中的消息开一个新任务；任务卡片贴在原会话里。 */
export async function startTaskFromConversation(
  conversationId: string,
  input: StartTaskInput,
): Promise<TaskRoomCall<{ room_id: string; card_message_id: string | null }>> {
  const result = await taskRoomsApi.startTaskFromConversation(conversationId, input);
  if (!result.ok) return failed(result);
  const body = result.data as { room_id?: unknown; card_message_id?: unknown } | null;
  const roomId = text(body?.room_id);
  return roomId ? { ok: true, data: { room_id: roomId, card_message_id: text(body?.card_message_id) || null } } : invalid;
}

/** 一次提交一个 client_id：重复点按钮 / 网络重试时服务端只建一个。 */
export function newClientId(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
