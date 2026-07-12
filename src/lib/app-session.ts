"use client";

// ============================================================================
// @oceanleo/ui — App 工作会话 client API
// ----------------------------------------------------------------------------
// app_session 是一次完整 app 工作的聚合根：操作台快照、agent thread、console runs 与
// artifacts 都通过 session_id 归到它。这里仅访问 owner-scoped 网关，不在浏览器伪造
// session UUID，也不把 localStorage 草稿冒充成历史。
// ============================================================================

import { authed, type AgentApiResult } from "./agent";
import { appSessionBodySupportsKeepalive } from "./app-session-transport";

export {
  APP_SESSION_KEEPALIVE_MAX_BYTES,
  appSessionBodySupportsKeepalive,
} from "./app-session-transport";

/** 现有 agent API base 下的规范 session 资源。 */
export const APP_SESSION_API_BASE = "/v1/agent/sessions";

export type AppSessionStatus = "active" | "archived" | string;

/** 一次完整 app 工作会话。snapshot 对共享包保持不透明，由各站 runtime 解释。 */
export interface AppSession {
  id: string;
  user_id?: string;
  site_id: string;
  app_id: string;
  title?: string | null;
  /** AI history-title lifecycle: pending | generated | fallback. */
  title_status?: string | null;
  title_generated_at?: string | null;
  status: AppSessionStatus;
  snapshot?: unknown;
  schema_version: number;
  revision: number;
  /** 本会话持续复用的 agent thread；纯操作台会话可以为空。 */
  task_id?: string | null;
  created_at: string;
  updated_at?: string;
  last_activity_at: string;
  archived_at?: string | null;
  parent_session_id?: string | null;
  branch_from_message_id?: number | null;
}

export interface ListAppSessionsOptions {
  limit?: number;
  siteId?: string;
  appId?: string;
  status?: AppSessionStatus;
  /** 「我的任务」需要包含 archived（已保存）会话；live 查活跃缓存时传 false。 */
  includeArchived?: boolean;
}

export interface EnsureAppSessionInput {
  siteId: string;
  appId: string;
  title?: string;
  snapshot?: Record<string, unknown>;
  schemaVersion?: number;
}

export interface UpdateAppSessionInput {
  /** 乐观并发版本。后端不匹配时必须返回 409。 */
  revision: number;
  /** 完整替换的不透明 workspace 快照。 */
  snapshot: Record<string, unknown>;
  /** 快照 schema 版本。 */
  schemaVersion: number;
  title?: string;
}

export interface ArchiveAppSessionResult {
  session_id: string;
  archived: boolean;
  session?: AppSession;
}

type SessionEnvelope = AppSession | { session: AppSession };
type SessionListEnvelope = { items: AppSession[] } | AppSession[];

/** 这些状态表示路由/方法尚未部署；401 是登录态，不属于“旧后端”。 */
export function isAppSessionApiUnavailableStatus(status?: number): boolean {
  return status === 404 || status === 405 || status === 501;
}

async function sessionRequest<T>(
  suffix: string,
  init?: RequestInit,
): Promise<AgentApiResult<T>> {
  return authed<T>(`${APP_SESSION_API_BASE}${suffix}`, init);
}

function jsonMutation(
  method: "POST" | "PUT",
  payload?: Record<string, unknown>,
): RequestInit {
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  return {
    method,
    body,
    // Fetch keepalive 按 UTF-8 字节计 64 KiB，不是 JS 字符数；中文快照若按 length 判断会
    // 低估约 3 倍并在 pagehide 直接抛 TypeError。预留协议开销，超过阈值走普通请求。
    keepalive: appSessionBodySupportsKeepalive(body),
  };
}

function unwrapSession(
  result: AgentApiResult<SessionEnvelope>,
): AgentApiResult<AppSession> {
  if (!result.ok || !result.data) return result as AgentApiResult<AppSession>;
  const data = result.data;
  const session =
    "session" in data && data.session ? data.session : (data as AppSession);
  return { ...result, data: session };
}

/** 按最后活动时间倒序列工作会话。 */
export async function listAppSessions(
  options: ListAppSessionsOptions = {},
): Promise<AgentApiResult<{ items: AppSession[] }>> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 100),
  });
  const site = (options.siteId || "").trim();
  const app = (options.appId || "").trim();
  if (site) params.set("site_id", site);
  if (app) params.set("app_id", app);
  if (options.status) params.set("status", options.status);
  else if (options.includeArchived === false) params.set("status", "active");
  const result = await sessionRequest<SessionListEnvelope>(
    `?${params.toString()}`,
  );
  if (!result.ok || !result.data) {
    return result as AgentApiResult<{ items: AppSession[] }>;
  }
  const items = Array.isArray(result.data)
    ? result.data
    : result.data.items || [];
  return { ...result, data: { items } };
}

/** 读取一条 owner-scoped 工作会话。 */
export async function getAppSession(
  sessionId: string,
): Promise<AgentApiResult<AppSession>> {
  const id = (sessionId || "").trim();
  if (!id) return { ok: false, error: "缺少 session_id", status: 400 };
  return unwrapSession(
    await sessionRequest<SessionEnvelope>(`/${encodeURIComponent(id)}`),
  );
}

/**
 * 取得该 site/app 最近的未归档会话；没有时创建。调用方只应在首次“有意义动作”时调用，
 * 不要因组件挂载就制造空历史。
 */
export async function ensureAppSession(
  input: EnsureAppSessionInput,
): Promise<AgentApiResult<AppSession>> {
  const payload: Record<string, unknown> = {
    site_id: (input.siteId || "").trim(),
    app_id: (input.appId || "").trim(),
  };
  if (!payload.site_id || !payload.app_id) {
    return { ok: false, error: "site_id 与 app_id 不能为空", status: 400 };
  }
  if (input.title !== undefined) payload.title = input.title;
  if (input.snapshot !== undefined) payload.snapshot = input.snapshot;
  if (input.schemaVersion !== undefined) {
    payload.schema_version = input.schemaVersion;
  }
  const result = await sessionRequest<SessionEnvelope>(
    "",
    jsonMutation("POST", payload),
  );
  return unwrapSession(result);
}

/** 以 revision 做 compare-and-swap；409 由上层重新读取并显式报告冲突。 */
export async function updateAppSession(
  sessionId: string,
  input: UpdateAppSessionInput,
): Promise<AgentApiResult<AppSession>> {
  const id = (sessionId || "").trim();
  if (!id) return { ok: false, error: "缺少 session_id", status: 400 };
  const payload: Record<string, unknown> = {
    revision: input.revision,
    snapshot: input.snapshot,
    schema_version: input.schemaVersion,
  };
  if (input.title !== undefined) payload.title = input.title;

  const suffix = `/${encodeURIComponent(id)}/snapshot`;
  const result = await sessionRequest<SessionEnvelope>(
    suffix,
    jsonMutation("PUT", payload),
  );
  return unwrapSession(result);
}

/** 把 live 会话保存进「我的任务」；该行仍可原地续编，live 下一次动作建新缓存。 */
export async function archiveAppSession(
  sessionId: string,
): Promise<AgentApiResult<ArchiveAppSessionResult>> {
  const id = (sessionId || "").trim();
  if (!id) return { ok: false, error: "缺少 session_id", status: 400 };
  const suffix = `/${encodeURIComponent(id)}`;

  const result = await sessionRequest<
    ArchiveAppSessionResult | SessionEnvelope
  >(`${suffix}/archive`, jsonMutation("POST"));
  if (!result.ok || !result.data) {
    return result as AgentApiResult<ArchiveAppSessionResult>;
  }
  const raw = result.data;
  if ("archived" in raw) {
    const archived = raw as ArchiveAppSessionResult & {
      session?: AppSession;
    };
    return {
      ...result,
      data: {
        session_id: id,
        archived: archived.archived,
        session: archived.session,
      },
    };
  }
  const session =
    "session" in raw && raw.session
      ? raw.session
      : (raw as AppSession);
  return {
    ...result,
    data: { session_id: id, archived: true, session },
  };
}

/** 永久删除已保存任务聚合：snapshot、agent thread、产物与草稿引用一并级联删除。 */
export async function deleteAppSession(
  sessionId: string,
): Promise<AgentApiResult<{ deleted: boolean; session_id: string }>> {
  const id = (sessionId || "").trim();
  if (!id) return { ok: false, error: "缺少 session_id", status: 400 };
  return sessionRequest<{ deleted: boolean; session_id: string }>(
    `/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
