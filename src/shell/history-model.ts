import type { AgentTask } from "../lib/agent";
import type { AppSession } from "../lib/app-session";

/** Ordering times `mergeHistoryEntries` resolved for a row (see `HistoryEntryActivity`). */
type HistoryEntryTimes = {
  /** Latest conversation activity the row stands for; the list sorts by it. */
  activity_at?: string;
  /** Latest user message; working rows sort by it so streams do not swap places. */
  user_activity_at?: string;
};

export type HistoryListEntry =
  | ({
      kind: "session";
      id: string;
      session: AppSession & { created_by?: string | null };
      created_by?: string | null;
      /** Present (true) only while the agent is working on this row; see `isTaskWorking`. */
      working?: true;
    } & HistoryEntryTimes)
  | ({ kind: "task"; id: string; task: AgentTask; created_by?: string | null; working?: true } & HistoryEntryTimes);

/**
 * 「在干活」：云端 run 正在跑（task.status === "running"），或挂着的电脑原生会话
 * 正在跑 / 等用户确认（gateway `attach_run_states` 投影的 computer_run_status）。
 * 完成、失败、停止、session 的 active/archived 都不算——侧栏对用户只分两种状态。
 */
export function isTaskWorking(
  task: Pick<AgentTask, "status" | "computer_run_status">,
): boolean {
  return (
    task.status === "running" ||
    task.computer_run_status === "running" ||
    task.computer_run_status === "waiting_user"
  );
}

export function isHistoryEntryWorking(entry: HistoryListEntry): boolean {
  return entry.working === true;
}

/** The time a row stands for: its last conversation activity (an old task without one: its creation). */
export function historyEntryTimestamp(entry: HistoryListEntry): string {
  if (entry.activity_at) return entry.activity_at;
  return entry.kind === "session"
    ? String(entry.session.last_activity_at || entry.session.updated_at || "")
    : String(entry.task.last_activity_at || entry.task.created_at || "");
}

/**
 * Time shown in the My Tasks hover bubble (Manus style), in the viewer's own
 * time zone: today → the clock time ("4:54 PM" / "16:54"); earlier this year →
 * a short date ("Oct 20" / "10月20日"); another year → the date with its year.
 * `locale` is the page language; an unknown tag falls back to the runtime default.
 */
export function formatHistoryTime(
  ts: string | null | undefined,
  now: Date = new Date(),
  locale?: string,
): string {
  if (!ts) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const options: Intl.DateTimeFormatOptions = sameDay
    ? { hour: "numeric", minute: "2-digit" }
    : date.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { year: "numeric", month: "short", day: "numeric" };
  try {
    return new Intl.DateTimeFormat(locale || undefined, options).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

function readCreatedBy(record: object): string | null | undefined {
  const value = (record as { created_by?: unknown }).created_by;
  if (typeof value === "string" || value === null) return value;
  return undefined;
}

type SnapshotRestorableAppSession = AppSession & {
  site_id: string;
  app_id: string;
  snapshot: Record<string, unknown>;
};

type TaskBackedAgentSession = AppSession & {
  site_id: string;
  app_id: "agent" | "home-agent";
  task_id: string;
};

export type RestorableAppSession =
  | SnapshotRestorableAppSession
  | TaskBackedAgentSession;

export interface MergeHistoryEntriesOptions {
  /**
   * 仅当 session 路由明确未部署（404/405/501）时，才退回展示全部 task。
   * 瞬时 5xx 不能把 session-bound task 误装成可删除的旧记录。
   */
  sessionApiUnavailable?: boolean;
  /**
   * Activity seen on this page before the server list caught up (keyed by task
   * id or session id; `HISTORY_ACTIVITY_EVENT`). Only ever moves a row up.
   */
  localActivity?: ReadonlyMap<string, HistoryEntryActivity>;
}

/** Activity times for one task/session; ISO strings. */
export interface HistoryEntryActivity {
  at?: string | null;
  userAt?: string | null;
}

function timeOf(value?: string | null): number {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

/** The latest of several ISO times (gateway rows mix `Z` / `+00:00` / fractions, so compare as dates). */
function latestTime(...values: Array<string | null | undefined>): string | undefined {
  let best: string | undefined;
  let bestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const time = timeOf(value);
    if (value && !Number.isNaN(time) && time > bestTime) {
      best = value;
      bestTime = time;
    }
  }
  return best;
}

function newestFirst(a?: string | null, b?: string | null): number {
  const aTime = timeOf(a);
  const bTime = timeOf(b);
  if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
    if (Number.isNaN(aTime) !== Number.isNaN(bTime)) return Number.isNaN(aTime) ? 1 : -1;
    return String(b || "").localeCompare(String(a || ""));
  }
  return bTime - aTime;
}

/**
 * 「我的任务」的顺序（2026-10-31）：在干活的行永远在最上面，其余按最近活动时间倒序。
 * - 活动时间：task.last_activity_at（网关 0313 的对话活动）‖ updated_at ‖ created_at；
 *   session 取自身 last_activity_at 与它挂着的 task 的活动时间中较新的；本页刚看到的
 *   活动（`localActivity`）只会把行往上提。
 * - 工作组内按用户最近一次发言排（last_user_message_at，缺省回退活动时间），两条同时在
 *   流式输出的任务不会每次刷新都互换位置。
 * - 置顶（pinned）在 HistorySubNav 里再稳定地提到最前：置顶组、普通组各自保持本顺序。
 */
export function compareHistoryEntries(a: HistoryListEntry, b: HistoryListEntry): number {
  const aWorking = isHistoryEntryWorking(a);
  const bWorking = isHistoryEntryWorking(b);
  if (aWorking !== bWorking) return aWorking ? -1 : 1;
  const byTime = aWorking
    ? newestFirst(a.user_activity_at || a.activity_at, b.user_activity_at || b.activity_at) ||
      newestFirst(a.activity_at, b.activity_at)
    : newestFirst(a.activity_at, b.activity_at);
  if (byTime) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * session 是历史单一事实源；仍保留没有归属 session 的旧 task。已绑定 session 的 run/task
 * 不再各占一行，避免同一 app 工作重复成多条历史。
 */
export function mergeHistoryEntries(
  sessions: AppSession[],
  tasks: AgentTask[],
  options: MergeHistoryEntriesOptions = {},
): HistoryListEntry[] {
  const leoSessionIds = new Set<string>();
  // A session row works while any task bound to it works (session.status is
  // only active/archived and says nothing about a run).
  const workingSessionIds = new Set<string>();
  const workingTaskIds = new Set<string>();
  const local = options.localActivity;
  // Conversation activity per task (gateway last_activity_at + what this page
  // saw). A session's conversation runs in its bound task(s), so theirs is the
  // session's activity too (app_sessions.last_activity_at moves on saves only).
  // A task's updated_at (title, cost) is not conversation activity.
  const conversationOf = (task: AgentTask): HistoryEntryTimes => {
    const seen = local?.get(task.id);
    return {
      activity_at: latestTime(task.last_activity_at, seen?.at),
      user_activity_at: latestTime(task.last_user_message_at, seen?.userAt),
    };
  };
  const taskConversation = new Map<string, HistoryEntryTimes>();
  const boundConversation = new Map<string, HistoryEntryTimes>();
  for (const task of tasks) {
    if (task.session_id && task.created_by === "leo") leoSessionIds.add(task.session_id);
    if (isTaskWorking(task)) {
      workingTaskIds.add(task.id);
      if (task.session_id) workingSessionIds.add(task.session_id);
    }
    const own = conversationOf(task);
    taskConversation.set(task.id, own);
    if (task.session_id) {
      const prev = boundConversation.get(task.session_id);
      boundConversation.set(task.session_id, {
        activity_at: latestTime(prev?.activity_at, own.activity_at),
        user_activity_at: latestTime(prev?.user_activity_at, own.user_activity_at),
      });
    }
  }
  const taskTimes = (task: AgentTask): HistoryEntryTimes => ({
    activity_at: latestTime(
      task.last_activity_at || task.updated_at || task.created_at,
      local?.get(task.id)?.at,
    ),
    user_activity_at: taskConversation.get(task.id)?.user_activity_at,
  });
  const sessionTimes = (session: AppSession): HistoryEntryTimes => {
    const bound = boundConversation.get(session.id);
    const linked = session.task_id ? taskConversation.get(session.task_id) : undefined;
    const seen = local?.get(session.id);
    return {
      activity_at: latestTime(
        session.last_activity_at || session.updated_at,
        bound?.activity_at,
        linked?.activity_at,
        seen?.at,
      ),
      user_activity_at: latestTime(bound?.user_activity_at, linked?.user_activity_at, seen?.userAt),
    };
  };
  const legacyTasks = tasks
    .filter((task) => !isShellTask(task))
    .filter((task) => options.sessionApiUnavailable || !task.session_id);
  const entries: HistoryListEntry[] = [
    ...sessions.map((session): HistoryListEntry => {
      const own = readCreatedBy(session);
      const created_by =
        own === "leo" || leoSessionIds.has(session.id) ? "leo" : own;
      const working =
        workingSessionIds.has(session.id) ||
        Boolean(session.task_id && workingTaskIds.has(session.task_id));
      return {
        kind: "session",
        id: session.id,
        session:
          created_by === "leo" && own !== "leo"
            ? { ...session, created_by: "leo" }
            : session,
        created_by,
        ...(working ? { working: true as const } : {}),
        ...definedTimes(sessionTimes(session)),
      };
    }),
    ...legacyTasks.map(
      (task): HistoryListEntry => ({
        kind: "task",
        id: task.id,
        task,
        created_by: task.created_by,
        ...(isTaskWorking(task) ? { working: true as const } : {}),
        ...definedTimes(taskTimes(task)),
      }),
    ),
  ];
  return entries.sort(compareHistoryEntries);
}

/** Omit absent times so entries stay structurally equal to older ones. */
function definedTimes(times: HistoryEntryTimes): HistoryEntryTimes {
  return {
    ...(times.activity_at ? { activity_at: times.activity_at } : {}),
    ...(times.user_activity_at ? { user_activity_at: times.user_activity_at } : {}),
  };
}

/**
 * Re-applies page-local activity to an already merged list (no refetch): rows
 * only move up, then the list re-sorts by `compareHistoryEntries`.
 */
export function bumpHistoryEntries(
  entries: HistoryListEntry[],
  activity: { taskId?: string; sessionId?: string; at: string; user?: boolean },
): HistoryListEntry[] {
  let changed = false;
  const next = entries.map((entry) => {
    const hit =
      entry.kind === "session"
        ? (activity.sessionId && entry.id === activity.sessionId) ||
          (activity.taskId && entry.session.task_id === activity.taskId)
        : (activity.taskId && entry.id === activity.taskId) ||
          (activity.sessionId && entry.task.session_id === activity.sessionId);
    if (!hit) return entry;
    const activity_at = latestTime(entry.activity_at, activity.at);
    const user_activity_at = activity.user
      ? latestTime(entry.user_activity_at, activity.at)
      : entry.user_activity_at;
    if (activity_at === entry.activity_at && user_activity_at === entry.user_activity_at) return entry;
    changed = true;
    return { ...entry, ...definedTimes({ activity_at, user_activity_at }) };
  });
  return changed ? next.sort(compareHistoryEntries) : entries;
}

/** session 走聚合删除；只有无 session 的 legacy task 走旧 task 删除。 */
export function canDeleteHistoryEntry(entry: HistoryListEntry): boolean {
  return entry.kind === "session" || !entry.task.session_id;
}

/**
 * A real snapshot: a non-empty plain object. Home submissions create their
 * `home-agent` session with `snapshot: {}` — that is no workspace state.
 */
export function hasRealSnapshot(session: Pick<AppSession, "snapshot"> | null | undefined): boolean {
  const snapshot = session?.snapshot;
  return (
    snapshot !== undefined &&
    snapshot !== null &&
    typeof snapshot === "object" &&
    !Array.isArray(snapshot) &&
    Object.keys(snapshot).length > 0
  );
}

/**
 * 带真实 snapshot 的 app 可恢复完整操作台；workspace `agent` 与独立首页
 * `home-agent` 的完整 runtime 都是持续 task thread，因此允许 task_id 代替
 * snapshot。其它 app 绝不拿当前默认值冒充历史（空对象 `{}` 不算 snapshot）。
 */
export function isRestorableAppSession(
  session: AppSession | null | undefined,
): session is RestorableAppSession {
  if (!session?.id || !session.site_id || !session.app_id) return false;
  return (
    hasRealSnapshot(session) ||
    ((session.app_id === "agent" || session.app_id === "home-agent") &&
      typeof session.task_id === "string" &&
      Boolean(session.task_id))
  );
}

/**
 * A portal (`oceanleo`) task-thread conversation (`home-agent` / `agent`)
 * with no workspace snapshot: there is no site workspace to mount, the
 * conversation IS the task. History opens it as the task chat (AgentChat)
 * instead of asking the host for a site workspace that does not exist —
 * the portal is not a sub-site, so mounting one failed with
 * 「该工作会话所属网站已下线」. Sub-sites keep their own workspace runtime.
 */
export function isTaskThreadSession(
  session: AppSession | null | undefined,
): boolean {
  if (!session?.id || session.site_id !== "oceanleo" || hasRealSnapshot(session)) return false;
  return session.app_id === "home-agent" || session.app_id === "agent";
}

export const HISTORY_POLL_INTERVAL_MS = 8_000;
/** While a row shows the working mark, refresh this often so it stops within seconds of the run ending. */
export const HISTORY_WORKING_POLL_MS = 3_000;
export const HISTORY_POLL_MAX_INTERVAL_MS = 60_000;

/** Silent history refresh backs off while the gateway is 503/SSL failing. */
export function historyPollDelayMs(consecutiveFailures: number): number {
  const failures = Math.max(0, Math.floor(consecutiveFailures));
  const factor = 2 ** Math.min(failures, 3);
  return Math.min(HISTORY_POLL_MAX_INTERVAL_MS, HISTORY_POLL_INTERVAL_MS * factor);
}

/** 迁移期 task 关系已存在但 session.task_id 尚未回填时，用真实关联补齐 agent runtime。 */
export function withLinkedAgentTask(
  session: AppSession,
  linkedTaskId?: string | null,
): AppSession {
  return (session.app_id === "agent" || session.app_id === "home-agent") &&
    !session.task_id &&
    linkedTaskId
    ? { ...session, task_id: linkedTaskId }
    : session;
}

export type ShellPlan = {
  computer_id?: string;
  session_id?: string;
  computer_name?: string;
};

export function isShellTask(task: Pick<AgentTask, "mode"> | null | undefined): boolean {
  return task?.mode === "shell";
}

export function shellPlanOf(task: Pick<AgentTask, "plan"> | null | undefined): ShellPlan | null {
  const plan = task?.plan;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return null;
  const shell = (plan as { shell?: unknown }).shell;
  if (!shell || typeof shell !== "object" || Array.isArray(shell)) return null;
  const row = shell as Record<string, unknown>;
  return {
    computer_id: typeof row.computer_id === "string" ? row.computer_id : undefined,
    session_id: typeof row.session_id === "string" ? row.session_id : undefined,
    computer_name:
      typeof row.computer_name === "string" ? row.computer_name : undefined,
  };
}

export function shellSessionFromTask(
  task: AgentTask,
): { computerId: string; sessionId: string; computerName?: string } | null {
  if (!isShellTask(task)) return null;
  const shell = shellPlanOf(task);
  const computerId = String(shell?.computer_id || task.computer_id || "");
  const sessionId = String(shell?.session_id || "");
  if (!computerId || !sessionId) return null;
  return {
    computerId,
    sessionId,
    computerName: shell?.computer_name,
  };
}
