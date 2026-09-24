// ============================================================================
// @oceanleo/ui — leo 服务端接口（合同 §4 I4；W4 提供后端，本文件是唯一消费点）
// ----------------------------------------------------------------------------
//   POST   /v1/assistant/leo-turn        一轮对话（可能建任务）
//   GET    /v1/assistant/leo-transcript  服务端记录（升序，跨页面跨设备同一份）
//   DELETE /v1/assistant/leo-transcript  清空记录
//
// 错误归一成四态，UI 只按这四态说话，不猜：
//   anonymous        未登录（401）——面板显示「登录后 leo 才能记住对话」；
//   network          网关连不上（status 0）；
//   outdated-gateway 路由不存在（404 且 detail 是框架默认的 "Not Found" 或没有 JSON）——
//                    连到的网关比这版 leo 旧，重试没用；
//   unavailable      其它失败（503、记录级 404 如 leo_session_not_found 等）——
//                    「记录暂时不可用，稍后再试。」。
// ============================================================================

import { authed } from "../../lib/agent";
import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";

/** leo 建的那条任务挂在记录条目上的卡片。 */
export interface LeoTranscriptTask {
  task_id: string;
  title: string;
  href: string;
}

/** 一条对话记录（服务端形状，合同 I4）。 */
export interface LeoTranscriptEntry {
  id: string;
  role: "user" | "leo";
  text: string;
  task?: LeoTranscriptTask | null;
  created_at?: string;
}

/** leo-turn 的页面上下文（线上蛇形；来自 I5 的 LeoContext，computerName 不上行）。 */
export interface LeoTurnWireContext {
  page: "home" | "task" | "shell" | "other";
  task_id?: string;
  computer_id?: string;
  shell_session_id?: string;
}

export interface LeoSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  entry_count: number;
}

export interface LeoTurnBody {
  session_id?: string;
  site_id: string;
  text: string;
  board_text: string;
  context: LeoTurnWireContext;
}

/** leo-turn 响应（合同 I4）。entries 是这一轮新增的两条（用户 + leo）。 */
export interface LeoTurnResult {
  session_id?: string;
  session?: LeoSession;
  reply: string;
  action: "reply" | "task" | "error";
  entries: LeoTranscriptEntry[];
  task: LeoTranscriptTask | null;
  error: "" | "llm_unavailable" | "create_failed";
}

export type LeoTurnStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; data: LeoTurnResult };

export type LeoApiError = "anonymous" | "network" | "unavailable" | "outdated-gateway";
export type LeoApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: LeoApiError };

/** 404 的 detail：路由缺失时是框架默认的 "Not Found"，代理层 404 没有 JSON（authed 给 `HTTP 404`）。 */
function isMissingRoute(status: number | undefined, detail: unknown): boolean {
  return status === 404 && (detail === "Not Found" || detail === "HTTP 404" || detail == null);
}

function normalizeError(status: number | undefined, detail?: unknown): LeoApiError {
  if (status === 401) return "anonymous";
  if (!status) return "network";
  if (isMissingRoute(status, detail)) return "outdated-gateway";
  return "unavailable";
}

function normalizeTask(value: unknown): LeoTranscriptTask | null {
  if (!value || typeof value !== "object") return null;
  const task = value as Partial<LeoTranscriptTask>;
  if (typeof task.task_id !== "string" || !task.task_id.trim()) return null;
  if (typeof task.href !== "string" || !task.href.trim()) return null;
  return {
    task_id: task.task_id,
    title: typeof task.title === "string" ? task.title : "",
    href: task.href,
  };
}

/** 服务端条目 → 面板条目；形状不对的行丢弃（记录可以旧，渲染不能炸）。 */
export function normalizeLeoEntry(value: unknown): LeoTranscriptEntry | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<LeoTranscriptEntry>;
  if (row.role !== "user" && row.role !== "leo") return null;
  if (typeof row.text !== "string") return null;
  return {
    id: typeof row.id === "string" && row.id ? row.id : `leo-entry-unknown-${row.role}`,
    role: row.role,
    text: row.text,
    task: row.role === "leo" ? normalizeTask(row.task) : null,
    ...(typeof row.created_at === "string" ? { created_at: row.created_at } : {}),
  };
}

function normalizeEntries(value: unknown): LeoTranscriptEntry[] {
  if (!Array.isArray(value)) return [];
  const rows: LeoTranscriptEntry[] = [];
  for (const item of value) {
    const entry = normalizeLeoEntry(item);
    if (entry) rows.push(entry);
  }
  return rows;
}

/** 一轮对话。body.context 缺省时调用方给 { page: "other" }（合同 I4 不再收 history）。 */
export async function leoTurn(body: LeoTurnBody): Promise<LeoApiResult<LeoTurnResult>> {
  const res = await authed<Partial<LeoTurnResult>>("/v1/assistant/leo-turn", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.data) return { ok: false, error: normalizeError(res.status, res.error) };
  const data = res.data;
  return {
    ok: true,
    data: {
      session_id: typeof data.session_id === "string" ? data.session_id : undefined,
      session: normalizeLeoSession(data.session) ?? undefined,
      reply: typeof data.reply === "string" ? data.reply : "",
      action:
        data.action === "task" || data.action === "error" ? data.action : "reply",
      entries: normalizeEntries(data.entries),
      task: normalizeTask(data.task),
      error:
        data.error === "llm_unavailable" || data.error === "create_failed"
          ? data.error
          : "",
    },
  };
}

/** True model SSE transport. The callback runs for every generated delta. */
export async function leoTurnStream(
  body: LeoTurnBody,
  onEvent: (event: LeoTurnStreamEvent) => void,
): Promise<LeoApiResult<LeoTurnResult>> {
  const token = await accessToken();
  if (!token) {
    const fallback = await leoTurn(body);
    if (fallback.ok && fallback.data.reply) onEvent({ type: "delta", text: fallback.data.reply });
    if (fallback.ok) onEvent({ type: "done", data: fallback.data });
    return fallback;
  }
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}/v1/assistant/leo-turn/stream`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "text/event-stream" },
      cache: "no-store",
      credentials: "include",
    });
  } catch {
    return { ok: false, error: "network" };
  }
  let streamRouteMissing = false;
  if (!res.ok) {
    const detail = await res.json().then(
      (payload: { detail?: unknown } | null) => payload?.detail,
      () => undefined,
    );
    if (!isMissingRoute(res.status, detail)) return { ok: false, error: normalizeError(res.status, detail) };
    streamRouteMissing = true;
  }
  const contentType = res.headers?.get?.("content-type") || "";
  if (streamRouteMissing || !res.body || !contentType.toLowerCase().includes("text/event-stream")) {
    // Older gateways have no stream route yet (404, or 200 without SSE); the plain route decides.
    const fallback = await leoTurn(body);
    if (fallback.ok && fallback.data.reply) onEvent({ type: "delta", text: fallback.data.reply });
    if (fallback.ok) onEvent({ type: "done", data: fallback.data });
    return fallback;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event = "message";
  let data = "";
  let result: LeoTurnResult | null = null;
  const consume = (line: string) => {
    if (line === "") {
      if (data) {
        try {
          const payload = JSON.parse(data) as unknown;
          if (event === "delta" && payload && typeof payload === "object" && typeof (payload as { text?: unknown }).text === "string") {
            onEvent({ type: "delta", text: (payload as { text: string }).text });
          } else if (event === "done" && payload && typeof payload === "object") {
            result = normalizeLeoTurnResult(payload);
            if (result) onEvent({ type: "done", data: result });
          }
        } catch { /* ignore malformed frames; the terminal frame decides success */ }
      }
      event = "message";
      data = "";
    } else if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  };
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) consume(line.replace(/\r$/, ""));
      if (chunk.done) break;
    }
    if (buffer) consume(buffer);
  } catch {
    return { ok: false, error: "network" };
  }
  return result ? { ok: true, data: result } : { ok: false, error: "unavailable" };
}

function normalizeLeoTurnResult(value: unknown): LeoTurnResult | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Partial<LeoTurnResult>;
  return {
    session_id: typeof data.session_id === "string" ? data.session_id : undefined,
    session: normalizeLeoSession(data.session) ?? undefined,
    reply: typeof data.reply === "string" ? data.reply : "",
    action: data.action === "task" || data.action === "error" ? data.action : "reply",
    entries: normalizeEntries(data.entries),
    task: normalizeTask(data.task),
    error: data.error === "llm_unavailable" || data.error === "create_failed" ? data.error : "",
  };
}

/** 最近 limit 条记录（升序）。 */
export async function leoTranscript(
  limit = 100,
  session_id?: string,
): Promise<LeoApiResult<{ entries: LeoTranscriptEntry[]; session_id?: string }>> {
  const res = await authed<{ entries?: unknown; session_id?: string }>(
    `/v1/assistant/leo-transcript?limit=${Math.max(1, Math.floor(limit))}${session_id ? `&session_id=${encodeURIComponent(session_id)}` : ""}`,
  );
  if (!res.ok || !res.data) return { ok: false, error: normalizeError(res.status, res.error) };
  return { ok: true, data: { entries: normalizeEntries(res.data.entries), session_id: res.data.session_id } };
}

/** 清空这个用户的全部 leo 记录。 */
export async function leoClear(session_id?: string): Promise<LeoApiResult<{ ok: true }>> {
  const res = await authed<{ ok?: boolean }>(`/v1/assistant/leo-transcript${session_id ? `?session_id=${encodeURIComponent(session_id)}` : ""}`, {
    method: "DELETE",
  });
  if (!res.ok) return { ok: false, error: normalizeError(res.status, res.error) };
  return { ok: true, data: { ok: true } };
}

export function normalizeLeoSession(value: unknown): LeoSession | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<LeoSession>;
  if (typeof row.id !== "string" || !row.id) return null;
  return { id: row.id, title: typeof row.title === "string" ? row.title : "",
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
    entry_count: typeof row.entry_count === "number" ? row.entry_count : 0 };
}
export async function leoSessions(): Promise<LeoApiResult<LeoSession[]>> {
  const res = await authed<{ sessions?: unknown }>("/v1/assistant/leo-sessions?limit=50");
  if (!res.ok || !Array.isArray(res.data?.sessions)) return { ok: false, error: normalizeError(res.status, res.error) };
  return { ok: true, data: res.data.sessions.map(normalizeLeoSession).filter((s): s is LeoSession => s !== null) };
}
async function mutateSession(path: string, method: string, body: object): Promise<LeoApiResult<LeoSession>> {
  const res = await authed<{ session?: unknown }>(path, { method, body: JSON.stringify(body) });
  const session = normalizeLeoSession(res.data?.session);
  return res.ok && session ? { ok: true, data: session } : { ok: false, error: normalizeError(res.status, res.error) };
}
export function leoCreateSession(site_id?: string) {
  return mutateSession("/v1/assistant/leo-sessions", "POST", { site_id });
}
export function leoRenameSession(id: string, title: string) {
  return mutateSession(`/v1/assistant/leo-sessions/${encodeURIComponent(id)}`, "PATCH", { title });
}
export async function leoDeleteSession(id: string): Promise<LeoApiResult<{ ok: true }>> {
  const res = await authed(`/v1/assistant/leo-sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  return res.ok ? { ok: true, data: { ok: true } } : { ok: false, error: normalizeError(res.status, res.error) };
}
