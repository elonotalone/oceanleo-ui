"use client";

// ============================================================================
// @oceanleo/ui — agent 客户端（单一事实源）
// ----------------------------------------------------------------------------
// 首页输入框 / 工作台 的「agent」走这套：创建任务 → 轮询消息流 → 拿推导 + 产出。
// 后端：网关 /v1/agent/*（oceanleo/backend/app/routers/agent_router.py）。
//   POST /v1/agent/tasks               创建任务（mode=agent|chat, site_id, ...）
//   POST /v1/agent/tasks/{id}/messages 追问（同一会话再跑）
//   GET  /v1/agent/tasks               历史列表
//   GET  /v1/agent/tasks/{id}          会话详情（messages + artifacts）
// 消息流：前端不订阅 Supabase Realtime，改为对 GET /tasks/{id} 轮询（简单可靠，
// 与现有 owner-scoped 网关一致）。
// ============================================================================

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";

type Result<T> = { ok: boolean; data?: T; error?: string; status?: number };

async function authed<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "未登录", status: 401 };
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "网络错误：无法连接到 AI 网关。", status: 0 };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: (data as { detail?: string } | null)?.detail || `HTTP ${res.status}`,
      status: res.status,
    };
  }
  return { ok: true, data: data as T };
}

/** 产物标记：引擎在产出「格式化可编辑结果」时写在 message.meta.artifact。 */
export interface ArtifactMeta {
  type: string; // map | canvas | novel | ppt | sheet | doc | markdown | image
  title?: string;
  format?: string; // markdown | image | ...
  url?: string;
}

export interface AgentMessage {
  id: number;
  role: "user" | "assistant";
  kind: string; // text | plan | step | artifact | error
  content: string;
  meta?: {
    artifact?: ArtifactMeta;
    image_url?: string;
    final?: boolean;
    plan?: unknown;
    [k: string]: unknown;
  };
  created_at?: string;
}

export interface AgentArtifact {
  id: string;
  kind: string;
  title?: string;
  content?: string;
  url?: string;
  favorite?: boolean;
  created_at?: string;
}

export interface AgentTask {
  id: string;
  title?: string;
  status: "running" | "done" | "failed" | "stopped" | string;
  mode: "agent" | "chat" | string;
  plan?: unknown;
  favorite?: boolean;
  credits_spent?: number;
  /** 任务所属站点（驱动每站「历史记录」过滤）。空 = 主站 oceanleo.com。 */
  site_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TaskDetail {
  task: AgentTask;
  messages: AgentMessage[];
  artifacts: AgentArtifact[];
}

export function createTask(body: {
  prompt: string;
  mode?: "agent" | "chat";
  siteId?: string;
  agentModel?: string;
  projectId?: string;
}) {
  return authed<{ task_id: string; status: string; mode: string }>(
    "/v1/agent/tasks",
    {
      method: "POST",
      body: JSON.stringify({
        prompt: body.prompt,
        mode: body.mode || "agent",
        site_id: body.siteId || "",
        agent_model: body.agentModel || "",
        project_id: body.projectId || null,
      }),
    },
  );
}

export function followUp(taskId: string, prompt: string) {
  return authed<{ task_id: string; status: string }>(
    `/v1/agent/tasks/${encodeURIComponent(taskId)}/messages`,
    { method: "POST", body: JSON.stringify({ prompt }) },
  );
}

export function stopTask(taskId: string) {
  return authed<{ task_id: string; status: string }>(
    `/v1/agent/tasks/${encodeURIComponent(taskId)}/stop`,
    { method: "POST" },
  );
}

export function getTask(taskId: string) {
  return authed<TaskDetail>(`/v1/agent/tasks/${encodeURIComponent(taskId)}`);
}

/**
 * 历史列表（按时间倒序）。
 * - `siteId` 给了 → 只列该站的会话（每站「历史记录」用）。
 * - `siteId` 省略 / 空 → 列全部站的会话（主站 oceanleo.com hub 用）。
 */
export function listTasks(limit = 50, siteId?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  const site = (siteId || "").trim();
  if (site) params.set("site_id", site);
  return authed<{ items: AgentTask[] }>(`/v1/agent/tasks?${params.toString()}`);
}

/** 永久删除一条会话（连带其消息 / 产出，后端 FK 级联）。 */
export function deleteTask(taskId: string) {
  return authed<{ task_id: string; deleted: boolean }>(
    `/v1/agent/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
  );
}

/** 找出某次会话里最新的「分屏产物」（有 artifact 标记的消息）。 */
export function latestArtifact(messages: AgentMessage[]): {
  meta: ArtifactMeta;
  content: string;
} | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const a = messages[i].meta?.artifact;
    if (a) return { meta: a, content: messages[i].content };
  }
  return null;
}
