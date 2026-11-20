// Tasks and sub tasks (task rooms wave 2026-11-20, contract §2.2): the typed client for every
// task-room route. A task is a people conversation (`im_conversations.kind = "task"`); a sub task is
// an agent run (`agent_tasks`). Every call answers a `TaskRoomsResult`: before the database change
// is applied the gateway answers 503 `task_rooms_unavailable` (an older gateway: 404 with no code),
// which comes back as `{ ok: false, unavailable: true }` and the UI says "not available yet".
import { GATEWAY_BASE } from "./auth/config";
import { accessToken } from "./auth/client";
import type { ImAttachment } from "./im/types";

export type TaskRoomOrigin = "new" | "wrapped" | "spun_off" | "project";
export type TaskChildKind = "agent_task" | "room";
export type TaskChildMode = "view" | "collaborate";
export type TaskChildStatus = "working" | "waiting" | "idle" | "failed" | "closed";
export type TaskChildAccess = "owner" | "collaborate" | "view" | "none";

export interface TaskRoomChainItem {
  kind: TaskChildKind;
  id: string;
  title: string;
}

export interface TaskRoomChild {
  kind: TaskChildKind;
  id: string;
  title: string;
  card_message_id: string | null;
  mode: TaskChildMode;
  owner: { id: string; name: string };
  program: string | null;
  /** From the task activity state machine; rooms have null. */
  status: TaskChildStatus | null;
  updated_at: string;
  my_access: TaskChildAccess;
}

export interface TaskRoom {
  id: string;
  title: string;
  origin: TaskRoomOrigin;
  project: { id: string; name: string } | null;
  created_by: string;
  my_role: "owner" | "admin" | "member";
  /** Rule 4: project viewers read and talk but cannot call an agent. */
  can_summon: boolean;
  chain: TaskRoomChainItem[];
  children: TaskRoomChild[];
  members_count: number;
}

export interface TaskRoomSummary {
  id: string;
  title: string;
  project: { id: string; name: string } | null;
  last_message_at: string | null;
  last_preview: string | null;
  unread: number;
  children_count: number;
}

export interface TaskHandoff {
  id: string;
  agent_task_id: string;
  sender: { id: string; name: string };
  message_ids: string[];
  created_at: string;
}

export interface ImportedMessages {
  conversation_id: string;
  message_ids: string[];
}

/** `"new"` or the id of an existing sub task. */
export type SummonTarget = "new" | string;

export interface SummonPreviewRequest {
  target: SummonTarget;
  /** Omitted / null: the server's default selection (rule 3). */
  message_ids?: string[] | null;
  prior_task_ids: string[];
  imported: ImportedMessages[];
}

export interface SummonPreview {
  messages: number;
  chars: number;
  /** Above the inline budget the record goes to the agent as a file. */
  as_file: boolean;
  limit_chars: number;
  default_message_ids: string[];
}

/** The fields the existing create-computer-task call takes (an agent conversation), plus the program settings picked with it. */
export interface SummonCreate {
  computer_id: string;
  program: string;
  title?: string;
  project_id?: string;
  model?: string;
  mode?: string;
  config?: Record<string, string | boolean>;
}

export interface SummonRequest {
  target: SummonTarget;
  message_ids: string[];
  prior_task_ids: string[];
  imported: ImportedMessages[];
  text: string;
  attachments?: ImAttachment[];
  create?: SummonCreate;
  mode?: TaskChildMode;
  client_id: string;
}

export interface SummonResult {
  task_id: string;
  card_message_id: string | null;
  handoff_id: string;
  chars: number;
  as_file: boolean;
}

export interface CreateRoomRequest {
  title?: string;
  member_ids: string[];
  first_message?: { body: string; attachments?: ImAttachment[] };
  project_id?: string;
  client_id: string;
}

export interface SpinOffRequest {
  message_ids: string[];
  member_ids: string[];
  title?: string;
  client_id: string;
}

export interface StartTaskRequest {
  message_ids: string[];
  member_ids?: string[];
  title?: string;
  client_id: string;
}

export type TaskRoomsFailure =
  | { ok: false; unavailable: true; status: number; code: "task_rooms_unavailable"; message: string }
  | { ok: false; unavailable: false; status: number; code: string; message: string };

export type TaskRoomsResult<T> = { ok: true; data: T } | TaskRoomsFailure;

export const TASK_ROOMS_UNAVAILABLE = "task_rooms_unavailable";

/** Transport seam (tests, hosts with their own fetch). Answers status + parsed JSON body (null when none). */
export type TaskRoomsTransport = (
  path: string,
  init: { method: string; json?: unknown },
) => Promise<{ status: number; body: unknown }>;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Errors arrive as `{code, message}` at the top level or under FastAPI's `detail`. */
export function taskRoomsFailure(status: number, body: unknown): TaskRoomsFailure {
  const top = record(body);
  const detail = top?.detail;
  const source = record(detail) ?? (typeof top?.code === "string" ? top : null);
  const code = typeof source?.code === "string" && source.code ? source.code : "";
  const message =
    typeof source?.message === "string" ? source.message : typeof detail === "string" ? detail : "";
  // An older gateway has no route at all: FastAPI's bare 404/405 carries no code.
  if (code === TASK_ROOMS_UNAVAILABLE || (!code && (status === 404 || status === 405))) {
    return { ok: false, unavailable: true, status, code: TASK_ROOMS_UNAVAILABLE, message };
  }
  return { ok: false, unavailable: false, status, code: code || (status ? `http_${status}` : "network"), message };
}

function apiUrl(path: string): string {
  return `${(GATEWAY_BASE || "").replace(/\/+$/, "")}${path}`;
}

export const gatewayTransport: TaskRoomsTransport = async (path, init) => {
  const token = await accessToken();
  if (!token) return { status: 401, body: { code: "unauthorized", message: "" } };
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  let body: string | undefined;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { method: init.method, headers, body });
  } catch {
    return { status: 0, body: { code: "network", message: "" } };
  }
  const text = await response.text().catch(() => "");
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return { status: response.status, body: parsed };
};

const enc = encodeURIComponent;

export function createTaskRoomsApi(transport: TaskRoomsTransport = gatewayTransport) {
  async function call<T>(method: string, path: string, json?: unknown): Promise<TaskRoomsResult<T>> {
    let answer: { status: number; body: unknown };
    try {
      answer = await transport(path, json === undefined ? { method } : { method, json });
    } catch {
      return taskRoomsFailure(0, null);
    }
    if (answer.status >= 200 && answer.status < 300) return { ok: true, data: answer.body as T };
    return taskRoomsFailure(answer.status, answer.body);
  }
  const room = (roomId: string) => `/v1/task-rooms/${enc(roomId)}`;
  return {
    createRoom: (input: CreateRoomRequest) => call<{ room: TaskRoom }>("POST", "/v1/task-rooms", input),
    listMyRooms: () => call<{ rooms: TaskRoomSummary[] }>("GET", "/v1/task-rooms?scope=mine"),
    getRoom: (roomId: string) => call<{ room: TaskRoom }>("GET", room(roomId)),
    getTaskChain: (taskId: string) => call<{ chain: TaskRoomChainItem[] }>("GET", `/v1/tasks/${enc(taskId)}/room`),
    wrapTask: (taskId: string, input: { client_id: string }) =>
      call<{ room_id: string; created: boolean }>("POST", `/v1/tasks/${enc(taskId)}/wrap`, input),
    spinOff: (roomId: string, input: SpinOffRequest) =>
      call<{ room_id: string; card_message_id: string }>("POST", `${room(roomId)}/spin-off`, input),
    setChildMode: (roomId: string, kind: TaskChildKind, childId: string, mode: TaskChildMode) =>
      call<{ child: TaskRoomChild }>("PATCH", `${room(roomId)}/children/${enc(kind)}/${enc(childId)}`, { mode }),
    detachChild: (roomId: string, kind: TaskChildKind, childId: string) =>
      call<unknown>("DELETE", `${room(roomId)}/children/${enc(kind)}/${enc(childId)}`),
    summonPreview: (roomId: string, input: SummonPreviewRequest) =>
      call<SummonPreview>("POST", `${room(roomId)}/summon/preview`, input),
    summon: (roomId: string, input: SummonRequest) => call<SummonResult>("POST", `${room(roomId)}/summon`, input),
    listHandoffs: (roomId: string) => call<{ handoffs: TaskHandoff[] }>("GET", `${room(roomId)}/handoffs`),
    startTaskFromConversation: (conversationId: string, input: StartTaskRequest) =>
      call<{ room_id: string; card_message_id: string }>(
        "POST",
        `/v1/im/conversations/${enc(conversationId)}/start-task`,
        input,
      ),
  };
}

export type TaskRoomsApi = ReturnType<typeof createTaskRoomsApi>;

export const taskRoomsApi: TaskRoomsApi = createTaskRoomsApi();
