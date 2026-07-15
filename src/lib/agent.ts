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

import { accessToken, cachedAccessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";
import type { OpsPatch } from "./fn-agent";
import { notifyHistoryChanged } from "./history-events";

/** OceanLeo 网关统一返回形状。导出供同一 client 层的其它资源 API 复用。 */
export type AgentApiResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
};

export async function authed<T>(
  path: string,
  init?: RequestInit,
): Promise<AgentApiResult<T>> {
  // keepalive（尤其 pagehide flush）若已有内存 token，必须在当前事件回调内同步发起
  // fetch；先 await Supabase getSession 会让浏览器在请求创建前就销毁页面。
  const token =
    (init?.keepalive ? cachedAccessToken() : null) ||
    (await accessToken());
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
    const detail = (data as { detail?: unknown } | null)?.detail;
    const error =
      typeof detail === "string"
        ? detail
        : detail && typeof detail === "object" && "message" in detail
          ? String((detail as { message?: unknown }).message || `HTTP ${res.status}`)
          : `HTTP ${res.status}`;
    return {
      ok: false,
      error,
      status: res.status,
    };
  }
  return { ok: true, data: data as T };
}

/** 产物标记：引擎在产出「格式化可编辑结果」时写在 message.meta.artifact。 */
export interface ArtifactMeta {
  /** Durable agent_artifacts row id, when this result is library-backed. */
  id?: string;
  type: string; // map | canvas | novel | ppt | sheet | doc | markdown | image
  title?: string;
  format?: string; // markdown | image | ...
  url?: string;
  /** Optional normalized viewer payload (slides / rows / nodes / preview_url…). */
  meta?: Record<string, unknown>;
  media_type?: string;
  site_id?: string;
}

export interface AgentMessage {
  id: number;
  role: "user" | "assistant";
  kind: string; // text | plan | step | artifact | ui_action | error
  content: string;
  meta?: {
    artifact?: ArtifactMeta;
    image_url?: string;
    final?: boolean;
    plan?: unknown;
    /** doctrine v3: structured patch the function agent wants applied to the
     *  operator console (left pane). Frontend applies it to the real ops state. */
    ops_patch?: OpsPatch;
    /** Signed-receipt-derived command for the fixed right-hand workspace. */
    workspace_action?: import("../shell/workspace-actions").WorkspaceActionV1;
    /** 用户随这条消息上传的附件（回看历史时渲染在用户气泡上）。 */
    attachments?: AgentAttachment[];
    /** 团队/组织多智能体（doctrine 2026-07-09）：产出这条消息的成员 agent_id / 名字 /
     *  图标。kind="report" 的消息 = 该成员【自己的回答】，前端据此分组成署名气泡；
     *  step/plan 里的 worker 也标注是谁。 */
    worker?: string;
    worker_name?: string;
    worker_icon?: string;
    /** 主管最终汇总消息上标注参与的成员 id 列表。 */
    workers?: string[];
    /** 被用户 @ 点名的成员 id 列表（主管把活只派给他们）。 */
    mentions?: string[];
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
  mode: "agent" | "chat" | "skill" | string;
  plan?: unknown;
  favorite?: boolean;
  /** 宗旨 v22（2026-07-12）：Manus 式任务菜单——置顶。 */
  pinned?: boolean | null;
  project_id?: string | null;
  /** 宗旨 v22：结果评分（1-5 星；null=未评）。 */
  rating?: number | null;
  /** 旧口径：整分累加（每次调用 ceil 到 ≥1 分，会虚高）。展示请优先用 nano_spent。 */
  credits_spent?: number;
  /** 精确花费（nano-yuan, 1e-9 CNY）== 钱包真实扣款口径。展示口径的单一事实源。 */
  nano_spent?: number;
  /** 「待处理」语义：用户是否已查看过此任务（打开任务详情即置 true）。 */
  seen?: boolean;
  /** 任务所属站点（驱动每站「历史记录」过滤）。空 = 主站 oceanleo.com。 */
  site_id?: string;
  /** 工作会话聚合根；旧 task / 旧后端没有此字段。 */
  session_id?: string | null;
  /** Ordinary app task or advanced-workbench task. */
  surface?: "app" | "advanced" | string;
  /** 成品 app 身份；旧 task 可能缺失。 */
  app_id?: string | null;
  parent_task_id?: string | null;
  root_task_id?: string | null;
  branch_from_message_id?: number | null;
  branch_depth?: number;
  created_at?: string;
  updated_at?: string;
}

/** 任务花费 → 元（精确口径单一事实源）：优先 nano_spent，回退旧的整分 credits_spent。 */
export function taskCostYuan(t: { nano_spent?: number; credits_spent?: number }): number {
  if (typeof t.nano_spent === "number" && t.nano_spent > 0) {
    return t.nano_spent / 1_000_000_000;
  }
  return (t.credits_spent ?? 0) / 100;
}

export interface TaskDetail {
  task: AgentTask;
  messages: AgentMessage[];
  artifacts: AgentArtifact[];
}

/** 用户随消息上传的附件（文件/图片/语音）。上传到文件库拿到公网 url 后传给 agent：
 *  audio 会被后端自动转写成文字进 prompt；其它文件的 url 交给 CodeAgent 在内核里下载分析
 *  （如账单 PDF → Excel）。见 docs/architecture/oceanleo-agent-file-upload.md。 */
export interface AgentAttachment {
  url: string;
  mime?: string;
  name?: string;
  /** image | doc | video | audio | ...（用于前端展示 + 后端识别语音） */
  media_type?: string;
}

export function createTask(body: {
  prompt: string;
  /** Model-only workspace/material context. Never persisted as visible user text. */
  hiddenContext?: string;
  // agent = task loop (controls console) | chat = quick reply (may patch
  // console) | skill = pure-persona chat for an app's skill (no console control)
  mode?: "agent" | "chat" | "skill";
  siteId?: string;
  agentModel?: string;
  /** Per-category model keys chosen in ModelPicker, e.g. {text,image,video,threed,audio}. */
  modelSelection?: Record<string, string>;
  projectId?: string;
  /** doctrine v3: bind this conversation to a function-area agent. */
  agentId?: string;
  /** 把 task 绑定到完整 app 工作会话；旧后端会忽略这个新增字段。 */
  sessionId?: string;
  /** doctrine v3: compact snapshot of the operator-console state for the agent. */
  opsState?: Record<string, unknown>;
  /** agent.oceanleo.com: bind this conversation to a「专家团」(multi-agent). */
  teamId?: string;
  /** doctrine v6: per-conversation skill-prompt override (用户编辑了 skill prompt
   *  并选「用这段 prompt 直接干活」)。只对本次会话生效，不写回 manifest。 */
  promptOverride?: string;
  /** 用户上传的附件（文件/图片/语音的公网 url）。 */
  attachments?: AgentAttachment[];
}) {
  return authed<{
    task_id: string;
    status: string;
    mode: string;
    session_id?: string | null;
  }>(
    "/v1/agent/tasks",
    {
      method: "POST",
      body: JSON.stringify({
        prompt: body.prompt,
        hidden_context: body.hiddenContext || "",
        mode: body.mode || "agent",
        site_id: body.siteId || "",
        agent_model: body.agentModel || "",
        model_selection: body.modelSelection || {},
        project_id: body.projectId || null,
        agent_id: body.agentId || "",
        session_id: body.sessionId || null,
        ops_state: body.opsState || null,
        team_id: body.teamId || "",
        prompt_override: body.promptOverride || "",
        attachments: body.attachments || [],
      }),
    },
  ).then((result) => {
    if (result.ok) notifyHistoryChanged();
    return result;
  });
}

// --------------------------------------------------------------------------- //
// 操作台运行历史（doctrine 2026-07-09）——把一次成品站「操作台生成」持久化成一条
// mode="console" 的 agent_task，使其进历史记录、可回看产物、可据 ops_state 恢复操作台。
// 后端：POST/PUT /v1/agent/console-runs（见 agent_router.py）。前端各站用 useConsoleRun。
// --------------------------------------------------------------------------- //
export interface ConsoleArtifactInput {
  /** 产物类型（markdown | doc | canvas | ppt | sheet | image …）。 */
  type?: string;
  title?: string;
  format?: string;
  content?: string;
  url?: string;
}

/** 新建一条操作台运行历史，返回 task_id。 */
export function createConsoleRun(body: {
  prompt: string;
  siteId?: string;
  agentId?: string;
  appId?: string;
  /** 同一 app 工作会话内可有多次 console run。 */
  sessionId?: string;
  schemaVersion?: number;
  opsState?: Record<string, unknown>;
  artifact?: ConsoleArtifactInput;
  status?: "running" | "done" | "failed";
}) {
  return authed<{ task_id: string; status: string; session_id?: string | null }>("/v1/agent/console-runs", {
    method: "POST",
    body: JSON.stringify({
      prompt: body.prompt,
      site_id: body.siteId || "",
      agent_id: body.agentId || "",
      app_id: body.appId || "",
      session_id: body.sessionId || null,
      schema_version: body.schemaVersion ?? 1,
      ops_state: body.opsState || null,
      artifact: body.artifact || null,
      status: body.status || "done",
    }),
  });
}

/** 更新一条操作台运行：改状态 / 更新 ops_state 快照 / 追加或替换产物。 */
export function updateConsoleRun(
  taskId: string,
  body: {
    status?: "running" | "done" | "failed";
    opsState?: Record<string, unknown>;
    artifact?: ConsoleArtifactInput;
    replaceArtifacts?: boolean;
  },
) {
  return authed<{ task_id: string; ok: boolean }>(
    `/v1/agent/console-runs/${encodeURIComponent(taskId)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        status: body.status || null,
        ops_state: body.opsState ?? null,
        artifact: body.artifact || null,
        replace_artifacts: Boolean(body.replaceArtifacts),
      }),
    },
  );
}

// --------------------------------------------------------------------------- //
// OceanLeo Agents marketplace + 我的 agents (doctrine v3)
// --------------------------------------------------------------------------- //
export interface AgentDef {
  agent_id: string;
  site_id: string;
  fn_id: string;
  name: string;
  tagline: string;
  icon: string;
  capabilities: string;
  category: string;
  enabled: boolean;
  sort_order: number;
  saved?: boolean;
  /** 用户自建 agent 时 = 创建者 user_id；官方条目为 null。宗旨 v13：用于「我的优先」排序。 */
  owner_id?: string | null;
}

/** Public marketplace (works signed-out; `saved` annotated when signed-in).
 *
 * `siteId` 给了 → 只列该站的 agent（agent.oceanleo.com 专家广场用，传 "agent"）。
 * `siteId` 省略 / 空 → 列全站 marketplace（主站 /all-sites?tab=app 用）。 */
export async function listAgents(
  siteId?: string,
): Promise<AgentApiResult<{ items: AgentDef[] }>> {
  const token = await accessToken();
  const site = (siteId || "").trim();
  const url = site
    ? `${GATEWAY_BASE}/v1/agents?site_id=${encodeURIComponent(site)}`
    : `${GATEWAY_BASE}/v1/agents`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "网络错误", status: 0 };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* */
  }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, status: res.status };
  return { ok: true, data: data as { items: AgentDef[] } };
}

export function listMyAgents() {
  return authed<{ items: AgentDef[] }>("/v1/agents/mine");
}

/** Create a user-owned skill (visible only to the creator). Doctrine v6:
 *  used by the shared CreateSkillModal — both「创建 skill」(agent 站) and
 *  「保存为我的 skill」(any oceanleo site's prompt panel) go through here. */
export function createCustomSkill(body: {
  name: string;
  tagline?: string;
  icon?: string;
  category?: string;
  tags?: string[];
  prompt: string;
}) {
  return authed<{ agent_id: string; name: string }>("/v1/agents/custom", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteCustomSkill(agentId: string) {
  return authed<{ agent_id: string; deleted: boolean }>(
    `/v1/agents/custom/${encodeURIComponent(agentId)}`,
    { method: "DELETE" },
  );
}

/** Create a user-owned skill team (multi-skill collaboration). */
export function createCustomSkillTeam(body: {
  name: string;
  tagline?: string;
  icon?: string;
  category?: string;
  prompt?: string;
  member_agent_ids: string[];
  leader_agent_id?: string;
  tags?: string[];
}) {
  return authed<{ team_id: string; name: string; leader_agent_id: string }>(
    "/v1/agent-teams/custom",
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function deleteCustomSkillTeam(teamId: string) {
  return authed<{ team_id: string; deleted: boolean }>(
    `/v1/agent-teams/custom/${encodeURIComponent(teamId)}`,
    { method: "DELETE" },
  );
}

/**
 * 宗旨 v13（2026-07-02）：增/删/改团成员。
 *   - 自有团 → 直接改，返回 { forked:false, team_id: <same> }。
 *   - 官方 / 他人团 → 自动 fork 到当前用户，返回 { forked:true, team_id: <new> }。
 * 前端拿到 forked=true 时应把 UI 切到新 team_id。
 */
export function updateTeamMembers(
  teamId: string,
  memberAgentIds: string[],
  leaderAgentId?: string,
) {
  return authed<{
    team_id: string;
    forked: boolean;
    leader_agent_id: string;
    from_team_id?: string;
  }>(
    `/v1/agent-teams/custom/${encodeURIComponent(teamId)}/members`,
    {
      method: "PUT",
      body: JSON.stringify({
        member_agent_ids: memberAgentIds,
        leader_agent_id: leaderAgentId || "",
      }),
    },
  );
}

export function saveAgent(agentId: string) {
  return authed<{ agent_id: string; saved: boolean }>("/v1/agents/mine", {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId }),
  });
}

export function unsaveAgent(agentId: string) {
  return authed<{ agent_id: string; saved: boolean }>(
    `/v1/agents/mine/${encodeURIComponent(agentId)}`,
    { method: "DELETE" },
  );
}

// --------------------------------------------------------------------------- //
// 专家团（agent.oceanleo.com）marketplace + 我的专家团
// --------------------------------------------------------------------------- //
export interface TeamDef {
  team_id: string;
  site_id: string;
  name: string;
  tagline: string;
  icon: string;
  category: string;
  prompt?: string;
  tags?: string[];
  enabled: boolean;
  sort_order: number;
  member_ids?: string[];
  member_count?: number;
  members?: AgentDef[];
  saved?: boolean;
  /** 用户自建团 = 创建者 user_id；官方团为 null。宗旨 v13：用于「我的优先」排序。 */
  owner_id?: string | null;
}

export async function listTeams(
  siteId?: string,
): Promise<AgentApiResult<{ items: TeamDef[] }>> {
  const token = await accessToken();
  const site = (siteId || "").trim();
  const url = site
    ? `${GATEWAY_BASE}/v1/agent-teams?site_id=${encodeURIComponent(site)}`
    : `${GATEWAY_BASE}/v1/agent-teams`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "网络错误", status: 0 };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* */
  }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, status: res.status };
  return { ok: true, data: data as { items: TeamDef[] } };
}

export async function getTeam(teamId: string): Promise<AgentApiResult<{ team: TeamDef }>> {
  const token = await accessToken();
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}/v1/agent-teams/${encodeURIComponent(teamId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "网络错误", status: 0 };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* */
  }
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, status: res.status };
  return { ok: true, data: data as { team: TeamDef } };
}

export function listMyTeams() {
  return authed<{ items: TeamDef[] }>("/v1/agent-teams/mine");
}

export function saveTeam(teamId: string) {
  return authed<{ team_id: string; saved: boolean }>("/v1/agent-teams/mine", {
    method: "POST",
    body: JSON.stringify({ team_id: teamId }),
  });
}

export function unsaveTeam(teamId: string) {
  return authed<{ team_id: string; saved: boolean }>(
    `/v1/agent-teams/mine/${encodeURIComponent(teamId)}`,
    { method: "DELETE" },
  );
}

export function followUp(
  taskId: string,
  prompt: string,
  attachments?: AgentAttachment[],
  hiddenContext = "",
) {
  return authed<{ task_id: string; status: string }>(
    `/v1/agent/tasks/${encodeURIComponent(taskId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        prompt,
        hidden_context: hiddenContext,
        attachments: attachments || [],
      }),
    },
  ).then((result) => {
    if (result.ok) notifyHistoryChanged();
    return result;
  });
}

export function branchTask(
  taskId: string,
  fromMessageId: number,
  prompt: string,
  attachments?: AgentAttachment[],
) {
  return authed<{
    task_id: string;
    status: string;
    session_id?: string | null;
    parent_task_id: string;
    branch_from_message_id: number;
  }>(`/v1/agent/tasks/${encodeURIComponent(taskId)}/branches`, {
    method: "POST",
    body: JSON.stringify({
      from_message_id: fromMessageId,
      prompt,
      attachments: attachments || [],
    }),
  }).then((result) => {
    if (result.ok) notifyHistoryChanged();
    return result;
  });
}

export function stopTask(taskId: string) {
  return authed<{ task_id: string; status: string }>(
    `/v1/agent/tasks/${encodeURIComponent(taskId)}/stop`,
    { method: "POST" },
  ).then((result) => {
    if (result.ok) notifyHistoryChanged();
    return result;
  });
}

export function getTask(taskId: string) {
  return authed<TaskDetail>(`/v1/agent/tasks/${encodeURIComponent(taskId)}`);
}

/**
 * 历史列表（按时间倒序）。
 * - `siteId` 给了 → 只列该站的会话（每站「历史记录」用）。
 * - `siteId` 省略 / 空 → 列全部站的会话（主站 oceanleo.com hub 用）。
 */
export function listTasks(
  limit = 50,
  siteId?: string,
  pending = false,
  surface: "app" | "advanced" | "all" = "app",
) {
  const params = new URLSearchParams({ limit: String(limit) });
  const site = (siteId || "").trim();
  if (site) params.set("site_id", site);
  if (pending) params.set("pending", "true");
  params.set("surface", surface);
  return authed<{ items: AgentTask[] }>(`/v1/agent/tasks?${params.toString()}`);
}

/** 永久删除一条会话（连带其消息 / 产出，后端 FK 级联）。 */
export function deleteTask(taskId: string) {
  return authed<{ task_id: string; deleted: boolean }>(
    `/v1/agent/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
  ).then((result) => {
    if (result.ok) notifyHistoryChanged();
    return result;
  });
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

/** 找出某次会话里最新的「操作台补丁」（agent 想写进左侧操作台的结构化结果）。 */
export function latestOpsPatch(messages: AgentMessage[]): OpsPatch | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const p = messages[i].meta?.ops_patch;
    if (p) return p;
  }
  return null;
}
