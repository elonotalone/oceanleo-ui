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

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AgentChat, type AgentLibraryTabs } from "./AgentChat";
import { useWorkspaceSelection } from "./WorkspaceSelection";
import {
  listTasks,
  deleteTask,
  getTask,
  type AgentMessage,
  type ArtifactMeta,
  type TaskDetail,
} from "../lib/agent";
import { taskRequestFailureText } from "../lib/local-agent-task";
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
import { setCacheUser } from "../lib/user-scoped-cache";
import {
  prefetchHistoryOpen,
  readHistorySession,
  readTaskDetail,
  openTaskFirstPage,
  rememberHistorySession,
  takeAppSessionPrefetch,
  type HistoryOpenHint,
} from "./task-open-cache";
import { useUI } from "../i18n/ui/useUI";
import { WorkspaceSessionProvider } from "./WorkspaceSession";
import { LibraryTaskHistoryWorkspace } from "./library-task-history";
import { LocalTaskDetail, LocalTaskRows, useLocalTasks } from "./LocalWorkspace";
import { ShellTaskView } from "./cloud-computer/ShellTaskView";
import { SessionRunningIcon } from "./cloud-computer/agent-dialog/SessionRunningIcon";
import {
  knownComputerTaskSessions,
  latestComputerTaskSession,
  listComputerTaskSessions,
} from "../lib/computer-task-api";
import { TaskLoadingGate } from "./task-loading-gate";
import {
  historyDetailCacheKey,
  peekHistoryDetail,
  storeHistoryDetail,
} from "./history-detail-cache";
import {
  bumpHistoryEntries,
  canDeleteHistoryEntry,
  HISTORY_WORKING_POLL_MS,
  historyEntryTimestamp,
  historyPollDelayMs,
  isHistoryEntryWorking,
  isRestorableAppSession,
  isShellTask,
  isTaskThreadSession,
  mergeHistoryEntries,
  shellSessionFromTask,
  withLinkedAgentTask,
  type HistoryEntryActivity,
  type HistoryListEntry,
  type RestorableAppSession,
} from "./history-model";
import { portalHref } from "../contracts/domain-family";
import {
  historySessionHref,
  historySessionIdFromPath,
  withFusionMountPrefix,
} from "./workspace-route";
import {
  HISTORY_ACTIVITY_EVENT,
  HISTORY_CHANGED_EVENT,
  type HistoryActivityDetail,
} from "../lib/history-events";
import {
  HistoryRowMenu,
  MoveTaskProjectDialog,
} from "./HistoryRowActions";
import { HistoryRowFrame } from "./HistoryRowBubble";

export type { RestorableAppSession } from "./history-model";

/** 侧栏行上的项目标注（合同 §3.7 / D11）。 */
interface HistoryProjectBadge {
  id: string;
  /** 网关降级（`project: null`）或旧网关不带时为空串，界面用通用字样兜底。 */
  name: string;
  icon: string | null;
}

/**
 * 条目所属项目的标注；不属于项目返回 null。只信同一条记录上的 `project_id`，
 * `project` 对不上 id（脏数据 / 乐观更新残留）时只保留 id，不显示错的名字。
 */
function historyEntryProject(entry: HistoryListEntry): HistoryProjectBadge | null {
  const record = entry.kind === "session" ? entry.session : entry.task;
  const projectId = String(record.project_id || "").trim();
  if (!projectId) return null;
  const project =
    record.project && record.project.id === projectId ? record.project : null;
  return {
    id: projectId,
    name: String(project?.name || "").trim(),
    icon: String(project?.icon || "").trim() || null,
  };
}

/** 项目工作空间的门户路径；跨站时 `portalHref` 补门户 origin。 */
function historyProjectHref(projectId: string): string {
  return portalHref(`/projects/${encodeURIComponent(projectId)}`);
}

function historyHrefFor(entry: HistoryListEntry, pathname = ""): string {
  return entry.kind === "session"
    ? historySessionHref(entry.id, undefined, pathname)
    : withFusionMountPrefix(
        `/history?task=${encodeURIComponent(entry.id)}`,
        pathname,
      );
}

/** What a row carries for the prefetch: task id, mode, and its last known computer conversation. */
function historyOpenHint(entry: HistoryListEntry): HistoryOpenHint {
  if (entry.kind === "session") {
    return { kind: "session", id: entry.id, taskId: entry.session.task_id || null };
  }
  const taskId = entry.task.id;
  const mode = String(entry.task.mode || "");
  const sessions = mode === "computer" ? knownComputerTaskSessions(taskId) : null;
  return { kind: "task", id: taskId, taskId, mode, computerSessionId: latestComputerTaskSession(sessions ?? [])?.id ?? null };
}

/** HistoryDetail instances mounted now: a row click switches them in place (no page load). */
let mountedHistoryDetails = 0;

/**
 * Open a history href. While a HistoryDetail is mounted on this page the switch
 * is client-only (2026-10-31 task switch speed): the History API moves the URL
 * (Next's app router syncs usePathname / back-forward with it, no server
 * render), the shared selection moves the detail. Elsewhere it is a navigation.
 */
function openHistoryHref(href: string, push: (href: string) => void): void {
  if (
    mountedHistoryDetails > 0 &&
    typeof window !== "undefined" &&
    href.startsWith("/") &&
    !href.startsWith("//")
  ) {
    const next = new URL(href, window.location.href);
    if (next.origin === window.location.origin) {
      if (next.pathname + next.search !== window.location.pathname + window.location.search) {
        window.history.pushState(null, "", next.pathname + next.search + next.hash);
      }
      return;
    }
  }
  push(href);
}

type HistoryPublishItem = {
  kind: string;
  title: string;
  url: string;
  sourceRef: string;
};

function pushHistoryPublishItem(
  into: HistoryPublishItem[],
  seen: Set<string>,
  kind: string,
  title: string,
  url: string,
  sourceRef: string,
) {
  const key = sourceRef || url || title;
  if (!key || seen.has(key)) return;
  seen.add(key);
  into.push({ kind, title, url, sourceRef });
}

function historyPublishItems(detail?: TaskDetail): HistoryPublishItem[] {
  const into: HistoryPublishItem[] = [];
  const seen = new Set<string>();
  if (!detail) return into;
  for (const artifact of detail.artifacts || []) {
    pushHistoryPublishItem(
      into,
      seen,
      artifact.kind || "",
      artifact.title || "",
      artifact.url || "",
      artifact.id,
    );
  }
  for (const message of detail.messages || []) {
    const artifact = (message as AgentMessage).meta?.artifact;
    if (!artifact) continue;
    pushHistoryPublishItem(
      into,
      seen,
      artifact.type || "",
      artifact.title || "",
      artifact.url || "",
      artifact.id || String(message.id),
    );
  }
  return into;
}

function HistoryArtifactPublishRows({ items }: { items: HistoryPublishItem[] }) {
  const [Button, setButton] = useState<
    ((props: { kind: string; title: string; url: string; sourceRef?: string }) => ReactNode) | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void import("./PublishToOrgButton").then((mod) => {
      if (!cancelled) setButton(() => mod.PublishToOrgButton);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items.length) return null;
  return (
    <ul
      className="shrink-0 space-y-1 border-b border-neutral-100 px-3 py-2"
      data-history-artifact-publish="1"
    >
      {items.map((item) => (
        <li
          key={item.sourceRef || item.url || item.title}
          className="flex items-center justify-between gap-2"
          data-history-artifact-row={item.sourceRef || item.url}
        >
          <span className="min-w-0 truncate text-[12px] text-neutral-700">
            {item.title || item.kind}
          </span>
          {Button ? (
            <Button
              kind={item.kind}
              title={item.title}
              url={item.url}
              sourceRef={item.sourceRef}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** 两个任务列表是否「实质相同」——避免静默刷新时整列抽动。 */
function sameHistory(a: HistoryListEntry[], b: HistoryListEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.kind !== y.kind || x.id !== y.id) return false;
    if ((x.created_by ?? null) !== (y.created_by ?? null)) return false;
    if (isHistoryEntryWorking(x) !== isHistoryEntryWorking(y)) return false;
    if (
      (x.activity_at ?? null) !== (y.activity_at ?? null) ||
      (x.user_activity_at ?? null) !== (y.user_activity_at ?? null)
    ) {
      return false;
    }
    const xProject = historyEntryProject(x);
    const yProject = historyEntryProject(y);
    if (
      (xProject?.name ?? null) !== (yProject?.name ?? null) ||
      (xProject?.icon ?? null) !== (yProject?.icon ?? null)
    ) {
      return false;
    }
    if (x.kind === "session" && y.kind === "session") {
      if (
        x.session.revision !== y.session.revision ||
        x.session.status !== y.session.status ||
        x.session.title !== y.session.title ||
        x.session.title_status !== y.session.title_status ||
        x.session.last_activity_at !== y.session.last_activity_at ||
        (x.session.created_by ?? null) !== (y.session.created_by ?? null) ||
        Boolean(x.session.pinned) !== Boolean(y.session.pinned) ||
        Boolean(x.session.favorite) !== Boolean(y.session.favorite) ||
        (x.session.project_id ?? null) !== (y.session.project_id ?? null)
      ) {
        return false;
      }
    } else if (x.kind === "task" && y.kind === "task") {
      if (
        x.task.status !== y.task.status ||
        (x.task.computer_run_status ?? null) !== (y.task.computer_run_status ?? null) ||
        (x.task.last_activity_at ?? null) !== (y.task.last_activity_at ?? null) ||
        x.task.title !== y.task.title ||
        (x.task.created_by ?? null) !== (y.task.created_by ?? null) ||
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

/**
 * 上一次成功拉到的列表，按站点缓存在模块里。左栏（`HistoryInlineList`）会因为
 * 侧栏收成 rail、布局重挂等原因重新 mount；重挂时先拿这份继续显示，再静默刷新，
 * 用户就不会看到列表被「加载…」清空一下又回来。
 */
const historyListCache = new Map<string, HistoryListEntry[]>();

/**
 * Conversation activity this page saw before the gateway list caught up
 * (`HISTORY_ACTIVITY_EVENT`, keyed by task id and session id). Applied on every
 * merge so a refresh cannot drop a just-bumped row back down; entries expire
 * once the gateway's own `last_activity_at` (≤15s throttle) has had time to land.
 */
const LOCAL_ACTIVITY_TTL_MS = 120_000;
const localHistoryActivity = new Map<string, HistoryEntryActivity & { seen: number }>();
/** task id → bound session id from the last task list, so a task-only event can bump its session row. */
const historyTaskSession = new Map<string, string>();

function liveLocalActivity(): ReadonlyMap<string, HistoryEntryActivity> {
  const cutoff = Date.now() - LOCAL_ACTIVITY_TTL_MS;
  for (const [key, value] of localHistoryActivity) {
    if (value.seen < cutoff) localHistoryActivity.delete(key);
  }
  return localHistoryActivity;
}

function noteLocalActivity(key: string | undefined, detail: HistoryActivityDetail): void {
  if (!key) return;
  const prev = localHistoryActivity.get(key);
  localHistoryActivity.set(key, {
    at: detail.at,
    userAt: detail.user ? detail.at : prev?.userAt,
    seen: Date.now(),
  });
}

function historyCacheKey(siteId?: string, pending = false): string {
  return `${siteId || ""}|${pending ? "pending" : "all"}`;
}

function useHistory(siteId?: string, pending = false, authMsg?: string) {
  const tt = useUI();
  const authMessage = authMsg ?? tt("登录后即可查看我的任务。");
  const cacheKey = historyCacheKey(siteId, pending);
  const [items, setItems] = useState<HistoryListEntry[]>(
    () => historyListCache.get(cacheKey) ?? [],
  );
  // 「加载…」只在这份列表从未拿到过数据时出现。之后无论站点切换、翻译字典换了
  // 引用、事件触发的刷新，都只在后台更新，不再把已有列表换成「加载…」。
  const [loading, setLoading] = useState(
    () => !historyListCache.has(cacheKey),
  );
  const loadedOnceRef = useRef(historyListCache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);
  // Why the last delete was refused. Kept apart from `error`: the silent reload
  // that follows a refusal succeeds and clears `error`, which hid the reason.
  const [notice, setNotice] = useState<string | null>(null);
  const reloadGenerationRef = useRef(0);
  const deletingRef = useRef(new Set<string>());
  const pollFailuresRef = useRef(0);
  // 登录提示走 ref：它的引用变化（父级重渲染）不得重建 reload、进而触发首屏式的
  // 非静默重拉。错误文案存中文原文，渲染时再翻（`tt(error)`）。
  const authMessageRef = useRef(authMessage);
  authMessageRef.current = authMessage;
  // silent=true（轮询刷新）：不进「加载…」态、列表不变时不替换数组引用——杜绝左栏
  // 每 8s 抽动 + 闪「加载…」。silent=false（首屏 / 站点切换）只在还没有任何数据时
  // 显示首次加载骨架。
  const reload = useCallback((silent = false) => {
    const generation = ++reloadGenerationRef.current;
    if (!silent && !loadedOnceRef.current) setLoading(true);
    return Promise.all([
      listAppSessions({
        limit: 100,
        siteId,
        includeArchived: true,
        surface: "all",
        // D11（2026-10-24）：「我的任务」也列项目里建的任务，行上带项目标注。
        // 网关列表本来就只返回本人（user_id = 调用者）的记录，项目里别人的任务不会进来。
        projectScope: "all",
      }),
      listTasks(100, siteId, pending, "all", "all"),
    ]).then(([sessionsResult, tasksResult]) => {
      if (generation !== reloadGenerationRef.current) return false;
      const sessions = sessionsResult.ok
        ? sessionsResult.data?.items || []
        : null;
      const tasks = tasksResult.ok ? tasksResult.data?.items || [] : null;
      if (sessions === null && tasks === null) {
        // 静默轮询失败不打断已有列表（只在首次加载时报错）。
        if (!silent) {
          setLoading(false);
          const signedOut =
            sessionsResult.status === 401 || tasksResult.status === 401;
          setError(
            signedOut
              ? authMessageRef.current
              : taskRequestFailureText(sessionsResult.error ? sessionsResult : tasksResult, "加载失败"),
          );
        }
        return false;
      }
      loadedOnceRef.current = true;
      setLoading(false);
      setError(null);
      // session API 尚未部署时 sessions=null → 完整退回旧 task 列表。API 已部署时，
      // session 置顶，并只保留未绑定 session 的旧 task。
      for (const task of tasks || []) {
        if (task.session_id) historyTaskSession.set(task.id, task.session_id);
      }
      const next = mergeHistoryEntries(sessions || [], tasks || [], {
        sessionApiUnavailable:
          !sessionsResult.ok &&
          isAppSessionApiUnavailableStatus(sessionsResult.status),
        localActivity: liveLocalActivity(),
      }).filter(
        (entry) => !deletingRef.current.has(`${entry.kind}:${entry.id}`),
      );
      historyListCache.set(cacheKey, next);
      setItems((prev) => (sameHistory(prev, next) ? prev : next));
      return true;
    });
  }, [cacheKey, siteId, pending]);
  // 乐观删除/重命名后的列表也进缓存，重挂时不会先闪回已删掉的那行。
  const mountedKeyRef = useRef(cacheKey);
  useEffect(() => {
    // 换站点那一轮 items 还是上一站的，不能写进新站点的缓存。
    if (loadedOnceRef.current && mountedKeyRef.current === cacheKey) {
      historyListCache.set(cacheKey, items);
    }
  }, [cacheKey, items]);
  useEffect(() => {
    if (mountedKeyRef.current !== cacheKey) {
      // 真换了站点：换成那个站点的缓存（没有就回到首屏骨架），不沿用上一站的列表。
      mountedKeyRef.current = cacheKey;
      const cached = historyListCache.get(cacheKey);
      loadedOnceRef.current = cached !== undefined;
      setItems(cached ?? []);
      setLoading(cached === undefined);
    }
    void reload(false);
  }, [cacheKey, reload]);
  useEffect(() => {
    const refresh = () => {
      void reload(true);
    };
    window.addEventListener(HISTORY_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(HISTORY_CHANGED_EVENT, refresh);
  }, [reload]);
  // A chat on screen moved (native frame / Leo reply / user send): bump its row
  // right away (throttled at the source). The working mark itself still comes
  // from the list, so a user send also refreshes it; otherwise the working poll
  // (3s) and the regular poll pick up the server's order.
  useEffect(() => {
    const onActivity = (event: Event) => {
      const detail = (event as CustomEvent<HistoryActivityDetail>).detail;
      if (!detail?.at || (!detail.taskId && !detail.sessionId)) return;
      const sessionId =
        detail.sessionId || (detail.taskId ? historyTaskSession.get(detail.taskId) : undefined);
      noteLocalActivity(detail.taskId, detail);
      noteLocalActivity(sessionId, detail);
      setItems((prev) => bumpHistoryEntries(prev, { ...detail, sessionId }));
      if (detail.user) void reload(true);
    };
    window.addEventListener(HISTORY_ACTIVITY_EVENT, onActivity);
    return () => window.removeEventListener(HISTORY_ACTIVITY_EVENT, onActivity);
  }, [reload]);
  // 全部任务静默刷新：active 会话也必须在创建后进入「我的任务」，不能因为当前列表
  // 还没有 active 项就永远不再请求。sameHistory 保证无变化时不替换数组、不闪烁。
  // Consecutive 503/SSL failures back off so the sidebar does not stampede
  // the shared gateway (every plugin site mounts this list).
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        void reload(true).then(
          (ok) => {
            if (cancelled) return;
            pollFailuresRef.current = ok ? 0 : pollFailuresRef.current + 1;
            schedule();
          },
          () => {
            if (cancelled) return;
            pollFailuresRef.current += 1;
            schedule();
          },
        );
      }, historyPollDelayMs(pollFailuresRef.current));
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
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
  // Runs end without a client event: while any row shows the working mark,
  // refresh every few seconds so the mark stops shortly after the run ends.
  const hasWorkingEntry = items.some(isHistoryEntryWorking);
  useEffect(() => {
    if (!hasWorkingEntry) return;
    const timer = setInterval(() => reload(true), HISTORY_WORKING_POLL_MS);
    return () => clearInterval(timer);
  }, [hasWorkingEntry, reload]);
  const remove = useCallback(async (entry: HistoryListEntry) => {
    if (!canDeleteHistoryEntry(entry)) return false;
    // Invalidate any older list request before applying the optimistic delete.
    ++reloadGenerationRef.current;
    const deletionKey = `${entry.kind}:${entry.id}`;
    deletingRef.current.add(deletionKey);
    setNotice(null);
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
      // e.g. 409 local_agent_stop_pending: the computer was asked to stop the task first.
      setNotice(taskRequestFailureText(r, "删除失败，请重试。"));
      reload(true);
    } else {
      setError(null);
    }
    return r.ok;
  }, [items, reload]);
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
      /** 换项目时用于乐观显示的项目标注；只进本地列表，绝不写进数据库。 */
      projectBadge?: HistoryProjectBadge | null,
    ): Promise<boolean> => {
      const table = entry.kind === "session" ? "app_sessions" : "agent_tasks";
      const id = entry.id;
      const prev = items;
      const movesProject = Object.prototype.hasOwnProperty.call(patch, "project_id");
      const local = movesProject
        ? {
            ...patch,
            project: patch.project_id
              ? projectBadge && projectBadge.id === patch.project_id
                ? projectBadge
                : null
              : undefined,
          }
        : patch;
      // 乐观：就地改标题/pinned/favorite/所属项目（record 是 session 或 task）。
      // 项目任务也留在「我的任务」里，换项目只换行上的项目标注。
      setItems((list) =>
        list.map((it) => {
          if (it.kind !== entry.kind || it.id !== id) return it;
          if (it.kind === "session") {
            return { ...it, session: { ...it.session, ...local } };
          }
          return { ...it, task: { ...it.task, ...local } };
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
      // 网关给的项目名才是准的：换项目后静默刷新一次拿回 `project` 标注。
      if (movesProject) void reload(true);
      return true;
    },
    [items, reload, tt],
  );
  return { items, loading, error, notice, remove, mutate, reload };
}

function LeoCreatedMark() {
  const gid = `leo-created-spark-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-3 w-3 shrink-0"
      role="img"
      aria-label="leo"
      data-oceanleo-leo-created=""
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="24" y2="24">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      <path
        d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z"
        fill={`url(#${gid})`}
      />
      <path
        d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z"
        fill={`url(#${gid})`}
        opacity="0.65"
      />
    </svg>
  );
}

/**
 * 行副标题里的项目标注（D11）：项目名（截断）和可选的自选图标。
 * 点标签进项目工作空间；点行其余位置仍打开任务（标签阻止冒泡）。
 */
function HistoryProjectTag({ project }: { project: HistoryProjectBadge }) {
  const tt = useUI();
  const router = useRouter();
  const name = project.name || tt("项目");
  const href = historyProjectHref(project.id);
  return (
    <a
      href={href}
      title={name}
      aria-label={tt("打开项目「{name}」", { name })}
      data-history-project-tag={project.id}
      onClick={(event) => {
        event.stopPropagation();
        if (
          href.startsWith("/") &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          event.button === 0
        ) {
          event.preventDefault();
          router.push(href);
        }
      }}
      className="inline-flex min-w-0 max-w-[45%] shrink items-center gap-0.5 rounded-full bg-neutral-200/70 px-1.5 py-px text-[10.5px] leading-4 text-neutral-600 outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-300/70 hover:text-neutral-800 focus-visible:ring-2 focus-visible:ring-neutral-400"
    >
      {project.icon && project.icon !== "📁" ? (
        <span aria-hidden="true" className="shrink-0">{project.icon}</span>
      ) : null}
      <span className="min-w-0 truncate">{name}</span>
    </a>
  );
}

/** Hover a row this long (pointer resting, not sweeping past) and its reads start. */
const HOVER_PREFETCH_MS = 80;

function useHoverPrefetch() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const start = useCallback((entry: HistoryListEntry) => {
    cancel();
    timer.current = setTimeout(() => {
      timer.current = null;
      prefetchHistoryOpen(historyOpenHint(entry));
    }, HOVER_PREFETCH_MS);
  }, [cancel]);
  useEffect(() => cancel, [cancel]);
  return useMemo(() => ({ start, cancel }), [start, cancel]);
}

// ----------------------------------------------------------------------------
// 主侧栏内联区：我的任务列表（可删除）。v5 起不再覆盖主导航。
// ----------------------------------------------------------------------------
export function HistorySubNav({ siteId, accent = "#0ea5e9" }: { siteId?: string; accent?: string }) {
  const tt = useUI();
  const { items, loading, error, notice, remove, mutate } = useHistory(siteId);
  const local = useLocalTasks();
  const cloudTaskIds = new Set(items.filter((entry) => entry.kind === "task").map((entry) => entry.id));
  // Once a finished local record is synced, keep the ordinary task's title,
  // menu and outputs. Native rows cover live execution and offline records.
  const localTasks = (!siteId || siteId === "oceanleo") ? local.tasks.filter((task) =>
    !task.remoteTaskId || !cloudTaskIds.has(task.remoteTaskId) || task.canCancel || task.stage === "waiting_for_network",
  ) : [];
  const localRemoteIds = new Set(localTasks.map((task) => task.remoteTaskId).filter(Boolean));
  const [sel, setSel] = useWorkspaceSelection("history");
  const pathname = usePathname() || "";
  const router = useRouter();
  const [pending, setPending] = useState<HistoryListEntry | null>(null);
  // 宗旨 v22：Manus 式任务菜单 —— 打开菜单的条目 id、正在重命名的条目 id + 草稿标题。
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renameFor, setRenameFor] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [moveTarget, setMoveTarget] = useState<HistoryListEntry | null>(null);
  const hoverPrefetch = useHoverPrefetch();
  // The caches the rows feed are kept per signed-in user (task-open-cache).
  // A signed-out read never clears them here (the auth-state event does).
  useEffect(() => {
    let alive = true;
    const client = browserClient();
    if (!client) return;
    void client.auth.getSession().then(({ data }) => {
      const id = data.session?.user?.id;
      if (alive && id) setCacheUser(id);
    }, () => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // 置顶的排在前面（稳定：仅把 pinned 提到前，保持原有顺序）。置顶是用户的明确意图，
  // 所以仍压过「工作中优先」：置顶组、普通组内部各自是 mergeHistoryEntries 的顺序——
  // 工作中的在前，其余按最近活动倒序（compareHistoryEntries）。
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
      {notice && <p role="alert" data-history-delete-error className="px-3 py-2 text-[12px] text-rose-600">{tt(notice)}</p>}
      {!error && loading && <p className="px-3 py-2 text-[12px] text-neutral-400">{tt("加载…")}</p>}
      {!error && !loading && items.length === 0 && localTasks.length === 0 && (
        <p className="px-3 py-2 text-[12px] text-neutral-400">{tt("还没有任务。")}</p>
      )}
      {local.error && <p role="status" className="px-3 py-2 text-[12px] text-neutral-400">{tt("无法读取本机任务，请稍后重试。")}</p>}
      <LocalTaskRows tasks={localTasks} selected={sel} accent={accent} />
      {orderedItems.filter((entry) => entry.kind !== "task" || !localRemoteIds.has(entry.id)).map((entry) => {
        const isSession = entry.kind === "session";
        const record = isSession ? entry.session : entry.task;
        const on = entry.id === sel;
        const title =
          record.title ||
          (isSession ? entry.session.app_id : "") ||
          tt("未命名任务");
        const timestamp = historyEntryTimestamp(entry);
        const pinned = isSession
          ? Boolean(entry.session.pinned)
          : Boolean(entry.task.pinned);
        const favorite = isSession
          ? Boolean(entry.session.favorite)
          : Boolean(entry.task.favorite);
        const renaming = renameFor === entry.id;
        const project = historyEntryProject(entry);
        const openEntry = () => {
          // Reads start before anything renders; the switch itself is client-only
          // while the detail is on this page (openHistoryHref).
          prefetchHistoryOpen(historyOpenHint(entry));
          openHistoryHref(historyHrefFor(entry, pathname), router.push);
          setSel(entry.id);
        };
        // 2026-10-31 Manus 式行：只有一行任务名（无时间 / 来源 / 花费副标题），选中 =
        // 与主导航同一档中性灰底，悬停更浅；完整名 + 时间在悬停气泡里（HistoryRowFrame）。
        return (
          <HistoryRowFrame
            key={`${entry.kind}:${entry.id}`}
            title={title}
            timestamp={timestamp}
            disabled={renaming || menuFor === entry.id}
            className={`group relative flex items-center gap-1 rounded-lg px-3 py-2 text-[14px] leading-5 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
              on
                ? "bg-neutral-200/80 text-neutral-900"
                : "text-neutral-800 hover:bg-neutral-200/50 hover:text-neutral-900"
            }`}
          >
            {(describedBy) => (<>
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
              // 整行（除项目标签与 ⋯ 菜单外）点了都打开任务；键盘焦点在标题按钮上，
              // 回车触发的 click 冒泡到这里。标签是独立链接，不嵌在按钮里。
              <div
                onClick={openEntry}
                onPointerEnter={() => hoverPrefetch.start(entry)}
                onPointerLeave={hoverPrefetch.cancel}
                onPointerDown={() => prefetchHistoryOpen(historyOpenHint(entry))}
                onFocus={() => prefetchHistoryOpen(historyOpenHint(entry))}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                data-history-row={entry.id}
              >
                {/* Two states only: working → the walker (same mark as the computer
                    conversation list); otherwise an empty slot so titles stay aligned.
                    The slot is as wide as a nav icon, so task names line up with the
                    nav labels above (no indent line). */}
                <span className="inline-flex w-4 shrink-0 justify-center" data-history-working={isHistoryEntryWorking(entry) ? "" : undefined}>
                  {isHistoryEntryWorking(entry) && (
                    <SessionRunningIcon label={tt("进行中")} toneClassName="text-emerald-600" />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <button
                    type="button"
                    aria-describedby={describedBy}
                    className="flex min-w-0 flex-1 items-center gap-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                  >
                    {pinned && (
                      <svg className="h-3 w-3 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="currentColor" aria-label={tt("已置顶")}>
                        <path d="M14 4l6 6-3 1-4 4-1 5-3-3-4 4-1-1 4-4-3-3 5-1 4-4 1-3z" />
                      </svg>
                    )}
                    <span className="min-w-0 flex-1 truncate" data-history-title="">{title}</span>
                    {entry.created_by === "leo" && <LeoCreatedMark />}
                    {favorite && (
                      <svg className="h-3 w-3 shrink-0 fill-yellow-500 text-yellow-500" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-label={tt("已收藏")}>
                        <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  {project && <HistoryProjectTag project={project} />}
                </span>
              </div>
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
                inProject={Boolean(project)}
                href={historyHrefFor(entry, pathname)}
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
                onRemoveFromProject={() => {
                  void mutate(entry, { project_id: null });
                  setMenuFor(null);
                }}
                onDelete={() => {
                  setPending(entry);
                  setMenuFor(null);
                }}
              />
            )}
            </>)}
          </HistoryRowFrame>
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
          onSelect={(projectId, project) => {
            const target = moveTarget;
            setMoveTarget(null);
            void mutate(
              target,
              { project_id: projectId },
              project
                ? { id: project.id, name: project.name || "", icon: project.icon || null }
                : null,
            );
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
  /**
   * @deprecated 2026-10-24 起项目记录与普通任务一样直接在 `/history` 打开，不再有
   * 项目归属拦截页；保留可选字段只为旧调用方能编译，传了也不读。
   */
  projectBasePath?: string;
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

/** The TaskDetail objects AgentChat is seeded with (marked stale when served from cache). */
function historyDetailSeeds(value: LoadedHistoryDetail): Array<TaskDetail | undefined> {
  return value.kind === "task" ? [value.detail] : [value.fallbackTask];
}

/** What decides which runtime mounts: a change here replaces a cached detail. */
function historyDetailShape(value: LoadedHistoryDetail): string {
  if (value.kind === "task") {
    return `task:${value.detail.task.id}:${String(value.detail.task.mode ?? "")}:${value.detail.task.site_id ?? ""}`;
  }
  return `session:${value.session.id}:${value.session.task_id ?? ""}:${value.fallbackTask?.task.id ?? ""}:${isRestorableAppSession(value.session) ? 1 : 0}:${isTaskThreadSession(value.session) ? 1 : 0}`;
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
  const local = useLocalTasks();
  const [selected, setSelected] = useWorkspaceSelection("history");
  const router = useRouter();
  const detailPathname = usePathname() || "";
  // 动态路由本身必须足以恢复详情：刷新 `/history/<sessionId>` 时不能依赖侧栏 effect
  // 先把 id 抄进跨树 selection context。
  const sel =
    historySessionIdFromPath(detailPathname) || selected;
  const localTask = (!siteId || siteId === "oceanleo")
    ? local.tasks.find((task) => sel === `local:${task.id}` || (sel === task.remoteTaskId && (task.canCancel || task.stage === "waiting_for_network")))
    : undefined;
  const localSelection = Boolean(local.workspace && (sel?.startsWith("local:") || localTask));
  const [loaded, setLoaded] = useState<LoadedHistoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  // Which selection the shown detail / error belongs to: until the read for a new
  // selection settles, the previous task is covered (never shown under the new row).
  const [settledFor, setSettledFor] = useState<string | null>(null);
  // Row clicks switch this detail in place while it is mounted (openHistoryHref).
  useEffect(() => {
    mountedHistoryDetails += 1;
    return () => {
      mountedHistoryDetails -= 1;
    };
  }, []);

  // 新后端优先按 app_session 读取；404/旧后端再把同一个 id 当 legacy task 读取。
  // 依赖里刻意没有 `tt`：换语言不该重新拉一遍会话与任务详情。effect 里只存中文原文
  //（词典 key）或后端原样返回的错误串，翻译推迟到渲染（见下方 `tt(detailError)`），
  // 后端串在词典里查不到会原样回落，不会被吞。
  useEffect(() => {
    let alive = true;
    // 2026-10-31 W5: a task opened before in this page comes back at once (no cover);
    // the read below still runs and only replaces it when the task's shape changed.
    const cacheKey = historyDetailCacheKey(siteId, sel || "");
    const cached = sel && !localSelection
      ? peekHistoryDetail<LoadedHistoryDetail>(cacheKey, historyDetailSeeds)
      : undefined;
    setLoaded(cached ?? null);
    setDetailError(null);
    if (!sel || localSelection || cached) setSettledFor(sel || "");
    if (!sel || localSelection) {
      setDetailLoading(false);
      return () => {
        alive = false;
      };
    }
    setDetailLoading(!cached);
    /** What is on screen for this selection (memory / this browser's copy / the read). */
    let shown: LoadedHistoryDetail | undefined = cached;
    let answered = false;
    const commit = (value: LoadedHistoryDetail) => {
      answered = true;
      storeHistoryDetail(cacheKey, value);
      // A session row survives a reload too (task details are kept by AgentChat).
      if (value.kind === "session" && !value.fallbackTask) rememberHistorySession(cacheKey, value.session);
      setDetailLoading(false);
      setSettledFor(sel);
      if (!shown || historyDetailShape(shown) !== historyDetailShape(value)) setLoaded(value);
      shown = value;
    };
    // A background re-read that fails keeps what is already shown (silent).
    const fail = (message: string) => {
      answered = true;
      setDetailLoading(false);
      setSettledFor(sel);
      if (!shown) setDetailError(message);
    };
    const search =
      typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    // `?task=<id>` names a task (historyHrefFor / onTaskCreated write it): read the
    // task directly instead of two serial app_session 404s first.
    const taskQuery = !historySessionIdFromPath(detailPathname) && search?.get("task") === sel;
    // A named computer session reads its list alongside the task; AgentChat then
    // finds the session already known (its first paint needs no list round trip).
    if (taskQuery && search?.get("computerSession")) {
      void listComputerTaskSessions(sel).catch(() => null);
    }
    // Not in this page's memory: this browser's copy (IndexedDB, user-scoped) paints
    // while the gateway read runs; the read replaces it only when the shape changed.
    if (!cached) {
      const fromDisk: Promise<LoadedHistoryDetail | undefined> = taskQuery
        ? readTaskDetail(sel).then((detail) => (detail ? { kind: "task", detail } : undefined))
        : readHistorySession<AppSession>(cacheKey).then((session) =>
            session ? { kind: "session", session } : undefined);
      void fromDisk.then((value) => {
        if (!alive || answered || !value) return;
        if (value.kind === "task" && siteId && value.detail.task.site_id && value.detail.task.site_id !== siteId) return;
        shown = value;
        setLoaded(value);
        setSettledFor(sel);
        setDetailLoading(false);
      }, () => undefined);
    }
    void (async () => {
      let directTask: Awaited<ReturnType<typeof getTask>> | null = null;
      if (taskQuery) {
        // A sidebar hover / press may already have started this read (newest messages first).
        directTask = await openTaskFirstPage(sel);
        if (!alive) return;
        if (directTask.ok && directTask.data) {
          if (
            siteId &&
            directTask.data.task.site_id &&
            directTask.data.task.site_id !== siteId
          ) {
            fail("这条旧记录不属于当前网站。");
            return;
          }
          commit({ kind: "task", detail: directTask.data });
          return;
        }
        if (directTask.status !== 404) {
          fail(
            directTask.status === 401
              ? "登录后即可查看我的任务。"
              : taskRequestFailureText(directTask, "加载失败"),
          );
          return;
        }
        // Not a task after all (an old link carrying a session id): read it as one.
      }
      let sessionResult = await (takeAppSessionPrefetch(sel) ?? getAppSession(sel));
      if (!sessionResult.ok && sessionResult.status === 404) {
        const advancedResult = await getAppSession(sel, "advanced");
        sessionResult = advancedResult;
      }
      if (!alive) return;
      if (sessionResult.ok && sessionResult.data) {
        const session = sessionResult.data;
        // 项目里建的会话与普通会话一样直接打开（D11，撤销 2026-08-13 的拦截页）。
        if (siteId && session.site_id !== siteId &&
            !(siteId === "oceanleo" && session.app_id === "library")) {
          fail("这条工作会话不属于当前网站。");
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
            // 项目会话的关联 task 也在项目里；默认 unassigned 会把它漏掉。
            session.project_id ? "all" : "unassigned",
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
        commit({ kind: "session", session, fallbackTask });
        return;
      }
      if (!isAppSessionApiUnavailableStatus(sessionResult.status)) {
        fail(
          sessionResult.status === 401
            ? "登录后即可查看我的任务。"
            : taskRequestFailureText(sessionResult, "加载失败"),
        );
        return;
      }
      const taskResult = directTask ?? (await getTask(sel));
      if (!alive) return;
      if (taskResult.ok && taskResult.data) {
        if (
          siteId &&
          taskResult.data.task.site_id &&
          taskResult.data.task.site_id !== siteId
        ) {
          fail("这条旧记录不属于当前网站。");
          return;
        }
        commit({ kind: "task", detail: taskResult.data });
        return;
      }
      const signedOut =
        sessionResult.status === 401 || taskResult.status === 401;
      fail(
        signedOut
          ? "登录后即可查看我的任务。"
          : taskRequestFailureText(taskResult.error ? taskResult : sessionResult, "加载失败"),
      );
    })();
    return () => {
      alive = false;
    };
  }, [router, sel, siteId, localSelection]);

  // 仅用于 legacy task / 不完整 session 的明确降级。完整 session 的右栏完全由站点 runtime
  // 提供，不再用 AgentChat 的通用 libraryTabs 模拟。
  const effectiveLibraryTabs: AgentLibraryTabs | undefined =
    libraryTabs ??
    (siteId ? { showFiles: true, showBrowser: true } : undefined);
  // ONE loading look for the whole detail area (2026-10-31 W5): the host's own read
  // and every runtime below it (AgentChat's first task read, its conversation
  // choice, a native chat's saved copy) report into this gate; the page-level
  // skeleton covers them until all are in, once per selection.
  const hostReady =
    (!sel || settledFor === sel) &&
    !detailLoading &&
    !(localSelection && !localTask && local.loading);
  const gated = (body: ReactNode) => (
    <TaskLoadingGate gateKey={sel || ""} hostReady={hostReady}>
      {body}
    </TaskLoadingGate>
  );
  if (localTask) return gated(<LocalTaskDetail key={localTask.id} task={localTask} />);
  if (localSelection) {
    return gated(
      local.loading
        ? <div className="h-[calc(100dvh-1px)]" />
        : <div role="status" className="p-8 text-sm text-neutral-500">{tt(local.error ? "无法读取本机任务，请稍后重试。" : "这条本机任务已不存在。")}</div>,
    );
  }
  if (!sel) {
    return gated(
      <div className="flex h-[calc(100dvh-1px)] flex-col">
        <div className="grid flex-1 place-items-center p-8 text-center text-[13px] text-neutral-400">
          {tt("在左侧选择一个任务，即可继续操作或查看对话与产出。")}
        </div>
      </div>
    );
  }

  // Still reading: the gate's skeleton covers this placeholder (no loading text line).
  if (!hostReady) {
    return gated(<div className="h-[calc(100dvh-1px)]" data-history-detail-pending="" />);
  }

  if (detailError || !loaded) {
    return gated(
      <div className="flex h-[calc(100dvh-1px)] flex-col">
        <div className="grid flex-1 place-items-center p-8 text-center text-[13px] text-rose-500">
          {detailError ? tt(detailError) : tt("这个任务不存在或已无权访问。")}
        </div>
      </div>
    );
  }

  if (loaded.kind === "task" && isShellTask(loaded.detail.task)) {
    const shell = shellSessionFromTask(loaded.detail.task);
    return gated(
      <div className="flex h-[calc(100dvh-1px)] min-h-0 flex-col">
        <ShellTaskView
          taskId={loaded.detail.task.id}
          computerId={shell?.computerId || String(loaded.detail.task.computer_id || "")}
          sessionId={shell?.sessionId || ""}
          computerName={shell?.computerName}
        />
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
  const publishItems = historyPublishItems(
    loaded.kind === "task" ? loaded.detail : loaded.fallbackTask,
  );
  // A portal home/agent chat without a workspace snapshot IS its task thread:
  // it opens as the task chat below, never as a (non-existent) site workspace.
  if (
    runtimeSession &&
    isRestorableAppSession(runtimeSession) &&
    !isTaskThreadSession(runtimeSession)
  ) {
    const currentSession = runtimeSession;
    if (!renderWorkspace && currentSession.app_id !== "library") {
      return gated(
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
    return gated(
      <div className="flex h-[calc(100dvh-1px)] flex-col">
        <HistoryArtifactPublishRows items={publishItems} />
        <div className="min-h-0 flex-1">
          <WorkspaceSessionProvider
            key={currentSession.id}
            siteId={currentSession.site_id}
            appId={currentSession.app_id}
            sessionId={currentSession.id}
            initialSession={currentSession}
            mode="history"
            resumeLatest={false}
          >
            {currentSession.app_id === "library"
              ? <LibraryTaskHistoryWorkspace session={currentSession} accent={accent} />
              : renderWorkspace?.(currentSession)}
          </WorkspaceSessionProvider>
        </div>
      </div>
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
  return gated(
    <div className="flex h-[calc(100dvh-1px)] flex-col">
      <HistoryArtifactPublishRows items={publishItems} />
      <div className="min-h-0 flex-1">
        {fallbackTaskId ? (
          <AgentChat
            key={fallbackTaskId}
            siteId={fallbackSiteId}
            taskId={fallbackTaskId}
            initialTask={loaded.kind === "task" ? loaded.detail : loaded.fallbackTask}
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
                  ? historySessionHref(
                      nextSessionId,
                      undefined,
                      detailPathname,
                    )
                  : withFusionMountPrefix(
                      `/history?task=${encodeURIComponent(nextTaskId)}`,
                      detailPathname,
                    ),
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
