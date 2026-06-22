"use client";

// ============================================================================
// @oceanleo/ui — Playground（doctrine v4，单一事实源）
// ----------------------------------------------------------------------------
// 主站 oceanleo.com/playground：不加入工作台即可试玩任一 agent。
//   子栏（侧栏 PlaygroundSubNav）：从上到下列「场景（= agent 的 category）」；选场景
//     后列该场景下的 agent，点 agent → 主区显示其功能区。
//   主区（PlaygroundDetail）：右栏顶部一条「全模态 ModelPicker」（作用域仅 playground，
//     独立持久化 key），右上角「放入工作台」按钮（saveAgent）；下方 iframe 内嵌选中
//     agent 的子站功能区（与正常使用完全一致）。
//
// 子栏与主区通过 useWorkspaceSelection("playground") 共享选中态。选中值用复合 key
// "<category>::<agent_id>"，便于子栏同时记住「当前场景」与「当前 agent」。
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { ModelPicker } from "./ModelPicker";
import { useWorkspaceSelection } from "./WorkspaceSelection";
import { listAgents, saveAgent, type AgentDef } from "../lib/agent";

const CATEGORY_NAMES: Record<string, string> = {
  media: "图像与视频",
  office: "文档与办公",
  design: "电商与设计",
  search: "搜索与对话",
  audio: "音频",
  agent: "智能体与建站",
  money: "生活理财",
};

// playground 模型选择作用域：用独立 siteId，使其与各站正常工作台选择互不干扰。
const PLAYGROUND_MODEL_SITE = "__playground__";

function categoryLabel(cat: string): string {
  return CATEGORY_NAMES[cat] || cat || "其他";
}

/** 复合选中值：`<category>::<agent_id>`。空 agent 表示只选了场景。 */
function packSel(category: string, agentId: string): string {
  return `${category}::${agentId}`;
}
function unpackSel(v: string | null): { category: string; agentId: string } {
  if (!v) return { category: "", agentId: "" };
  const i = v.indexOf("::");
  if (i < 0) return { category: v, agentId: "" };
  return { category: v.slice(0, i), agentId: v.slice(i + 2) };
}

// 共享 agent 列表（子栏与主区各自拉一次成本低，但用一个 hook 收敛逻辑）。
function useAgents(): { agents: AgentDef[]; loading: boolean } {
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await listAgents();
      if (!alive) return;
      setAgents(r.ok && r.data ? r.data.items : []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);
  return { agents, loading };
}

// ----------------------------------------------------------------------------
// 侧栏子栏：场景（category）→ agent
// ----------------------------------------------------------------------------
export function PlaygroundSubNav({ accent = "#0ea5e9" }: { accent?: string }) {
  const { agents, loading } = useAgents();
  const [sel, setSel] = useWorkspaceSelection("playground");
  const { category, agentId } = unpackSel(sel);

  const categories = useMemo(() => {
    const seen = new Map<string, number>();
    for (const a of agents) {
      const c = a.category || "other";
      seen.set(c, (seen.get(c) || 0) + 1);
    }
    return Array.from(seen.entries()).map(([id, n]) => ({ id, n }));
  }, [agents]);

  const inCategory = useMemo(
    () => agents.filter((a) => (a.category || "other") === category),
    [agents, category],
  );

  if (loading) {
    return <p className="px-3 py-4 text-[12px] text-neutral-400">加载场景…</p>;
  }

  return (
    <div className="space-y-2">
      <div className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
        选择场景
      </div>
      <div className="space-y-0.5">
        {categories.map((c) => {
          const on = c.id === category;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSel(packSel(c.id, ""))}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] transition ${
                on ? "font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-200/50"
              }`}
              style={on ? { background: "rgba(0,0,0,0.04)", boxShadow: `inset 3px 0 0 ${accent}` } : undefined}
            >
              <span className="truncate">{categoryLabel(c.id)}</span>
              <span className="ml-2 shrink-0 text-[11px] text-neutral-400">{c.n}</span>
            </button>
          );
        })}
      </div>

      {category && (
        <>
          <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            {categoryLabel(category)} · agent
          </div>
          <div className="space-y-0.5">
            {inCategory.map((a) => {
              const on = a.agent_id === agentId;
              return (
                <button
                  key={a.agent_id}
                  type="button"
                  onClick={() => setSel(packSel(category, a.agent_id))}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition ${
                    on ? "text-white" : "text-neutral-700 hover:bg-neutral-200/50"
                  }`}
                  style={on ? { background: accent } : undefined}
                  title={a.tagline}
                >
                  <span className="shrink-0 text-base leading-none">{a.icon || "✦"}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                </button>
              );
            })}
            {inCategory.length === 0 && (
              <p className="px-3 py-2 text-[12px] text-neutral-400">该场景暂无 agent。</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// 主区详情：右栏顶部全模态 ModelPicker + 右上角「放入工作台」+ iframe 功能区
// ----------------------------------------------------------------------------
export function PlaygroundDetail({
  siteOrigin,
  accent = "#0ea5e9",
}: {
  /** site_id → 子站 origin（拼 iframe src 用）。 */
  siteOrigin: Record<string, string>;
  accent?: string;
}) {
  const { agents } = useAgents();
  const [sel] = useWorkspaceSelection("playground");
  const { agentId } = unpackSel(sel);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const active = useMemo(
    () => agents.find((a) => a.agent_id === agentId) || null,
    [agents, agentId],
  );

  const embedSrc = useMemo(() => {
    if (!active) return "";
    const origin = siteOrigin[active.site_id];
    if (!origin) return "";
    const fn = active.fn_id ? `&fn=${encodeURIComponent(active.fn_id)}` : "";
    return `${origin}/workspace?embed=1&solo=1${fn}&agent=${encodeURIComponent(active.agent_id)}`;
  }, [active, siteOrigin]);

  async function addToWorkspace() {
    if (!active || saving) return;
    setSaving(true);
    const r = await saveAgent(active.agent_id);
    setSaving(false);
    if (r.ok) setSavedMsg("已放入工作台 ✓");
    else if (r.status === 401) setSavedMsg("请先登录");
    else setSavedMsg("操作失败");
    setTimeout(() => setSavedMsg(null), 2600);
  }

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      {/* 顶部一条：左 = 全模态模型选择（作用域仅 playground）；右 = 放入工作台 */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 px-3 py-2">
        <div className="min-w-0">
          <ModelPicker
            categories={["text", "image", "video", "threed", "audio"]}
            siteId={PLAYGROUND_MODEL_SITE}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {savedMsg && <span className="text-[12px] text-emerald-600">{savedMsg}</span>}
          <button
            type="button"
            onClick={addToWorkspace}
            disabled={!active || saving}
            className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[13px] font-medium text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: accent }}
            title="把这个 app 加入「我的 app」，之后在工作台直接用"
          >
            ＋ 放入工作台
          </button>
        </div>
      </div>

      {/* 主体：选中 agent → iframe 内嵌其功能区（与正常使用完全一致） */}
      <div className="min-h-0 flex-1 p-1.5">
        {active && embedSrc ? (
          <iframe
            key={active.agent_id}
            src={embedSrc}
            title={active.name}
            className="h-full w-full rounded-2xl border border-stone-200 bg-white/60"
            allow="clipboard-write; clipboard-read; fullscreen"
            allowFullScreen
          />
        ) : (
          <div className="grid h-full place-items-center rounded-2xl border border-dashed border-stone-300 bg-white/40 p-8 text-center text-[13px] text-neutral-400">
            {active
              ? "该 app 所属站点暂未接入内嵌功能区。"
              : "在左侧选择一个场景，再选一个 app 即可在此直接试玩，无需加入工作台。"}
          </div>
        )}
      </div>
    </div>
  );
}
