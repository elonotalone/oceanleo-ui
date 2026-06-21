"use client";

// ============================================================================
// @oceanleo/ui — 主站「工作台」母页面壳（单一事实源）
// ----------------------------------------------------------------------------
// Doctrine v3: docs/architecture/oceanleo-function-agent-and-app-shell.md §5.3
//   主站 oceanleo.com 的「工作台」与各子站工作台一模一样。在「选 agent」处列出
//   「我的 Agents」；「＋ 添加 agent」跳 /agents。选了某 agent → 用 iframe 内嵌
//   该子站的 /workspace?fn=<fn_id>&embed=1（embed=1 子站隐藏自身外壳，只渲染该
//   功能区的「操作台/agent + 结果」）。跨站用 postMessage 打通。一个 agent 对应
//   一个操作台。没有合适 agent 时退化为「左对话框 + 右结果」（用 AgentChat）。
//
// 这套 iframe + postMessage 机制同时是「一壳全家桶 app」的底层（§6）。
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { AgentChat } from "./AgentChat";
import {
  listMyAgents,
  type AgentDef,
} from "../lib/agent";

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
      setMine(r.ok && r.data ? r.data.items : []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

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
    return `${origin}/workspace?embed=1${fn}&agent=${encodeURIComponent(active.agent_id)}`;
  }, [active, siteOrigin]);

  return (
    <div className="flex" style={{ height: `calc(100dvh - ${headerHeight}px)` }}>
      {/* 左侧：选 agent（来自「我的 Agents」）+ 添加 */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-white/60">
        <div className="border-b border-stone-100 px-4 py-3">
          <p className="text-[12px] font-medium uppercase tracking-wide text-stone-400">
            选择 agent
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          {loading && <p className="px-2 py-4 text-sm text-stone-400">加载中…</p>}
          {!loading && mine.length === 0 && (
            <p className="px-2 py-4 text-[13px] leading-relaxed text-stone-400">
              还没有添加 agent。点下方「＋ 添加 agent」从 OceanLeo Agents 里挑选。
            </p>
          )}
          {mine.map((a) => {
            const on = a.agent_id === activeId;
            return (
              <button
                key={a.agent_id}
                type="button"
                onClick={() => select(a.agent_id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  on ? "text-white" : "text-stone-700 hover:bg-stone-100"
                }`}
                style={on ? { background: accent } : undefined}
              >
                <span className="shrink-0 text-base">{a.icon || "✦"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{a.name}</span>
                  <span
                    className={`block truncate text-[11px] ${on ? "text-white/80" : "text-stone-400"}`}
                  >
                    {a.tagline}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="border-t border-stone-100 p-2">
          <a
            href={addAgentHref}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-stone-300 px-3 py-2 text-[13px] font-medium text-stone-500 transition-colors hover:border-indigo-300 hover:text-indigo-600"
          >
            ＋ 添加 agent
          </a>
        </div>
      </aside>

      {/* 右侧：选中 agent → 内嵌子站功能区；未选 → 主站兜底对话 */}
      <div className="min-w-0 flex-1">
        {active && embedSrc ? (
          <iframe
            key={active.agent_id}
            src={embedSrc}
            title={active.name}
            className="h-full w-full border-0"
            allow="clipboard-write; clipboard-read"
          />
        ) : active && !embedSrc ? (
          <div className="grid h-full place-items-center p-8 text-center text-sm text-stone-400">
            该 agent 所属站点暂未接入内嵌工作台。
          </div>
        ) : (
          <AgentChat
            siteId={homeSiteId}
            accent={accent}
            headerHeight={headerHeight}
          />
        )}
      </div>
    </div>
  );
}
