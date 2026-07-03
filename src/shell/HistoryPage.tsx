"use client";

// ============================================================================
// @oceanleo/ui — 历史记录 HistoryPage（单一事实源）
// ----------------------------------------------------------------------------
// 操作员 2026-06-19 定稿：每个 OceanLeo 站「历史记录」页统一长这样：
//   列出每次对话 / 工作（= 一条 agent_task），按时间倒序；点开 → onOpen(taskId)
//   回到 agent 工作界面复现该次的推导 + 结果。
// 真实后端：GET /v1/agent/tasks（列表）。详情由 AgentChat(taskId=...) 回看。
//
// 2026-06-21（操作员）：
//   1. 每站只看自己的历史 —— 传 `siteId` → 后端按 site_id 过滤。主站
//      oceanleo.com 是 hub，不传 siteId → 列全部站的历史。
//   2. 每条历史可删除 —— 行尾加「删除」按键（确认弹窗），调
//      DELETE /v1/agent/tasks/{id}（连带消息 / 产出级联删除）。
// ============================================================================

import { useEffect, useState, type ReactNode } from "react";
import { listTasks, deleteTask, type AgentTask } from "../lib/agent";
import { ConfirmDialog } from "../ui";
import { useUI, type UITranslate } from "../i18n/ui/useUI";

export interface HistoryPageProps {
  accent?: string;
  title?: ReactNode;
  /**
   * 站点 id（驱动 per-site 过滤）。
   * - 子站传自身 id（如 "image"）→ 只列该站历史。
   * - 主站 oceanleo.com hub 省略 / 传空 → 列全部站历史。
   */
  siteId?: string;
  /** 点击某条历史 → 打开该会话（消费端通常用它进入 AgentChat 回看）。 */
  onOpen: (taskId: string) => void;
}

function statusLabels(tt: UITranslate): Record<string, { text: string; cls: string }> {
  return {
    running: { text: tt("进行中"), cls: "bg-amber-50 text-amber-700" },
    done: { text: tt("已完成"), cls: "bg-emerald-50 text-emerald-700" },
    failed: { text: tt("失败"), cls: "bg-rose-50 text-rose-600" },
    stopped: { text: tt("已停止"), cls: "bg-stone-100 text-stone-500" },
  };
}

function modeLabels(tt: UITranslate): Record<string, string> {
  return { agent: "Agent", chat: tt("对话") };
}

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

export function HistoryPage({ accent = "#4f46e5", title, siteId, onOpen }: HistoryPageProps) {
  const tt = useUI();
  const STATUS_LABEL = statusLabels(tt);
  const MODE_LABEL = modeLabels(tt);
  const [items, setItems] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AgentTask | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    listTasks(100, siteId).then((r) => {
      if (!alive) return;
      setLoading(false);
      if (!r.ok || !r.data) {
        setError(r.status === 401 ? tt("登录后即可查看历史记录。") : r.error || tt("加载失败"));
        return;
      }
      setItems(r.data.items || []);
    });
    return () => {
      alive = false;
    };
  }, [siteId]);

  async function confirmDelete() {
    const task = pendingDelete;
    if (!task) return;
    setDeletingId(task.id);
    setPendingDelete(null);
    const prev = items;
    setItems((list) => list.filter((t) => t.id !== task.id)); // optimistic
    const r = await deleteTask(task.id);
    setDeletingId(null);
    if (!r.ok) {
      setItems(prev); // rollback
      setError(r.error || tt("删除失败，请重试。"));
    }
  }

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col px-8 py-6">
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{title ?? tt("历史记录")}</h1>
      <p className="mt-1 text-[13px] text-neutral-500">
        {siteId
          ? tt("本站每次对话 / 工作都会记录在这里，点开可回看推导过程与结果。")
          : tt("全家桶各站的每次对话 / 工作都会记录在这里，点开可回看推导过程与结果。")}
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
          <Empty text={tt("还没有历史记录。去首页布置第一个任务吧。")} />
        ) : (
          <div className="space-y-2">
            {items.map((t) => {
              const st = STATUS_LABEL[t.status] || { text: t.status, cls: "bg-stone-100 text-stone-500" };
              const removing = deletingId === t.id;
              return (
                <div
                  key={t.id}
                  className={`group flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 transition hover:border-stone-300 hover:shadow-sm ${
                    removing ? "opacity-50" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(t.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold text-white"
                      style={{ background: accent }}
                    >
                      {MODE_LABEL[t.mode]?.[0] || "A"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-stone-800">{t.title || tt("未命名任务")}</p>
                      <p className="mt-0.5 text-[11px] text-stone-400">
                        {MODE_LABEL[t.mode] || t.mode} · {fmt(t.created_at)}
                        {!siteId && t.site_id ? ` · ${t.site_id}` : ""}
                      </p>
                    </div>
                  </button>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${st.cls}`}>
                    {st.text}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(t)}
                    disabled={removing}
                    title={tt("删除这条历史记录")}
                    aria-label={tt("删除")}
                    className="shrink-0 rounded-lg p-1.5 text-stone-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path
                        d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m1 0v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path d="M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <svg
                    className="h-4 w-4 shrink-0 text-stone-300"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title={tt("删除历史记录")}
          body={tt("确定删除「{title}」？该会话的消息与产出将一并删除，不可恢复。", { title: pendingDelete.title || tt("未命名任务") })}
          confirmLabel={tt("删除")}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  const tt = useUI();
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center text-stone-400">
      <svg className="h-12 w-12 text-stone-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="max-w-xs text-sm">{tt(text)}</p>
    </div>
  );
}
