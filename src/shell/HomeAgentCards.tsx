"use client";

// ============================================================================
// @oceanleo/ui — 首页「选择 agent」卡片（2026-07-25 从 HomeCards.tsx 拆出）
// ----------------------------------------------------------------------------
// 宗旨 v12 起【首页不再渲染 agent 卡片】——HomeIntro / 主站首页都不挂它。本组件仅为
// 不破坏 agent.oceanleo.com 等旧引用而保留导出。
// ============================================================================

import { useEffect, useState } from "react";
import { listAgents, listMyAgents, type AgentDef } from "../lib/agent";
import { CreateSkillModal } from "./CreateSkillModal";
import { SkillPromptPanel } from "./SkillPromptPanel";
import { useUI } from "../i18n/ui/useUI";

export interface HomeAgentPick {
  agentId: string;
  name: string;
  icon?: string;
}

export function HomeAgentCards({
  siteId,
  accent = "#4f46e5",
  selected,
  onSelect,
}: {
  siteId: string;
  accent?: string;
  /** 当前选中的 agent（受控，由 HomeIntro 持有）。 */
  selected: HomeAgentPick | null;
  /** 点卡片：选中 / 再点取消。 */
  onSelect: (agent: HomeAgentPick | null) => void;
}) {
  const tt = useUI();
  const [items, setItems] = useState<AgentDef[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [viewing, setViewing] = useState<AgentDef | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      // 本站 agents + 我的 agents（跨站），合并去重。本站的排前面。
      const [site, mine] = await Promise.all([listAgents(siteId), listMyAgents()]);
      if (!alive) return;
      const seen = new Set<string>();
      const merged: AgentDef[] = [];
      for (const a of [...(site.data?.items || []), ...(mine.data?.items || [])]) {
        if (!a?.agent_id || seen.has(a.agent_id) || a.enabled === false) continue;
        seen.add(a.agent_id);
        merged.push(a);
      }
      // 本站没配置任何 agent 时，从全站 marketplace 补足几张通用卡。
      if (merged.length < 4) {
        const all = await listAgents();
        if (!alive) return;
        for (const a of all.data?.items || []) {
          if (merged.length >= 8) break;
          if (!a?.agent_id || seen.has(a.agent_id) || a.enabled === false) continue;
          seen.add(a.agent_id);
          merged.push(a);
        }
      }
      setItems(merged.slice(0, 12));
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [siteId, reloadKey]);

  return (
    <section className="w-full">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {/* 第一张 =「新建 agent」卡片（存服务端，重进网站仍在，跨站可用）。 */}
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex min-h-[86px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 bg-white/60 px-3 py-3 text-stone-400 transition hover:border-stone-400 hover:text-stone-600"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          <span className="text-[12px] font-medium">{tt("新建 agent")}</span>
        </button>

        {!loaded &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="min-h-[86px] animate-pulse rounded-xl bg-stone-100" />
          ))}

        {items.map((a) => {
          const on = selected?.agentId === a.agent_id;
          return (
            <div
              key={a.agent_id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(on ? null : { agentId: a.agent_id, name: a.name, icon: a.icon })}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  onSelect(on ? null : { agentId: a.agent_id, name: a.name, icon: a.icon });
              }}
              className={`group relative flex min-h-[86px] cursor-pointer flex-col rounded-xl border bg-white px-3.5 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow ${
                on ? "" : "border-stone-200 hover:border-stone-300"
              }`}
              style={on ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}` } : undefined}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] leading-none">{a.icon || "🤖"}</span>
                <span className="truncate text-[13px] font-semibold text-stone-800">{a.name}</span>
                {on && (
                  <svg
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: accent }}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                  >
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-stone-500">
                {a.tagline || a.capabilities}
              </p>
              {/* 右上角：查看 / 编辑该 agent 的 prompt（复用共享 SkillPromptPanel） */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewing(a);
                }}
                title={tt("查看 / 编辑")}
                aria-label={tt("查看 / 编辑")}
                className="absolute right-1.5 top-1.5 rounded-md p-1 text-stone-300 opacity-0 transition hover:bg-stone-100 hover:text-stone-600 group-hover:opacity-100"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {showCreate && (
        <CreateSkillModal
          accent={accent}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {viewing && (
        <SkillPromptPanel
          variant="modal"
          open
          onClose={() => setViewing(null)}
          agentId={viewing.agent_id}
          name={viewing.name}
          tagline={viewing.tagline}
          icon={viewing.icon}
          category={viewing.category}
          accent={accent}
          onSavedAsSkill={() => {
            setViewing(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </section>
  );
}
