"use client";

// ============================================================================
// @oceanleo/ui — 工作台 master-detail（doctrine v4，单一事实源）
// ----------------------------------------------------------------------------
// 「工作台」侧栏子栏（master）+ 主区详情（detail）：
//   子栏 WorkspaceSubNav：列「我的 Agents」(= 功能区)，每项右侧带「删除」图标
//     （从我的 Agents 移除，调 unsaveAgent）；底部「＋ 添加 agent」跳 /all-sites?tab=agent。
//   主区 WorkspaceDetail：选中 agent → iframe 内嵌该子站功能区
//     (/workspace?embed=1&solo=1&fn=&agent=)；未选 → 兜底对话 AgentChat。
//
// 取代旧 WorkspaceShell 的「顶部功能区按键条」——把它从主区顶栏上提到侧栏子栏。
// 子栏与主区通过 useWorkspaceSelection("workspace") 共享选中态。
// ============================================================================

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AgentChat } from "./AgentChat";
import { useWorkspaceSelection } from "./WorkspaceSelection";
import { listMyAgents, unsaveAgent, type AgentDef } from "../lib/agent";

// ----------------------------------------------------------------------------
// 子站工作台子栏：把站点自己的「功能区名称」（ConsoleFunction）列到侧栏。
// 主区用受控 OperatorConsole(hideTabs, value 绑定本选中态) 渲染选中功能区。
// 内置功能区没有「删除」概念（不是收藏的 agent），故不带删除图标。
// ----------------------------------------------------------------------------
export interface ConsoleFnItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** 有 agentId → 显示「✦」标记，表示该功能区有专属 agent。 */
  agentId?: string;
}

export function ConsoleFnSubNav({
  functions,
  accent = "#4f46e5",
  defaultId,
}: {
  functions: ConsoleFnItem[];
  accent?: string;
  defaultId?: string;
}) {
  const [sel, setSel] = useWorkspaceSelection("workspace");
  useEffect(() => {
    if (!sel && functions.length > 0) setSel(defaultId || functions[0].id);
  }, [sel, functions, defaultId, setSel]);
  return (
    <div className="space-y-0.5">
      {functions.map((f) => {
        const on = f.id === sel;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => setSel(f.id)}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition ${
              on ? "text-white" : "text-neutral-700 hover:bg-neutral-200/50"
            }`}
            style={on ? { background: accent } : undefined}
            title={f.label}
          >
            {f.icon && <span className="shrink-0 text-base leading-none">{f.icon}</span>}
            <span className="min-w-0 flex-1 truncate font-medium">{f.label}</span>
            {f.agentId && (
              <span className={`shrink-0 text-[11px] ${on ? "text-white/80" : "text-indigo-400"}`} title="该 app 有专属 agent">
                ✦
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// 简单的「我的 Agents」共享拉取 + 本地移除（删除图标用）。
function useMyAgents() {
  const [mine, setMine] = useState<AgentDef[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const r = await listMyAgents();
    setMine(r.ok && r.data ? r.data.items : []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  const remove = useCallback(async (agentId: string) => {
    setMine((cur) => cur.filter((a) => a.agent_id !== agentId)); // optimistic
    const r = await unsaveAgent(agentId);
    if (!r.ok) void reload(); // rollback by refetch
  }, [reload]);
  return { mine, loading, remove };
}

// ----------------------------------------------------------------------------
// 侧栏子栏：我的 Agents（功能区）+ 删除图标 + ＋添加 agent
// ----------------------------------------------------------------------------
export function WorkspaceSubNav({
  accent = "#0ea5e9",
  addAgentHref = "/all-sites?tab=agent",
}: {
  accent?: string;
  addAgentHref?: string;
}) {
  const { mine, loading, remove } = useMyAgents();
  const [sel, setSel] = useWorkspaceSelection("workspace");

  // 默认选中第一个。
  useEffect(() => {
    if (!sel && mine.length > 0) setSel(mine[0].agent_id);
  }, [sel, mine, setSel]);

  return (
    <div className="space-y-0.5">
      {loading && <p className="px-3 py-2 text-[12px] text-neutral-400">加载 app…</p>}
      {!loading && mine.length === 0 && (
        <p className="px-3 py-2 text-[12px] text-neutral-400">
          还没有 app。点下方「＋ 添加 app」从 OceanLeo app 里挑选。
        </p>
      )}
      {mine.map((a) => {
        const on = a.agent_id === sel;
        return (
          <div
            key={a.agent_id}
            className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition ${
              on ? "text-white" : "text-neutral-700 hover:bg-neutral-200/50"
            }`}
            style={on ? { background: accent } : undefined}
          >
            <button
              type="button"
              onClick={() => setSel(a.agent_id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              title={a.tagline}
            >
              <span className="shrink-0 text-base leading-none">{a.icon || "✦"}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
            </button>
            {/* 删除图标：从我的 Agents 移除 */}
            <button
              type="button"
              onClick={() => {
                void remove(a.agent_id);
                if (on) setSel(null);
              }}
              title="从工作台移除"
              aria-label="移除"
              className={`shrink-0 rounded p-0.5 transition ${
                on
                  ? "text-white/70 hover:bg-white/20 hover:text-white"
                  : "text-neutral-300 opacity-0 hover:text-rose-500 group-hover:opacity-100"
              }`}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m1 0v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        );
      })}

      <a
        href={addAgentHref}
        className="mt-1 flex items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-[13px] font-medium text-neutral-500 transition hover:border-sky-300 hover:text-sky-600"
      >
        ＋ 添加 app
      </a>
    </div>
  );
}

// ----------------------------------------------------------------------------
// 主区详情：选中 agent → iframe 内嵌功能区；未选 → 兜底对话
// ----------------------------------------------------------------------------
export function WorkspaceDetail({
  siteOrigin,
  accent = "#0ea5e9",
  homeSiteId = "",
  addAgentHref = "/all-sites?tab=agent",
}: {
  siteOrigin: Record<string, string>;
  accent?: string;
  homeSiteId?: string;
  addAgentHref?: string;
}) {
  const { mine, loading } = useMyAgents();
  const [sel] = useWorkspaceSelection("workspace");

  const active = useMemo(
    () => mine.find((a) => a.agent_id === sel) || null,
    [mine, sel],
  );

  const embedSrc = useMemo(() => {
    if (!active) return "";
    const origin = siteOrigin[active.site_id];
    if (!origin) return "";
    const fn = active.fn_id ? `&fn=${encodeURIComponent(active.fn_id)}` : "";
    return `${origin}/workspace?embed=1&solo=1${fn}&agent=${encodeURIComponent(active.agent_id)}`;
  }, [active, siteOrigin]);

  return (
    <div className="h-[calc(100dvh-1px)] p-1.5">
      {active && embedSrc ? (
        <iframe
          key={active.agent_id}
          src={embedSrc}
          title={active.name}
          className="h-full w-full rounded-2xl border border-stone-200 bg-white/60"
          allow="clipboard-write; clipboard-read; fullscreen"
          allowFullScreen
        />
      ) : active && !embedSrc ? (
        <div className="grid h-full place-items-center rounded-2xl border border-stone-200 bg-white/60 p-8 text-center text-sm text-stone-400">
          该 app 所属站点暂未接入内嵌工作台。
        </div>
      ) : !loading && mine.length === 0 ? (
        <div className="grid h-full place-items-center rounded-2xl border border-dashed border-stone-300 bg-white/40 p-8 text-center">
          <div className="max-w-sm space-y-3">
            <p className="text-sm text-stone-500">
              还没有添加 app。点左侧「＋ 添加 app」从 OceanLeo app 里挑选；
              选好的 app 会作为功能区出现在左侧栏。
            </p>
            <a
              href={addAgentHref}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-white"
              style={{ background: accent }}
            >
              ＋ 添加 app
            </a>
          </div>
        </div>
      ) : loading ? (
        <div className="grid h-full place-items-center text-sm text-stone-400">加载…</div>
      ) : (
        <div className="h-full overflow-hidden rounded-2xl border border-stone-200 bg-white/60">
          <AgentChat siteId={homeSiteId} accent={accent} headerHeight={56} />
        </div>
      )}
    </div>
  );
}
