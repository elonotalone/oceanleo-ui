"use client";

// ============================================================================
// @oceanleo/ui —「我的任务」master-detail（内部路由兼容名 history）
// ----------------------------------------------------------------------------
// 「我的任务」侧栏子栏（master）+ 主区详情（detail）：
//   子栏优先列完整 app_session；未归属 session 的旧 agent_task 继续保留。
//   主区完整 session 挂站点真实 workspace runtime；旧 task 才明确降级 AgentChat。
// 子栏与主区通过 useWorkspaceSelection("history") 共享选中 id。
//
// 旧的整页 HistoryPage（主区列表）保留（向后兼容 + 主站 hub 可用），本文件提供
// master-detail 形态供 doctrine v4 覆盖式子栏使用。
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AgentChat, type AgentLibraryTabs } from "./AgentChat";
import { useWorkspaceSelection } from "./WorkspaceSelection";
import {
  listTasks,
  deleteTask,
  getTask,
  taskCostYuan,
  type AgentTask,
  type ArtifactMeta,
  type TaskDetail,
} from "../lib/agent";
import {
  deleteAppSession,
  getAppSession,
  isAppSessionApiUnavailableStatus,
  listAppSessions,
  updateAppSessionMetadata,
  type AppSession,
} from "../lib/app-session";
import { ConfirmDialog } from "../ui";
import { browserClient } from "../lib/auth/client";
import { useUI } from "../i18n/ui/useUI";
import { WorkspaceSessionProvider } from "./WorkspaceSession";
import {
  canDeleteHistoryEntry,
  isRestorableAppSession,
  mergeHistoryEntries,
  withLinkedAgentTask,
  type HistoryListEntry,
  type RestorableAppSession,
} from "./history-model";
import {
  historySessionHref,
  historySessionIdFromPath,
} from "./workspace-route";
import { HISTORY_CHANGED_EVENT } from "../lib/history-events";
import {
  HistoryRowMenu,
  MoveTaskProjectDialog,
} from "./HistoryRowActions";

export type { RestorableAppSession } from "./history-model";

/** 任务花费 → 「¥x.xx」展示（精确口径）。0 / 无花费返回空串。 */
function fmtCost(t: AgentTask): string {
  const y = taskCostYuan(t);
  return y > 0 ? `¥${y.toFixed(2)}` : "";
}

function historyHrefFor(entry: HistoryListEntry): string {
  return entry.kind === "session"
    ? historySessionHref(entry.id)
    : `/history?task=${encodeURIComponent(entry.id)}`;
}

const STATUS_DOT: Record<string, string> = {
  running: "bg-amber-400",
  active: "bg-amber-400",
  done: "bg-emerald-500",
  archived: "bg-stone-400",
  failed: "bg-rose-500",
  stopped: "bg-stone-400",
};

function fmt(ts?: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** 两个任务列表是否「实质相同」——避免静默刷新时整列抽动。 */
function sameHistory(a: HistoryListEntry[], b: HistoryListEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.kind !== y.kind || x.id !== y.id) return false;
    if (x.kind === "session" && y.kind === "session") {
      if (
        x.session.revision !== y.session.revision ||
        x.session.status !== y.session.status ||
        x.session.title !== y.session.title ||
        x.session.title_status !== y.session.title_status ||
        x.session.last_activity_at !== y.session.last_activity_at ||
        Boolean(x.session.pinned) !== Boolean(y.session.pinned) ||
        Boolean(x.session.favorite) !== Boolean(y.session.favorite) ||
        (x.session.project_id ?? null) !== (y.session.project_id ?? null)
      ) {
        return false;
      }
    } else if (x.kind === "task" && y.kind === "task") {
      if (
        x.task.status !== y.task.status ||
        x.task.title !== y.task.title ||
        Boolean(x.task.pinned) !== Boolean(y.task.pinned) ||
        Boolean(x.task.favorite) !== Boolean(y.task.favorite) ||
        (x.task.project_id ?? null) !== (y.task.project_id ?? null) ||
        (x.task.nano_spent ?? null) !== (y.task.nano_spent ?? null) ||
        (x.task.credits_spent ?? null) !== (y.task.credits_spent ?? null)
      ) {
        return false;
      }
    }
  }
  return true;
}

function useHistory(siteId?: string, pending = false, authMsg?: string) {
  const tt = useUI();
  const authMessage = authMsg ?? tt("登录后即可查看我的任务。");
  const [items, setItems] = useState<HistoryListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reloadGenerationRef = useRef(0);
  const deletingRef = useRef(new Set<string>());
  // silent=true（轮询刷新）：不进「加载…」态、列表不变时不替换数组引用——杜绝左栏
  // 每 8s 抽动 + 闪「加载…」。silent=false（首屏 / 站点切换）才显示首次加载骨架。
  const reload = useCallback((silent = false) => {
    const generation = ++reloadGenerationRef.current;
    if (!silent) setLoading(true);
    void Promise.all([
      listAppSessions({
        limit: 100,
        siteId,
        includeArchived: true,
        surface: "all",
      }),
      listTasks(100, siteId, pending, "all"),
    ]).then(([sessionsResult, tasksResult]) => {
      if (generation !== reloadGenerationRef.current) return;
      if (!silent) setLoading(false);
      const sessions = sessionsResult.ok
        ? sessionsResult.data?.items || []
        : null;
      const tasks = tasksResult.ok ? tasksResult.data?.items || [] : null;
      if (sessions === null && tasks === null) {
        // 静默轮询失败不打断已有列表（只在首次加载时报错）。
        if (!silent) {
          const signedOut =
            sessionsResult.status === 401 || tasksResult.status === 401;
          setError(
            signedOut
              ? authMessage
              : sessionsResult.error || tasksResult.error || tt("加载失败"),
          );
        }
        return;
      }
      setError(null);
      // session API 尚未部署时 sessions=null → 完整退回旧 task 列表。API 已部署时，
      // session 置顶，并只保留未绑定 session 的旧 task。
      const next = mergeHistoryEntries(sessions || [], tasks || [], {
        sessionApiUnavailable:
          !sessionsResult.ok &&
          isAppSessionApiUnavailableStatus(sessionsResult.status),
      }).filter(
        (entry) => !deletingRef.current.has(`${entry.kind}:${entry.id}`),
      );
      setItems((prev) => (sameHistory(prev, next) ? prev : next));
    });
  }, [siteId, pending, authMessage, tt]);
  useEffect(() => reload(false), [reload]);
  useEffect(() => {
    const refresh = () => reload(true);
    window.addEventListener(HISTORY_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(HISTORY_CHANGED_EVENT, refresh);
  }, [reload]);
  // 全部任务静默刷新：active 会话也必须在创建后进入「我的任务」，不能因为当前列表
  // 还没有 active 项就永远不再请求。sameHistory 保证无变化时不替换数组、不闪烁。
  useEffect(() => {
    const t = setInterval(() => reload(true), 8000);
    return () => clearInterval(t);
  }, [reload]);
  const hasPendingSessionTitle = items.some(
    (item) =>
      item.kind === "session" &&
      item.session.status === "archived" &&
      item.session.title_status === "pending",
  );
  // AI history naming happens after archival. Poll only while a durable
  // pending marker exists, then stop as soon as the generated/fallback title
  // arrives; ordinary history remains completely idle.
  useEffect(() => {
    if (!hasPendingSessionTitle) return;
    const timer = setInterval(() => reload(true), 2000);
    return () => clearInterval(timer);
  }, [hasPendingSessionTitle, reload]);
  const remove = useCallback(async (entry: HistoryListEntry) => {
    if (!canDeleteHistoryEntry(entry)) return false;
    // Invalidate any older list request before applying the optimistic delete.
    ++reloadGenerationRef.current;
    const deletionKey = `${entry.kind}:${entry.id}`;
    deletingRef.current.add(deletionKey);
    const prev = items;
    setItems((list) =>
      list.filter(
        (item) => item.kind !== entry.kind || item.id !== entry.id,
      ),
    );
    const r =
      entry.kind === "session"
        ? await deleteAppSession(
            entry.session.id,
            entry.session.surface === "advanced" ? "advanced" : "app",
          )
        : await deleteTask(entry.task.id);
    deletingRef.current.delete(deletionKey);
    if (!r.ok) {
      setItems(prev);
      setError(r.error || tt("删除失败，请稍后重试。"));
      reload(true);
    } else {
      setError(null);
    }
    return r.ok;
  }, [items, reload, tt]);
  // 轻量字段更新（宗旨 v22：Manus 式任务菜单）：重命名 / 置顶 / 收藏 / 移动项目。
  // task 走 owner RLS；session 走窄 metadata API（ archived snapshot 的 RLS 仍保持不可改）。
  // 两条路径都乐观回填 + 失败回滚，不触碰 conflict-checked 的 snapshot API。
  const mutate = useCallback(
    async (
      entry: HistoryListEntry,
      patch: {
        title?: string;
        pinned?: boolean;
        favorite?: boolean;
        project_id?: string | null;
      },
    ): Promise<boolean> => {
      const table = entry.kind === "session" ? "app_sessions" : "agent_tasks";
      const id = entry.id;
      const prev = items;
      // 乐观：就地改标题/pinned/favorite（record 是 session 或 task）。
      setItems((list) =>
        list.map((it) => {
          if (it.kind !== entry.kind || it.id !== id) return it;
          if (it.kind === "session") {
            return { ...it, session: { ...it.session, ...patch } };
          }
          return { ...it, task: { ...it.task, ...patch } };
        }),
      );
      let mutationError = "";
      if (entry.kind === "session") {
        const result = await updateAppSessionMetadata(
          id,
          patch,
          entry.session.surface === "advanced" ? "advanced" : "app",
        );
        if (!result.ok) mutationError = result.error || "session update failed";
      } else {
        const supabase = browserClient();
        if (!supabase) mutationError = "supabase unavailable";
        else {
          const { error: err } = await supabase
            .from(table)
            .update(patch)
            .eq("id", id);
          if (err) mutationError = err.message;
        }
      }
      if (mutationError) {
        setItems(prev);
        setError(tt("操作失败，请稍后重试。"));
        return false;
      }
      setError(null);
      return true;
    },
    [items, tt],
  );
  return { items, loading, error, remove, mutate, reload };
}

// ----------------------------------------------------------------------------
// 主侧栏内联区：我的任务列表（可删除）。v5 起不再覆盖主导航。
// ----------------------------------------------------------------------------
export function HistorySubNav({ siteId, accent = "#0ea5e9" }: { siteId?: string; accent?: string }) {
  const tt = useUI();
  const { items, loading, error, remove, mutate } = useHistory(siteId);
  const [sel, setSel] = useWorkspaceSelection("history");
  const pathname = usePathname() || "";
  const router = useRouter();
  const [pending, setPending] = useState<HistoryListEntry | null>(null);
  // 宗旨 v22：Manus 式任务菜单 —— 打开菜单的条目 id、正在重命名的条目 id + 草稿标题。
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renameFor, setRenameFor] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [moveTarget, setMoveTarget] = useState<HistoryListEntry | null>(null);

  // 置顶的排在前面（稳定：仅把 pinned 提到前，保持原有时间序）。
  const orderedItems = useMemo(() => {
    const pinnedOf = (e: HistoryListEntry) =>
      e.kind === "session" ? Boolean(e.session.pinned) : Boolean(e.task.pinned);
    return [...items].sort((a, b) => Number(pinnedOf(b)) - Number(pinnedOf(a)));
  }, [items]);

  // URL 是任务选择的单一事实源。动态 session path 可刷新/复制；legacy task 暂以 query
  // 保留，因为它没有足够 app/snapshot 身份，不能伪装成完整 workspace。
  useEffect(() => {
    const pathSession = historySessionIdFromPath(pathname);
    if (pathSession) {
      setSel(pathSession);
      return;
    }
    if (!pathname.split("/").filter(Boolean).includes("history")) {
      setSel(null);
      return;
    }
    const taskId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("task")
        : "";
    setSel(taskId || null);
  }, [pathname, setSel]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncLegacySelection = () => {
      if (historySessionIdFromPath(window.location.pathname)) return;
      if (
        !window.location.pathname.split("/").filter(Boolean).includes("history")
      ) {
        return;
      }
      setSel(new URLSearchParams(window.location.search).get("task") || null);
    };
    window.addEventListener("popstate", syncLegacySelection);
    return () => window.removeEventListener("popstate", syncLegacySelection);
  }, [setSel]);

  // 模型选择已移到主区右上角（HistoryDetail），侧栏子栏只列任务本身。
  return (
    <div className="space-y-0.5">
      {error && <p className="px-3 py-2 text-[12px] text-neutral-400">{tt(error)}</p>}
      {!error && loading && <p className="px-3 py-2 text-[12px] text-neutral-400">{tt("加载…")}</p>}
      {!error && !loading && items.length === 0 && (
        <p className="px-3 py-2 text-[12px] text-neutral-400">{tt("还没有任务。")}</p>
      )}
      {orderedItems.map((entry) => {
        const isSession = entry.kind === "session";
        const record = isSession ? entry.session : entry.task;
        const on = entry.id === sel;
        const title =
          record.title ||
          (isSession ? entry.session.app_id : "") ||
          tt("未命名任务");
        const timestamp = isSession
          ? entry.session.last_activity_at
          : entry.task.created_at;
        const recordSite = record.site_id;
        const cost = isSession ? "" : fmtCost(entry.task);
        const pinned = isSession
          ? Boolean(entry.session.pinned)
          : Boolean(entry.task.pinned);
        const favorite = isSession
          ? Boolean(entry.session.favorite)
          : Boolean(entry.task.favorite);
        const renaming = renameFor === entry.id;
        return (
          <div
            key={`${entry.kind}:${entry.id}`}
            className={`group relative flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition ${
              on ? "text-white" : "text-neutral-700 hover:bg-neutral-200/50"
            }`}
            style={on ? { background: accent } : undefined}
          >
            {renaming ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  const next = renameDraft.trim();
                  setRenameFor(null);
                  if (next && next !== title) void mutate(entry, { title: next });
                }}
              >
                <input
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => {
                    const next = renameDraft.trim();
                    setRenameFor(null);
                    if (next && next !== title) void mutate(entry, { title: next });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setRenameFor(null);
                  }}
                  className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-0.5 text-[13px] text-neutral-800 outline-none focus:border-neutral-500"
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSel(entry.id);
                  router.push(historyHrefFor(entry));
                }}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-white/80" : STATUS_DOT[record.status] || "bg-stone-400"}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    {pinned && (
                      <svg className={`h-3 w-3 shrink-0 ${on ? "text-white/80" : "text-amber-500"}`} viewBox="0 0 24 24" fill="currentColor" aria-label={tt("已置顶")}>
                        <path d="M14 4l6 6-3 1-4 4-1 5-3-3-4 4-1-1 4-4-3-3 5-1 4-4 1-3z" />
                      </svg>
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
                    {favorite && (
                      <svg className={`h-3 w-3 shrink-0 ${on ? "fill-white/80 text-white/80" : "fill-yellow-500 text-yellow-500"}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-label={tt("已收藏")}>
                        <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {!isSession && (
                      <span className={`shrink-0 rounded px-1 py-px text-[9px] ${on ? "bg-white/15 text-white/70" : "bg-stone-100 text-stone-400"}`}>
                        {tt("旧")}
                      </span>
                    )}
                  </span>
                  <span className={`block truncate text-[11px] ${on ? "text-white/70" : "text-neutral-400"}`}>
                    {fmt(timestamp)}
                    {!siteId && recordSite ? ` · ${recordSite}` : ""}
                    {isSession && entry.session.app_id ? ` · ${entry.session.app_id}` : ""}
                    {cost ? ` · ${cost}` : ""}
                  </span>
                </span>
              </button>
            )}
            {/* 宗旨 v22：Manus 式「⋯」菜单（新标签打开 / 重命名 / 置顶 / 收藏 / 删除）。 */}
            {!renaming && (
              <HistoryRowMenu
                open={menuFor === entry.id}
                onOpenChange={(v) => setMenuFor(v ? entry.id : null)}
                active={on}
                pinned={pinned}
                favorite={favorite}
                canDelete={canDeleteHistoryEntry(entry)}
                href={historyHrefFor(entry)}
                onRename={() => {
                  setRenameDraft(title);
                  setRenameFor(entry.id);
                  setMenuFor(null);
                }}
                onTogglePin={() => {
                  void mutate(entry, { pinned: !pinned });
                  setMenuFor(null);
                }}
                onToggleFavorite={() => {
                  void mutate(entry, { favorite: !favorite });
                  setMenuFor(null);
                }}
                onMove={() => {
                  setMoveTarget(entry);
                  setMenuFor(null);
                }}
                onDelete={() => {
                  setPending(entry);
                  setMenuFor(null);
                }}
              />
            )}
          </div>
        );
      })}

      {pending && (
        <ConfirmDialog
          title={tt("删除任务")}
          body={tt("确定删除「{title}」？该会话的消息与产出将一并删除，不可恢复。", {
            title:
              pending.kind === "task"
                ? pending.task.title || tt("未命名任务")
                : pending.session.title || pending.session.app_id,
          })}
          confirmLabel={tt("删除")}
          danger
          onConfirm={() => {
            const target = pending;
            setPending(null);
            void remove(target).then((removed) => {
              if (removed && target.id === sel) {
                setSel(null);
                router.replace("/history");
              }
            });
          }}
          onCancel={() => setPending(null)}
        />
      )}
      {moveTarget && (
        <MoveTaskProjectDialog
          title={
            moveTarget.kind === "session"
              ? moveTarget.session.title || moveTarget.session.app_id
              : moveTarget.task.title || tt("未命名任务")
          }
          currentProjectId={
            moveTarget.kind === "session"
              ? moveTarget.session.project_id
              : moveTarget.task.project_id
          }
          onSelect={(projectId) => {
            const target = moveTarget;
            setMoveTarget(null);
            void mutate(target, { project_id: projectId });
          }}
          onClose={() => setMoveTarget(null)}
        />
      )}
    </div>
  );
}

/** v5 语义名；HistorySubNav 保留为向后兼容别名。 */
export const HistoryInlineList = HistorySubNav;

// ----------------------------------------------------------------------------
// 主区详情：完整 session → 站点真实 workspace runtime；旧 task → 明确降级 AgentChat
// ----------------------------------------------------------------------------
export type HistoryWorkspaceRenderer = (
  session: RestorableAppSession,
) => ReactNode;

export interface HistoryDetailProps {
  siteId?: string;
  accent?: string;
  /** site_id → app 展示名（回看时在 agent 界面显示「所属 app」）。 */
  appNames?: Record<string, string>;
  /**
   * 关键修（doctrine 2026-07-09，操作员截图 f4d54ac9）：从历史记录回看某 app 的会话时，
   * 右栏必须是该 app 的完整固定五槽位，而不是一个空泛的「库」。
   * 站点把自己 live 操作台用的同一份 libraryTabs 传进来 → 回看即复用同一套库板块。
   * 不传 → 退化为通用单 artifact 右版面（向后兼容，如主站 hub 混合历史）。 */
  libraryTabs?: AgentLibraryTabs;
  /** 站点自定义「预览」渲染器（同 live 操作台的 renderArtifact）——让回看的成稿/
   *  图片/PPT 用与生成时一致的富样式，而不是纯 markdown 兜底。 */
  renderArtifact?: (artifact: ArtifactMeta, content: string) => ReactNode;
  /**
   * 完整工作会话渲染器。站点必须返回自己 live `/workspace/<appId>` 使用的同一个 runtime
   * （同一批 Provider、SiteCatalogConsole、renderOps、renderCanvas），共享包不仿写操作台。
   * 本组件会在外层注入该 session 的 WorkspaceSessionProvider。
   */
  renderWorkspace?: HistoryWorkspaceRenderer;
}

type LoadedHistoryDetail =
  | { kind: "session"; session: AppSession; fallbackTask?: TaskDetail }
  | { kind: "task"; detail: TaskDetail };

export function HistoryDetail({
  siteId = "",
  accent = "#0ea5e9",
  appNames,
  libraryTabs,
  renderArtifact,
  renderWorkspace,
}: HistoryDetailProps) {
  const tt = useUI();
  const [selected, setSelected] = useWorkspaceSelection("history");
  const router = useRouter();
  const detailPathname = usePathname() || "";
  // 动态路由本身必须足以恢复详情：刷新 `/history/<sessionId>` 时不能依赖侧栏 effect
  // 先把 id 抄进跨树 selection context。
  const sel =
    historySessionIdFromPath(detailPathname) || selected;
  const [loaded, setLoaded] = useState<LoadedHistoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // 新后端优先按 app_session 读取；404/旧后端再把同一个 id 当 legacy task 读取。
  useEffect(() => {
    let alive = true;
    setLoaded(null);
    setDetailError(null);
    if (!sel) {
      setDetailLoading(false);
      return () => {
        alive = false;
      };
    }
    setDetailLoading(true);
    void (async () => {
      let sessionResult = await getAppSession(sel);
      if (!sessionResult.ok && sessionResult.status === 404) {
        const advancedResult = await getAppSession(sel, "advanced");
        sessionResult = advancedResult;
      }
      if (!alive) return;
      if (sessionResult.ok && sessionResult.data) {
        const session = sessionResult.data;
        if (siteId && session.site_id !== siteId) {
          setDetailLoading(false);
          setDetailError(tt("这条工作会话不属于当前网站。"));
          return;
        }
        let fallbackTask: TaskDetail | undefined;
        if (!isRestorableAppSession(session)) {
          // 迁移期可能已有 session 聚合行但 snapshot 不完整；找它关联的旧 task 继续回放，
          // 不因侧栏去重而把原对话藏掉。
          const tasksResult = await listTasks(
            100,
            session.site_id,
            false,
            session.surface === "advanced" ? "advanced" : "app",
          );
          const linked = tasksResult.data?.items.find(
            (task) => task.session_id === session.id,
          );
          if (linked) {
            const linkedResult = await getTask(linked.id);
            if (linkedResult.ok) fallbackTask = linkedResult.data;
          }
          if (!alive) return;
        }
        setLoaded({ kind: "session", session, fallbackTask });
        setDetailLoading(false);
        return;
      }
      if (!isAppSessionApiUnavailableStatus(sessionResult.status)) {
        setDetailLoading(false);
        setDetailError(
          sessionResult.status === 401
            ? tt("登录后即可查看我的任务。")
            : sessionResult.error || tt("加载失败"),
        );
        return;
      }
      const taskResult = await getTask(sel);
      if (!alive) return;
      setDetailLoading(false);
      if (taskResult.ok && taskResult.data) {
        if (
          siteId &&
          taskResult.data.task.site_id &&
          taskResult.data.task.site_id !== siteId
        ) {
          setDetailError(tt("这条旧记录不属于当前网站。"));
          return;
        }
        setLoaded({ kind: "task", detail: taskResult.data });
        return;
      }
      const signedOut =
        sessionResult.status === 401 || taskResult.status === 401;
      setDetailError(
        signedOut
          ? tt("登录后即可查看我的任务。")
          : taskResult.error || sessionResult.error || tt("加载失败"),
      );
    })();
    return () => {
      alive = false;
    };
  }, [router, sel, siteId, tt]);

  // 仅用于 legacy task / 不完整 session 的明确降级。完整 session 的右栏完全由站点 runtime
  // 提供，不再用 AgentChat 的通用 libraryTabs 模拟。
  const effectiveLibraryTabs: AgentLibraryTabs | undefined =
    libraryTabs ??
    (siteId ? { showFiles: true, showBrowser: true } : undefined);
  if (!sel) {
    return (
      <div className="flex h-[calc(100dvh-1px)] flex-col">
        <div className="grid flex-1 place-items-center p-8 text-center text-[13px] text-neutral-400">
          {tt("在左侧选择一个任务，即可继续操作或查看对话与产出。")}
        </div>
      </div>
    );
  }

  if (detailLoading) {
    return (
      <div className="flex h-[calc(100dvh-1px)] flex-col">
        <div className="grid flex-1 place-items-center text-[13px] text-neutral-400">
          {tt("加载工作会话…")}
        </div>
      </div>
    );
  }

  if (detailError || !loaded) {
    return (
      <div className="flex h-[calc(100dvh-1px)] flex-col">
        <div className="grid flex-1 place-items-center p-8 text-center text-[13px] text-rose-500">
          {detailError || tt("这个任务不存在或已无权访问。")}
        </div>
      </div>
    );
  }

  const runtimeSession =
    loaded.kind === "session"
      ? withLinkedAgentTask(
          loaded.session,
          loaded.fallbackTask?.task.id,
        )
      : null;
  if (runtimeSession && isRestorableAppSession(runtimeSession)) {
    const currentSession = runtimeSession;
    if (!renderWorkspace) {
      return (
        <div className="grid h-[calc(100dvh-1px)] place-items-center bg-stone-50/60 p-8">
          <div className="w-full max-w-xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
            <p className="text-[15px] font-semibold text-stone-900">
              {tt("该工作会话可恢复，但站点尚未接入完整工作台渲染器。")}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-stone-500">
              {tt("请在 HistoryDetail 传入 renderWorkspace(session)，复用本站实时 workspace runtime；共享包不会用通用聊天界面伪装当时的操作台。")}
            </p>
            <p className="mt-3 rounded-lg bg-stone-50 px-3 py-2 font-mono text-[11px] text-stone-500">
              {currentSession.site_id} / {currentSession.app_id} · {currentSession.id}
            </p>
          </div>
        </div>
      );
    }
    return (
      <WorkspaceSessionProvider
        key={currentSession.id}
        siteId={currentSession.site_id}
        appId={currentSession.app_id}
        sessionId={currentSession.id}
        initialSession={currentSession}
        mode="history"
        resumeLatest={false}
      >
        {renderWorkspace(currentSession)}
      </WorkspaceSessionProvider>
    );
  }

  const fallbackTaskId =
    loaded.kind === "task"
      ? loaded.detail.task.id
      : loaded.fallbackTask?.task.id || loaded.session.task_id || "";
  const fallbackSiteId =
    loaded.kind === "task"
      ? loaded.detail.task.site_id || siteId
      : loaded.session.site_id || siteId;
  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <div className="min-h-0 flex-1">
        {fallbackTaskId ? (
          <AgentChat
            key={fallbackTaskId}
            siteId={fallbackSiteId}
            taskId={fallbackTaskId}
            accent={accent}
            headerHeight={41}
            appNames={appNames}
            libraryTabs={effectiveLibraryTabs}
            renderArtifact={renderArtifact}
            onTaskCreated={(nextTaskId, nextSessionId) => {
              const nextSelection = nextSessionId || nextTaskId;
              setSelected(nextSelection);
              router.replace(
                nextSessionId
                  ? historySessionHref(nextSessionId)
                  : `/history?task=${encodeURIComponent(nextTaskId)}`,
              );
            }}
          />
        ) : (
          <div className="grid h-full place-items-center p-8 text-center text-[13px] text-neutral-400">
            {tt("这条记录没有可继续的对话。")}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 「待处理」master-detail —— 已下线（操作员 2026-07-01）
// ----------------------------------------------------------------------------
// 主站不再有独立的「待处理」页面 / 功能：所有会话（进行中 / 已完成）统一进「我的
// 任务」（HistorySubNav 默认不带 pending，列全部会话；进行中的会话在左栏用状态点
// 体现，主区回看时轮询刷新）。PendingSubNav / PendingDetail 已删除，导出同步移除。
// ============================================================================
