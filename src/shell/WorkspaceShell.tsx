"use client";

// ============================================================================
// @oceanleo/ui — 主站「工作台」母页面壳（单一事实源）
// ----------------------------------------------------------------------------
// Doctrine v3: docs/architecture/oceanleo-function-agent-and-app-shell.md §5.3
//   主站 oceanleo.com 的「工作台」与各子站工作台一模一样。
//
// 2026-06-21 改版（操作员）：
//   - 删除原「中间一列『选择 AGENT』」。
//   - 「我的 Agents」直接作为**顶部功能区按键条**（与子站工作台的功能区按键条
//     完全同构）；「＋ 添加 agent」放在这条按键条的**最右边**，点了跳 /agents。
//   - 选中某 agent → 用 iframe 内嵌该子站的
//       /workspace?embed=1&fn=<fn_id>&agent=<agent_id>&solo=1
//     solo=1 让子站**只渲染这一个功能区**、隐藏它自己的功能区按键条（避免「选一个
//     agent 把整站的功能区都带出来」的问题）。embed=1 隐藏子站自身外壳。
//   - 没有任何「我的 Agents」时 → 顶部只剩「＋ 添加 agent」，主体用兜底 AgentChat。
//
// 这套 iframe + postMessage 机制同时是「一壳全家桶 app」的底层（§6）。
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentChat } from "./AgentChat";
import { listMyAgents, type AgentDef } from "../lib/agent";

export interface WorkspaceShellProps {
  /** 各 site_id → 该站域名（用于拼 iframe src）。默认 https://<map>。 */
  siteOrigin: Record<string, string>;
  /** 「＋ 添加 agent」跳转地址，默认 "/agents"。 */
  addAgentHref?: string;
  /** 受控：当前选中的 agent_id。不传则内部自管。 */
  value?: string;
  onChange?: (agentId: string) => void;
  accent?: string;
  headerHeight?: number;
  /** 主站自己的 site_id（无 agent 兜底对话时用），默认 "home"。 */
  homeSiteId?: string;
}

export function WorkspaceShell({
  siteOrigin,
  addAgentHref = "/agents",
  value,
  onChange,
  accent = "#4f46e5",
  headerHeight = 56,
  homeSiteId = "home",
}: WorkspaceShellProps) {
  const [mine, setMine] = useState<AgentDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [internal, setInternal] = useState<string>("");
  const activeId = value ?? internal;

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await listMyAgents();
      if (!alive) return;
      const items = r.ok && r.data ? r.data.items : [];
      setMine(items);
      setLoading(false);
      // 默认选中第一个（仅非受控时）。
      if (value === undefined && items.length > 0) {
        setInternal((cur) => cur || items[0].agent_id);
      }
    })();
    return () => {
      alive = false;
    };
  }, [value]);

  const select = useCallback(
    (id: string) => {
      if (value === undefined) setInternal(id);
      onChange?.(id);
    },
    [value, onChange],
  );

  const active = useMemo(
    () => mine.find((a) => a.agent_id === activeId) || null,
    [mine, activeId],
  );

  const embedSrc = useMemo(() => {
    if (!active) return "";
    const origin = siteOrigin[active.site_id];
    if (!origin) return "";
    const fn = active.fn_id ? `&fn=${encodeURIComponent(active.fn_id)}` : "";
    // solo=1：子站只渲染这一个功能区、隐藏自身功能区按键条（主站这条 agent 行
    // 已是功能区选择器，不该再带出整站的功能区）。
    return `${origin}/workspace?embed=1&solo=1${fn}&agent=${encodeURIComponent(
      active.agent_id,
    )}`;
  }, [active, siteOrigin]);

  return (
    <div className="flex flex-col" style={{ height: `calc(100dvh - ${headerHeight}px)` }}>
      {/* 顶部：我的 Agents = 功能区按键条 + 最右「＋ 添加 agent」 */}
      <div className="shrink-0 px-4 pt-4">
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-stone-200/80 bg-white/80 p-1.5 shadow-sm">
          {loading && (
            <span className="px-3 py-2 text-sm text-stone-400">加载 agent…</span>
          )}
          {!loading &&
            mine.map((a) => {
              const on = a.agent_id === activeId;
              return (
                <button
                  key={a.agent_id}
                  type="button"
                  onClick={() => select(a.agent_id)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    on ? "text-white shadow-sm" : "text-stone-600 hover:bg-stone-100"
                  }`}
                  style={on ? { background: accent } : undefined}
                  title={a.tagline}
                >
                  <span className="shrink-0 text-base leading-none">{a.icon || "✦"}</span>
                  <span className="max-w-[10rem] truncate">{a.name}</span>
                </button>
              );
            })}
          {/* 最右：添加 agent */}
          <a
            href={addAgentHref}
            className="ml-auto flex items-center gap-1.5 rounded-xl border border-dashed border-stone-300 px-3 py-2 text-sm font-medium text-stone-500 transition-colors hover:border-indigo-300 hover:text-indigo-600"
          >
            ＋ 添加 agent
          </a>
        </div>
      </div>

      {/* 主体：选中 agent → 内嵌子站功能区；未选 → 主站兜底对话 */}
      <div className="min-h-0 min-w-0 flex-1 p-4">
        {active && embedSrc ? (
          <iframe
            key={active.agent_id}
            src={embedSrc}
            title={active.name}
            className="h-full w-full rounded-2xl border border-stone-200 bg-white/60"
            allow="clipboard-write; clipboard-read"
          />
        ) : active && !embedSrc ? (
          <div className="grid h-full place-items-center rounded-2xl border border-stone-200 bg-white/60 p-8 text-center text-sm text-stone-400">
            该 agent 所属站点暂未接入内嵌工作台。
          </div>
        ) : !loading && mine.length === 0 ? (
          <div className="grid h-full place-items-center rounded-2xl border border-dashed border-stone-300 bg-white/40 p-8 text-center">
            <div className="max-w-sm space-y-3">
              <p className="text-sm text-stone-500">
                还没有添加 agent。点上方右侧「＋ 添加 agent」从 OceanLeo Agents 里挑选，
                选好的 agent 会作为功能区出现在这条顶栏。
              </p>
              <a
                href={addAgentHref}
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-white"
                style={{ background: accent }}
              >
                ＋ 添加 agent
              </a>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-hidden rounded-2xl border border-stone-200 bg-white/60">
            <AgentChat siteId={homeSiteId} accent={accent} headerHeight={headerHeight} />
          </div>
        )}
      </div>
    </div>
  );
}
