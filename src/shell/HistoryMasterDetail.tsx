"use client";

// ============================================================================
// @oceanleo/ui — 历史记录 master-detail（doctrine v4，单一事实源）
// ----------------------------------------------------------------------------
// 「历史记录」侧栏子栏（master）+ 主区详情（detail）：
//   子栏 HistorySubNav：列每次对话/工作（agent_task），可删除；点某条 → 主区回看。
//   主区 HistoryDetail：选中会话 → AgentChat(taskId=...) 回看该次推导 + 结果。
// 子栏与主区通过 useWorkspaceSelection("history") 共享选中 taskId。
//
// 旧的整页 HistoryPage（主区列表）保留（向后兼容 + 主站 hub 可用），本文件提供
// master-detail 形态供 doctrine v4 覆盖式子栏使用。
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { AgentChat } from "./AgentChat";
import { ModelPicker } from "./ModelPicker";
import { useWorkspaceSelection } from "./WorkspaceSelection";
import { listTasks, deleteTask, taskCostYuan, type AgentTask } from "../lib/agent";
import { ConfirmDialog } from "../ui";

/** 任务花费 → 「¥x.xx」展示（精确口径）。0 / 无花费返回空串。 */
function fmtCost(t: AgentTask): string {
  const y = taskCostYuan(t);
  return y > 0 ? `¥${y.toFixed(2)}` : "";
}

const STATUS_DOT: Record<string, string> = {
  running: "bg-amber-400",
  done: "bg-emerald-500",
  failed: "bg-rose-500",
  stopped: "bg-stone-400",
};

function fmt(ts?: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function useHistory(siteId?: string, pending = false, authMsg = "登录后即可查看历史记录。") {
  const [items, setItems] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    setLoading(true);
    listTasks(100, siteId, pending).then((r) => {
      setLoading(false);
      if (!r.ok || !r.data) {
        setError(r.status === 401 ? authMsg : r.error || "加载失败");
        return;
      }
      setError(null);
      setItems(r.data.items || []);
    });
  }, [siteId, pending, authMsg]);
  useEffect(() => reload(), [reload]);
  // 「待处理」需要随任务进展刷新（running → done/未读 / 工作流流到人工）。轻量轮询。
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(reload, 8000);
    return () => clearInterval(t);
  }, [pending, reload]);
  const remove = useCallback(async (id: string) => {
    const prev = items;
    setItems((l) => l.filter((t) => t.id !== id));
    const r = await deleteTask(id);
    if (!r.ok) setItems(prev);
  }, [items]);
  return { items, loading, error, remove, reload };
}

// ----------------------------------------------------------------------------
// 侧栏子栏：历史列表（可删除）
// ----------------------------------------------------------------------------
export function HistorySubNav({ siteId, accent = "#0ea5e9" }: { siteId?: string; accent?: string }) {
  const { items, loading, error, remove } = useHistory(siteId);
  const [sel, setSel] = useWorkspaceSelection("history");
  const [pending, setPending] = useState<AgentTask | null>(null);

  // 模型选择已移到主区右上角（HistoryDetail），侧栏子栏只列历史记录本身。
  return (
    <div className="space-y-0.5">
      {error && <p className="px-3 py-2 text-[12px] text-neutral-400">{error}</p>}
      {!error && loading && <p className="px-3 py-2 text-[12px] text-neutral-400">加载…</p>}
      {!error && !loading && items.length === 0 && (
        <p className="px-3 py-2 text-[12px] text-neutral-400">还没有历史记录。</p>
      )}
      {items.map((t) => {
        const on = t.id === sel;
        return (
          <div
            key={t.id}
            className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition ${
              on ? "text-white" : "text-neutral-700 hover:bg-neutral-200/50"
            }`}
            style={on ? { background: accent } : undefined}
          >
            <button
              type="button"
              onClick={() => setSel(t.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-white/80" : STATUS_DOT[t.status] || "bg-stone-400"}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t.title || "未命名任务"}</span>
                <span className={`block truncate text-[11px] ${on ? "text-white/70" : "text-neutral-400"}`}>
                  {fmt(t.created_at)}
                  {!siteId && t.site_id ? ` · ${t.site_id}` : ""}
                  {fmtCost(t) ? ` · ${fmtCost(t)}` : ""}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPending(t)}
              title="删除这条历史记录"
              aria-label="删除"
              className={`shrink-0 rounded p-0.5 transition ${
                on ? "text-white/70 hover:bg-white/20 hover:text-white" : "text-neutral-300 opacity-0 hover:text-rose-500 group-hover:opacity-100"
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

      {pending && (
        <ConfirmDialog
          title="删除历史记录"
          body={`确定删除「${pending.title || "未命名任务"}」？该会话的消息与产出将一并删除，不可恢复。`}
          confirmLabel="删除"
          danger
          onConfirm={() => {
            void remove(pending.id);
            if (pending.id === sel) setSel(null);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// 主区详情：选中会话 → AgentChat 回看
// ----------------------------------------------------------------------------
export function HistoryDetail({
  siteId = "",
  accent = "#0ea5e9",
  appNames,
}: {
  siteId?: string;
  accent?: string;
  /** site_id → app 展示名（回看时在 agent 界面显示「所属 app」）。 */
  appNames?: Record<string, string>;
}) {
  const [sel] = useWorkspaceSelection("history");
  // 主区右上角模型选择（5 模态，popover）——回看时若用户追问，用所选「文本」模型。
  // 这是模型选择的唯一落点（与各 app 顶栏一致），不再放在左侧子栏里。
  const [agentModel, setAgentModel] = useState("");
  const modelBar = (
    <div className="flex shrink-0 items-center justify-end border-b border-neutral-100 px-3 py-2">
      <ModelPicker
        categories={["text", "image", "video", "threed", "audio"]}
        siteId={siteId || "history"}
        variant="popover"
        align="right"
        onChange={(cat, m) => {
          if (cat === "text") setAgentModel(m.key);
        }}
      />
    </div>
  );
  if (!sel) {
    return (
      <div className="flex h-[calc(100dvh-1px)] flex-col">
        {modelBar}
        <div className="grid flex-1 place-items-center p-8 text-center text-[13px] text-neutral-400">
          在左侧选择一条历史记录，即可在此回看该次对话与产出。
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      {modelBar}
      <div className="min-h-0 flex-1">
        <AgentChat
          key={sel}
          siteId={siteId}
          taskId={sel}
          agentModel={agentModel}
          accent={accent}
          headerHeight={49}
          appNames={appNames}
        />
      </div>
    </div>
  );
}

// ============================================================================
// 「待处理」master-detail（2026-06-26）
// ----------------------------------------------------------------------------
// 与「历史记录」共享数据 / 回看，但只列**需要用户关注**的任务：
//   - 正在执行（running）
//   - 工作流流到人工确认门、等用户拍板（status=waiting_user）
//   - 已完成但用户还没看过（done & seen=false）
// 用户打开任务（get_task）→ 后端置 seen=true → 该条从「待处理」消失，沉入「历史记录」。
// 顶部带模型选择（5 模态），每条带状态标 + 精确花费。
// ============================================================================

const PENDING_STATUS_LABEL: Record<string, string> = {
  running: "处理中",
  waiting_user: "待确认",
  done: "待查看",
  failed: "失败",
  stopped: "已停止",
};

const PENDING_STATUS_CLASS: Record<string, string> = {
  running: "bg-sky-100 text-sky-700",
  waiting_user: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  stopped: "bg-stone-100 text-stone-600",
};

export function PendingSubNav({ siteId, accent = "#0ea5e9" }: { siteId?: string; accent?: string }) {
  const { items, loading, error, remove } = useHistory(siteId, true, "登录后即可查看待处理任务。");
  const [sel, setSel] = useWorkspaceSelection("history");
  const [pending, setPending] = useState<AgentTask | null>(null);

  // 模型选择已移到主区右上角（PendingDetail/HistoryDetail），侧栏子栏只列任务本身。
  return (
    <div className="space-y-0.5">
      {error && <p className="px-3 py-2 text-[12px] text-neutral-400">{error}</p>}
      {!error && loading && <p className="px-3 py-2 text-[12px] text-neutral-400">加载…</p>}
      {!error && !loading && items.length === 0 && (
        <p className="px-3 py-2 text-[12px] text-neutral-400">暂无待处理任务。完成的任务会进入「历史记录」。</p>
      )}
      {items.map((t) => {
        const on = t.id === sel;
        const st = String(t.status || "");
        const cost = fmtCost(t);
        return (
          <div
            key={t.id}
            className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition ${
              on ? "text-white" : "text-neutral-700 hover:bg-neutral-200/50"
            }`}
            style={on ? { background: accent } : undefined}
          >
            <button
              type="button"
              onClick={() => setSel(t.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  on ? "bg-white/80" : st === "running" ? "bg-sky-500 v-pulse-dot" : STATUS_DOT[st] || "bg-stone-400"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t.title || "未命名任务"}</span>
                <span className={`block truncate text-[11px] ${on ? "text-white/70" : "text-neutral-400"}`}>
                  {fmt(t.created_at)}
                  {!siteId && t.site_id ? ` · ${t.site_id}` : ""}
                  {cost ? ` · ${cost}` : ""}
                </span>
              </span>
            </button>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                on ? "bg-white/20 text-white" : PENDING_STATUS_CLASS[st] || "bg-stone-100 text-stone-600"
              }`}
            >
              {PENDING_STATUS_LABEL[st] || st}
            </span>
            <button
              type="button"
              onClick={() => setPending(t)}
              title="删除这条任务"
              aria-label="删除"
              className={`shrink-0 rounded p-0.5 transition ${
                on ? "text-white/70 hover:bg-white/20 hover:text-white" : "text-neutral-300 opacity-0 hover:text-rose-500 group-hover:opacity-100"
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

      {pending && (
        <ConfirmDialog
          title="删除任务"
          body={`确定删除「${pending.title || "未命名任务"}」？该会话的消息与产出将一并删除，不可恢复。`}
          confirmLabel="删除"
          danger
          onConfirm={() => {
            void remove(pending.id);
            if (pending.id === sel) setSel(null);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

/** 「待处理」主区详情 —— 与历史回看一致（共享 useWorkspaceSelection("history")）。 */
export function PendingDetail(props: {
  siteId?: string;
  accent?: string;
  appNames?: Record<string, string>;
}) {
  const [sel] = useWorkspaceSelection("history");
  if (!sel) {
    return (
      <div className="grid h-[calc(100dvh-1px)] place-items-center p-8 text-center text-[13px] text-neutral-400">
        在左侧选择一条待处理任务，即可在此查看进度、确认结果或继续推进。
      </div>
    );
  }
  return <HistoryDetail {...props} />;
}
