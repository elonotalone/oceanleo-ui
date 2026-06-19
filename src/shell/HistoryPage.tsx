"use client";

// ============================================================================
// @oceanleo/ui — 历史记录 HistoryPage（单一事实源）
// ----------------------------------------------------------------------------
// 操作员 2026-06-19 定稿：每个 OceanLeo 站「历史记录」页统一长这样：
//   列出每次对话 / 工作（= 一条 agent_task），按时间倒序；点开 → onOpen(taskId)
//   回到 agent 工作界面复现该次的推导 + 结果。
// 真实后端：GET /v1/agent/tasks（列表）。详情由 AgentChat(taskId=...) 回看。
// ============================================================================

import { useEffect, useState, type ReactNode } from "react";
import { listTasks, type AgentTask } from "../lib/agent";

export interface HistoryPageProps {
  accent?: string;
  title?: ReactNode;
  /** 点击某条历史 → 打开该会话（消费端通常用它进入 AgentChat 回看）。 */
  onOpen: (taskId: string) => void;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  running: { text: "进行中", cls: "bg-amber-50 text-amber-700" },
  done: { text: "已完成", cls: "bg-emerald-50 text-emerald-700" },
  failed: { text: "失败", cls: "bg-rose-50 text-rose-600" },
  stopped: { text: "已停止", cls: "bg-stone-100 text-stone-500" },
};

const MODE_LABEL: Record<string, string> = { agent: "Agent", chat: "对话" };

function fmt(ts?: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryPage({ accent = "#4f46e5", title = "历史记录", onOpen }: HistoryPageProps) {
  const [items, setItems] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listTasks(100).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (!r.ok || !r.data) {
        setError(r.status === 401 ? "登录后即可查看历史记录。" : r.error || "加载失败");
        return;
      }
      setItems(r.data.items || []);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col px-8 py-6">
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{title}</h1>
      <p className="mt-1 text-[13px] text-neutral-500">
        每次对话 / 工作都会记录在这里，点开可回看推导过程与结果。
      </p>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
        {error ? (
          <Empty text={error} />
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-stone-100" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Empty text="还没有历史记录。去首页布置第一个任务吧。" />
        ) : (
          <div className="space-y-2">
            {items.map((t) => {
              const st = STATUS_LABEL[t.status] || { text: t.status, cls: "bg-stone-100 text-stone-500" };
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onOpen(t.id)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-left transition hover:border-stone-300 hover:shadow-sm"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold text-white"
                    style={{ background: accent }}
                  >
                    {MODE_LABEL[t.mode]?.[0] || "A"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-stone-800">{t.title || "未命名任务"}</p>
                    <p className="mt-0.5 text-[11px] text-stone-400">
                      {MODE_LABEL[t.mode] || t.mode} · {fmt(t.created_at)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${st.cls}`}>
                    {st.text}
                  </span>
                  <svg
                    className="h-4 w-4 shrink-0 text-stone-300 transition group-hover:text-stone-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center text-stone-400">
      <svg className="h-12 w-12 text-stone-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="max-w-xs text-sm">{text}</p>
    </div>
  );
}
