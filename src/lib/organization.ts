"use client";

// ============================================================================
// @oceanleo/ui — organization / workflow 客户端（单一事实源，doctrine v8）
// ----------------------------------------------------------------------------
// 后端：网关 /v1/organizations/*（oceanleo/backend/app/routers/organizations_router.py）。
//   GET    /v1/organizations?kind=&mine=     列表（自己的 + 公开模板）
//   GET    /v1/organizations/{id}            详情（含图 + 节点 agent 信息）
//   POST   /v1/organizations                 新建（可 template_id 克隆模板）
//   PUT    /v1/organizations/{id}            存图 / 改名
//   DELETE /v1/organizations/{id}            软删
//   POST   /v1/organizations/{id}/summarize  AI 据图总结目标与任务
//   POST   /v1/organizations/{id}/run        起一个 multi-agent 任务，返回 task_id
//
// graph 结构（前端 React Flow 画布 ↔ 后端编排器共用）：
//   { nodes:[{id, agent_id, x, y}], edges:[{source, target, label}], entry:nodeId }
// ============================================================================

import { authed } from "./agent";
import type { AgentDef } from "./agent";

export type OrgKind = "organization" | "workflow";

export interface OrgGraphNode {
  id: string;
  agent_id: string;
  x: number;
  y: number;
}
export interface OrgGraphEdge {
  source: string;
  target: string;
  label?: string;
}
export interface OrgGraph {
  nodes: OrgGraphNode[];
  edges: OrgGraphEdge[];
  entry?: string;
}

export interface Organization {
  id: string;
  user_id?: string | null;
  name: string;
  tagline: string;
  icon: string;
  kind: OrgKind;
  /** 分类标签（如「内容创作」「增长」），驱动 playground 目录页分类 chips。 */
  category?: string;
  graph: OrgGraph;
  summary?: string;
  is_template: boolean;
  enabled?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
  /** hydrated on detail: agent_id → AgentDef for nodes. */
  agents?: Record<string, AgentDef>;
}

export function listOrganizations(opts?: { kind?: OrgKind; mine?: boolean }) {
  const q = new URLSearchParams();
  if (opts?.kind) q.set("kind", opts.kind);
  if (opts?.mine) q.set("mine", "true");
  const qs = q.toString();
  return authed<{ items: Organization[] }>(`/v1/organizations${qs ? `?${qs}` : ""}`);
}

export function getOrganization(id: string) {
  return authed<{ organization: Organization }>(`/v1/organizations/${encodeURIComponent(id)}`);
}

export function createOrganization(body: {
  name?: string;
  tagline?: string;
  icon?: string;
  kind?: OrgKind;
  category?: string;
  graph?: OrgGraph;
  summary?: string;
  template_id?: string;
}) {
  return authed<{ organization: Organization }>("/v1/organizations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateOrganization(
  id: string,
  body: {
    name?: string;
    tagline?: string;
    icon?: string;
    category?: string;
    graph?: OrgGraph;
    summary?: string;
  },
) {
  return authed<{ organization: Organization }>(`/v1/organizations/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

/** AI 据用户需求自动挑成员 + 分层，产出 {name, summary, graph} 并写回该 org。
 *  前端拿到 organization（含 hydrated agents）后直接渲染到画布。 */
export function designOrganization(id: string, prompt: string, agentModel?: string) {
  return authed<{ organization: Organization; name: string; summary: string }>(
    `/v1/organizations/${encodeURIComponent(id)}/design`,
    { method: "POST", body: JSON.stringify({ prompt, agent_model: agentModel || "" }) },
  );
}

export function deleteOrganization(id: string) {
  return authed<{ id: string; deleted: boolean }>(`/v1/organizations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function summarizeOrganization(id: string) {
  return authed<{ summary: string }>(`/v1/organizations/${encodeURIComponent(id)}/summarize`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function runOrganization(id: string, prompt: string, agentModel?: string) {
  return authed<{ task_id: string; status: string; organization_id: string }>(
    `/v1/organizations/${encodeURIComponent(id)}/run`,
    {
      method: "POST",
      body: JSON.stringify({ prompt, agent_model: agentModel || "" }),
    },
  );
}
