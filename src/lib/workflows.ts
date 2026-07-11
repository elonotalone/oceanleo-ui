"use client";

// ============================================================================
// @oceanleo/ui — 「我的模板」存取（内部沿用 workflow 标识兼容既有数据表）
// ----------------------------------------------------------------------------
// 用户在功能页左栏「操作台」填好一套输入后，可点「保存模板」把这套输入存起来；
// 存下来的模板出现在右栏「模板」页的「我的」类别里，点一下即可一键复用
// （把 prompt + 参数 + 备注灌回操作台）。
//
// 一条「模板」= 该成品 app 操作台的一次输入快照：
//   { site_id, app_id, label, prompt, params, remark }
//
// 存储：登录用户 → Supabase `agent_workflows`（owner-only RLS，跨 *.oceanleo.com 打通，
// 与 agent_artifacts 同库同项目）；未登录 → localStorage 降级（本机可用，登录后自动
// 走云端）。数据形态两边一致，切换无缝。
// ============================================================================

import { browserClient } from "./auth/client";

export interface SavedWorkflow {
  id: string;
  site_id: string;
  app_id: string;
  /** 展示名（列表卡片标题）。 */
  label: string;
  /** 主输入（灌回操作台主字段，如 word 的 topic）。 */
  prompt: string;
  /** 其余参数补丁（灌回操作台的 style/words/ratio… = OpsPatch.set 的形状）。 */
  params: Record<string, unknown>;
  /** 备注板块的独立内容；复用模板时原样回填。 */
  remark?: string;
  created_at: string;
}

/** 从操作台采集的一份「待保存」草稿（站点侧读自己的 state 拼出来）。 */
export interface WorkflowDraft {
  /** 展示名；不给则由 prompt 截取。 */
  label?: string;
  /** 主输入（必填才可保存）。 */
  prompt: string;
  /** 其余参数（文体/字数/比例…）。 */
  params?: Record<string, unknown>;
  /** 备注板块的独立内容。 */
  remark?: string;
}

const LS_KEY = "oceanleo_workflows_v1";

function lsAll(): SavedWorkflow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as SavedWorkflow[]) : [];
  } catch {
    return [];
  }
}

function lsWrite(all: SavedWorkflow[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(all.slice(0, 300)));
  } catch {
    /* quota / disabled — 静默 */
  }
}

async function sessionUserId(): Promise<string | null> {
  const c = browserClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.user?.id ?? null;
}

function deriveLabel(label: string | undefined, prompt: string): string {
  const fromLabel = (label || "").trim();
  if (fromLabel) return fromLabel.slice(0, 24);
  // 去掉 `[占位]` 后截取主输入前 18 字作为默认名。
  const clean = prompt.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  return clean.slice(0, 18) || "我的模板";
}

/** 列出当前用户在某站（可选某成品）下保存的工作流，新→旧。 */
export async function listWorkflows(siteId: string, appId?: string): Promise<SavedWorkflow[]> {
  const c = browserClient();
  const uid = c ? await sessionUserId() : null;
  if (c && uid) {
    let q = c
      .from("agent_workflows")
      .select("*")
      .eq("site_id", siteId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (appId) q = q.eq("app_id", appId);
    const { data, error } = await q;
    if (!error && data) return data as SavedWorkflow[];
    // 云端异常（如表未就绪）→ 降级本地，避免整个「我的」白屏。
  }
  return lsAll().filter((w) => w.site_id === siteId && (!appId || w.app_id === appId));
}

/** 保存一条工作流；成功返回保存后的行（含 id / created_at）。 */
export async function saveWorkflow(input: {
  site_id: string;
  app_id: string;
  label?: string;
  prompt: string;
  params?: Record<string, unknown>;
  remark?: string;
}): Promise<SavedWorkflow | null> {
  const prompt = (input.prompt || "").trim();
  if (!prompt) return null;
  const base = {
    site_id: input.site_id,
    app_id: input.app_id,
    label: deriveLabel(input.label, prompt),
    prompt,
    params: input.params || {},
    remark: (input.remark || "").slice(0, 4000),
  };
  const c = browserClient();
  const uid = c ? await sessionUserId() : null;
  if (c && uid) {
    const { data, error } = await c
      .from("agent_workflows")
      .insert({ ...base, user_id: uid })
      .select()
      .single();
    if (!error && data) return data as SavedWorkflow;
    // 云端写失败 → 降级本地存一份，至少不丢用户输入。
  }
  const w: SavedWorkflow = {
    id: `ls_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...base,
    created_at: new Date().toISOString(),
  };
  const all = lsAll();
  all.unshift(w);
  lsWrite(all);
  return w;
}

/** 删除一条工作流（本地 id 以 `ls_` 前缀区分；云端行走 Supabase）。 */
export async function deleteWorkflow(id: string): Promise<void> {
  if (id.startsWith("ls_")) {
    lsWrite(lsAll().filter((w) => w.id !== id));
    return;
  }
  const c = browserClient();
  const uid = c ? await sessionUserId() : null;
  if (c && uid) {
    await c.from("agent_workflows").delete().eq("id", id);
    return;
  }
  // 兜底：本地也尝试删（混合态）。
  lsWrite(lsAll().filter((w) => w.id !== id));
}
