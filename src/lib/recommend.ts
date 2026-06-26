"use client";

// ============================================================================
// @oceanleo/ui — 通用「AI 智能推荐」客户端（doctrine v11，2026-06-26）
// ----------------------------------------------------------------------------
// 把原本只在「网站」分区的 AI 推荐，泛化到 app / agent / organization / workflow
// 四个分区：消费端把当前分区的候选项（卡片）连同用户的一句话需求 POST 给后端，
// 后端用同一套 LLM-as-router（context-stuffing）排出最匹配的 1-4 个 id。
//
// 后端：POST /v1/recommend/items（PUBLIC，无需登录，operator 平台 key 计费）。
//   见 oceanleo/backend/app/routers/recommend_router.py。
// ============================================================================

import { GATEWAY_BASE } from "./auth/config";

export interface RecommendCandidate {
  id: string;
  name?: string;
  tagline?: string;
  capabilities?: string;
  category?: string;
}

export interface ItemRecommendation {
  id: string;
  name: string;
  reason: string;
  confidence: number;
}

/**
 * 让 AI 从 `items` 里挑出最匹配 `query` 的 1-4 个，返回带理由 + 置信度的推荐。
 * `kind` 仅用于提示词文案（"app" / "agent" / "组织" / "工作流"）。
 */
export async function recommendItems(
  query: string,
  items: RecommendCandidate[],
  kind = "应用",
): Promise<{ ok: boolean; recommendations: ItemRecommendation[]; error?: string }> {
  const v = (query || "").trim();
  if (!v) return { ok: false, recommendations: [], error: "请输入需求" };
  if (!items.length) return { ok: true, recommendations: [] };
  try {
    const res = await fetch(`${GATEWAY_BASE}/v1/recommend/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: v,
        kind,
        items: items.slice(0, 200).map((it) => ({
          id: it.id,
          name: it.name || "",
          tagline: it.tagline || "",
          capabilities: it.capabilities || "",
          category: it.category || "",
        })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        recommendations: [],
        error: (data?.detail as string) || "推荐服务暂时不可用",
      };
    }
    return { ok: true, recommendations: (data.recommendations as ItemRecommendation[]) || [] };
  } catch {
    return { ok: false, recommendations: [], error: "网络错误，请稍后再试" };
  }
}
