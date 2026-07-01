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
import { useUI } from "../i18n/ui/useUI";

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

/** 两个任务列表是否「实质相同」——id 序列 + 影响展示的字段（状态/标题/花费）都没变。
 * 轮询静默刷新时用它判断，避免每次都 setItems 出一个新数组引用导致整列表重渲染抽动。 */
function sameTasks(a: AgentTask[], b: AgentTask[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.status !== y.status ||
      x.title !== y.title ||
      (x.nano_spent ?? null) !== (y.nano_spent ?? null) ||
      (x.credits_spent ?? null) !== (y.credits_spent ?? null)
    ) {
      return false;
    }
  }
  return true;
}

function useHistory(siteId?: string, pending = false, authMsg?: string) {
  const tt = useUI();
  const authMessage = authMsg ?? tt("登录后即可查看历史记录。");
  const [items, setItems] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // silent=true（轮询刷新）：不进「加载…」态、列表不变时不替换数组引用——杜绝左栏
  // 每 8s 抽动 + 闪「加载…」。silent=false（首屏 / 站点切换）才显示首次加载骨架。
  const reload = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    listTasks(100, siteId, pending).then((r) => {
      if (!silent) setLoading(false);
      if (!r.ok || !r.data) {
        // 静默轮询失败不打断已有列表（只在首次加载时报错）。
        if (!silent) setError(r.status === 401 ? authMessage : r.error || tt("加载失败"));
        return;
      }
      setError(null);
      const next = r.data.items || [];
      setItems((prev) => (sameTasks(prev, next) ? prev : next));
    });
  }, [siteId, pending, authMessage, tt]);
  useEffect(() => reload(false), [reload]);
  // 「待处理」需要随任务进展刷新（running → done/未读 / 工作流流到人工）。轻量轮询，
  // 静默进行——不再每 8s 把列表替成「加载…」再跳回来。
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => reload(true), 8000);
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
  const tt = useUI();
  const { items, loading, error, remove } = useHistory(siteId);
  const [sel, setSel] = useWorkspaceSelection("history");
  const [pending, setPending] = useState<AgentTask | null>(null);

  // 模型选择已移到主区右上角（HistoryDetail），侧栏子栏只列历史记录本身。
  return (
    <div className="space-y-0.5">
      {error && <p className="px-3 py-2 text-[12px] text-neutral-400">{error}</p>}
      {!error && loading && <p className="px-3 py-2 text-[12px] text-neutral-400">{tt("加载…")}</p>}
      {!error && !loading && items.length === 0 && (
        <p className="px-3 py-2 text-[12px] text-neutral-400">{tt("还没有历史记录。")}</p>
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
                <span className="block truncate font-medium">{t.title || tt("未命名任务")}</span>
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
              title={tt("删除这条历史记录")}
              aria-label={tt("删除")}
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
          title={tt("删除历史记录")}
          body={tt("确定删除「{title}」？该会话的消息与产出将一并删除，不可恢复。", { title: pending.title || tt("未命名任务") })}
          confirmLabel={tt("删除")}
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
  const tt = useUI();
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
          {tt("在左侧选择一条历史记录，即可在此回看该次对话与产出。")}
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
// 「待处理」master-detail —— 已下线（操作员 2026-07-01）
// ----------------------------------------------------------------------------
// 主站不再有独立的「待处理」页面 / 功能：所有会话（进行中 / 已完成）统一进「历史
// 记录」（HistorySubNav 默认不带 pending，列全部会话；进行中的会话在左栏用状态点
// 体现，主区回看时轮询刷新）。PendingSubNav / PendingDetail 已删除，导出同步移除。
// ============================================================================
