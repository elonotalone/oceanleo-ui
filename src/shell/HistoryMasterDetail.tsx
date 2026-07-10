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

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AgentChat, type AgentLibraryTabs } from "./AgentChat";
import { ModelPicker } from "./ModelPicker";
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
  type AppSession,
} from "../lib/app-session";
import { ConfirmDialog } from "../ui";
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

export type { RestorableAppSession } from "./history-model";

/** 任务花费 → 「¥x.xx」展示（精确口径）。0 / 无花费返回空串。 */
function fmtCost(t: AgentTask): string {
  const y = taskCostYuan(t);
  return y > 0 ? `¥${y.toFixed(2)}` : "";
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
        x.session.last_activity_at !== y.session.last_activity_at
      ) {
        return false;
      }
    } else if (x.kind === "task" && y.kind === "task") {
      if (
        x.task.status !== y.task.status ||
        x.task.title !== y.task.title ||
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
  // silent=true（轮询刷新）：不进「加载…」态、列表不变时不替换数组引用——杜绝左栏
  // 每 8s 抽动 + 闪「加载…」。silent=false（首屏 / 站点切换）才显示首次加载骨架。
  const reload = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    void Promise.all([
      listAppSessions({
        limit: 100,
        siteId,
        status: "archived",
        includeArchived: true,
      }),
      listTasks(100, siteId, pending),
    ]).then(([sessionsResult, tasksResult]) => {
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
      });
      setItems((prev) => (sameHistory(prev, next) ? prev : next));
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
    const prev = items;
    setItems((list) =>
      list.filter(
        (item) => item.kind !== entry.kind || item.id !== entry.id,
      ),
    );
    const r =
      entry.kind === "session"
        ? await deleteAppSession(entry.session.id)
        : await deleteTask(entry.task.id);
    if (!r.ok) setItems(prev);
    return r.ok;
  }, [items]);
  return { items, loading, error, remove, reload };
}

// ----------------------------------------------------------------------------
// 侧栏子栏：我的任务列表（可删除）
// ----------------------------------------------------------------------------
export function HistorySubNav({ siteId, accent = "#0ea5e9" }: { siteId?: string; accent?: string }) {
  const tt = useUI();
  const { items, loading, error, remove } = useHistory(siteId);
  const [sel, setSel] = useWorkspaceSelection("history");
  const pathname = usePathname() || "";
  const router = useRouter();
  const [pending, setPending] = useState<HistoryListEntry | null>(null);

  // URL 是任务选择的单一事实源。动态 session path 可刷新/复制；legacy task 暂以 query
  // 保留，因为它没有足够 app/snapshot 身份，不能伪装成完整 workspace。
  useEffect(() => {
    const pathSession = historySessionIdFromPath(pathname);
    if (pathSession) {
      setSel(pathSession);
      return;
    }
    if (!pathname.split("/").filter(Boolean).includes("history")) return;
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
      {items.map((entry) => {
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
        return (
          <div
            key={`${entry.kind}:${entry.id}`}
            className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition ${
              on ? "text-white" : "text-neutral-700 hover:bg-neutral-200/50"
            }`}
            style={on ? { background: accent } : undefined}
          >
            <button
              type="button"
              onClick={() => {
                setSel(entry.id);
                if (entry.kind === "session") {
                  router.push(historySessionHref(entry.id));
                } else {
                  router.push(`/history?task=${encodeURIComponent(entry.id)}`);
                }
              }}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? "bg-white/80" : STATUS_DOT[record.status] || "bg-stone-400"}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
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
            {canDeleteHistoryEntry(entry) && (
              <button
                type="button"
                onClick={() => setPending(entry)}
                title={tt("永久删除这个任务")}
                aria-label={tt("删除")}
                className={`shrink-0 rounded p-0.5 transition ${
                  on
                    ? "text-white/70 hover:bg-white/20 hover:text-white"
                    : "text-neutral-300 hover:bg-rose-50 hover:text-rose-500"
                }`}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m1 0v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 11v6M14 11v6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
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
    </div>
  );
}

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
   * 右栏必须是【该 app 完整的库】（生成结果 / 素材库 / 文件库），而不是一个空泛的「库」。
   * 站点把自己 live 操作台用的同一份 libraryTabs 传进来 → 回看即复用同一套库板块。
   * 不传 → 退化为通用单 artifact 右版面（向后兼容，如主站 hub 混合历史）。 */
  libraryTabs?: AgentLibraryTabs;
  /** 站点自定义「生成结果」渲染器（同 live 操作台的 renderArtifact）——让回看的成稿/
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

function legacyTaskCompleteness(detail: TaskDetail): {
  hasAppId: boolean;
  hasSnapshot: boolean;
} {
  const firstUser = detail.messages.find((message) => message.role === "user");
  const meta = firstUser?.meta;
  const hasAppId = Boolean(
    detail.task.app_id ||
      (typeof meta?.app_id === "string" && meta.app_id),
  );
  const snapshot = meta?.snapshot ?? meta?.ops_state;
  const hasSnapshot =
    snapshot !== undefined &&
    snapshot !== null &&
    typeof snapshot === "object" &&
    !Array.isArray(snapshot);
  return { hasAppId, hasSnapshot };
}

export function HistoryDetail({
  siteId = "",
  accent = "#0ea5e9",
  appNames,
  libraryTabs,
  renderArtifact,
  renderWorkspace,
}: HistoryDetailProps) {
  const tt = useUI();
  const [selected] = useWorkspaceSelection("history");
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
      const sessionResult = await getAppSession(sel);
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
          const tasksResult = await listTasks(100, session.site_id);
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
  }, [sel, siteId, tt]);

  // 仅用于 legacy task / 不完整 session 的明确降级。完整 session 的右栏完全由站点 runtime
  // 提供，不再用 AgentChat 的通用 libraryTabs 模拟。
  const effectiveLibraryTabs: AgentLibraryTabs | undefined =
    libraryTabs ?? (siteId ? { showFiles: true } : undefined);
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
          {tt("在左侧选择一个任务，即可继续操作或查看对话与产出。")}
        </div>
      </div>
    );
  }

  if (detailLoading) {
    return (
      <div className="flex h-[calc(100dvh-1px)] flex-col">
        {modelBar}
        <div className="grid flex-1 place-items-center text-[13px] text-neutral-400">
          {tt("加载工作会话…")}
        </div>
      </div>
    );
  }

  if (detailError || !loaded) {
    return (
      <div className="flex h-[calc(100dvh-1px)] flex-col">
        {modelBar}
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
  const incomplete =
    loaded.kind === "task"
      ? legacyTaskCompleteness(loaded.detail)
      : {
          hasAppId: Boolean(loaded.session.app_id),
          hasSnapshot: Boolean(loaded.session.snapshot),
        };
  const exactLegacyWarning =
    !incomplete.hasAppId || !incomplete.hasSnapshot;

  return (
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      {modelBar}
      <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-800">
        <span className="font-semibold">
          {exactLegacyWarning
            ? tt("旧记录信息不完整，无法恢复当时操作台")
            : tt("旧记录尚未迁移为完整工作会话")}
        </span>
        <span className="ml-1 text-amber-700">
          {fallbackTaskId
            ? tt("这是缺少完整工作台快照的旧任务，仅回放原 Agent 对话与产出。")
            : tt("该记录也没有可回放的 Agent task。")}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        {fallbackTaskId ? (
          <AgentChat
            key={fallbackTaskId}
            siteId={fallbackSiteId}
            taskId={fallbackTaskId}
            readOnly
            agentModel={agentModel}
            accent={accent}
            headerHeight={93}
            appNames={appNames}
            libraryTabs={effectiveLibraryTabs}
            renderArtifact={renderArtifact}
          />
        ) : (
          <div className="grid h-full place-items-center p-8 text-center text-[13px] text-neutral-400">
            {tt("无法恢复或回放这条旧记录。")}
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
