import type { AgentTask } from "../lib/agent";
import type { AppSession } from "../lib/app-session";

/** Ordering times `mergeHistoryEntries` resolved for a row (see `HistoryEntryActivity`). */
type HistoryEntryTimes = {
  /** Latest conversation activity the row stands for; the list sorts by it. */
  activity_at?: string;
  /** Latest user message, retained for activity reconciliation. */
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
      activity_state?: AgentTask["activity_state"];
    } & HistoryEntryTimes)
  | ({ kind: "task"; id: string; task: AgentTask; created_by?: string | null; working?: true; activity_state?: AgentTask["activity_state"] } & HistoryEntryTimes);

function activityStateOf(record: unknown): AgentTask["activity_state"] {
  if (!record || typeof record !== "object") return undefined;
  const value = record as { activity_state?: unknown; computer_run_status?: unknown; run_status?: unknown; status?: unknown };
  const state = value.activity_state;
  if (state === "waiting_user" || state === "finishing" || state === "failed" || state === "offline" || state === "idle") return state;
  if (value.status === "finishing" || value.computer_run_status === "finishing" || value.run_status === "finishing") return "finishing";
  return state === "working" ? state : undefined;
}

/**
 * 失败、离线、等待用户、确认结束和闲置不算执行，即使旧的运行标记尚未清理。
 * 原生任务只接受明确的 working/活动状态；open_turn 也包含待处理输入和结束确认，只表示执行权限。
 * 旧网关的云端任务保留 status 回退，原生会话单凭 running 不算执行。
 * 完成、失败、停止、session 的 active/archived 本身都不表示正在工作。
 */
export function isTaskWorking(
  task: Pick<AgentTask, "status" | "computer_run_status" | "activity_state"> & {
    open_turn?: boolean;
    working?: boolean;
    mode?: string;
    computer_id?: string | null;
  },
): boolean {
  if (task.status === "finishing" || task.computer_run_status === "finishing" || task.activity_state === "finishing" ||
      task.activity_state === "failed" || task.activity_state === "offline" || task.activity_state === "waiting_user" || task.activity_state === "idle") return false;
  if (typeof task.working === "boolean") return task.working;
  if (task.computer_run_status === "waiting_user") return false;
  if (task.activity_state === "working") return true;
  return task.status === "running" && task.mode !== "computer" && !task.computer_id && !task.computer_run_status;
}

export function isHistoryEntryWorking(entry: HistoryListEntry): boolean {
  return entry.working === true;
}

/** A computer task is waiting for the user's permission/input, not running. */
export function isHistoryEntryWaiting(entry: HistoryListEntry): boolean {
  return !isHistoryEntryWorking(entry) && entry.activity_state === "waiting_user";
}

export function isHistoryEntryFailed(entry: HistoryListEntry): boolean {
  return !isHistoryEntryWorking(entry) && (entry.activity_state === "failed" || entry.activity_state === "offline");
}

export function isHistoryEntryOffline(entry: HistoryListEntry): boolean {
  return !isHistoryEntryWorking(entry) && entry.activity_state === "offline";
}

export function isHistoryEntryFinishing(entry: HistoryListEntry): boolean {
  return !isHistoryEntryWorking(entry) && entry.activity_state === "finishing";
}

/** The time a row stands for: its last conversation activity (an old task without one: its creation). */
export function historyEntryTimestamp(entry: HistoryListEntry): string {
  if (entry.activity_at) return entry.activity_at;
  return entry.kind === "session"
    ? latestTime(entry.session.last_activity_at, entry.session.created_at) || ""
    : latestTime(entry.task.last_activity_at, entry.task.created_at) || "";
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

/** "Now" describes confirmed execution; the underlying timestamp stays recorded activity. */
export function formatHistoryActivityTime(
  ts: string | null | undefined,
  working: boolean,
  now: Date = new Date(),
  locale?: string,
): string {
  if (!working) return formatHistoryTime(ts, now, locale);
  try {
    return new Intl.RelativeTimeFormat(locale || undefined, { numeric: "auto" }).format(0, "second");
  } catch {
    return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(0, "second");
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
  /** A failed/incomplete session read may expose its task rows, without aggregate deletion. */
  sessionApiFailed?: boolean;
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
 * - 活动时间：task.last_activity_at（网关的对话活动）‖ created_at；元数据更新时间不算。
 *   session 取自身 last_activity_at 与它挂着的 task 的活动时间中较新的；本页刚看到的
 *   活动（`localActivity`）只会把行往上提。
 * - 同一工作状态内置顶优先，其余按真实最后活动倒序，包含 agent 自主回合。
 * - 置顶的闲置任务不能越过正在工作的任务。
 */
export function compareHistoryEntries(a: HistoryListEntry, b: HistoryListEntry): number {
  const aWorking = isHistoryEntryWorking(a);
  const bWorking = isHistoryEntryWorking(b);
  if (aWorking !== bWorking) return aWorking ? -1 : 1;
  const aPinned = a.kind === "session" ? Boolean(a.session.pinned) : Boolean(a.task.pinned);
  const bPinned = b.kind === "session" ? Boolean(b.session.pinned) : Boolean(b.task.pinned);
  if (aPinned !== bPinned) return aPinned ? -1 : 1;
  const byTime = newestFirst(historyEntryTimestamp(a), historyEntryTimestamp(b));
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
  const finishingSessionIds = new Set<string>();
  const finishingTaskIds = new Set<string>();
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
    if (activityStateOf(task) === "finishing") {
      finishingTaskIds.add(task.id);
      if (task.session_id) finishingSessionIds.add(task.session_id);
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
      task.last_activity_at,
      task.created_at,
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
        session.last_activity_at,
        session.created_at,
        bound?.activity_at,
        linked?.activity_at,
        seen?.at,
      ),
      user_activity_at: latestTime(bound?.user_activity_at, linked?.user_activity_at, seen?.userAt),
    };
  };
  const legacyTasks = tasks
    .filter((task) => !isShellTask(task))
    .filter((task) => options.sessionApiUnavailable || !task.session_id ||
      (options.sessionApiFailed && !sessions.some((session) => session.id === task.session_id)));
  // A session row is opened from /tasks/<task id>; the list API does not compute
  // `task_id`, so link each session to its latest task here (2026-11-02: the
  // sidebar never showed the open task as selected).
  const latestTaskBySession = new Map<string, AgentTask>();
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) {
    if (!task.session_id || isShellTask(task)) continue;
    const prior = latestTaskBySession.get(task.session_id);
    if (!prior || String(task.created_at || "") > String(prior.created_at || "")) {
      latestTaskBySession.set(task.session_id, task);
    }
  }
  const entries: HistoryListEntry[] = [
    ...sessions.map((rawSession): HistoryListEntry => {
      const linkedTask = rawSession.task_id ? null : latestTaskBySession.get(rawSession.id);
      const session = linkedTask ? { ...rawSession, task_id: linkedTask.id } : rawSession;
      const own = readCreatedBy(session);
      const created_by =
        own === "leo" || leoSessionIds.has(session.id) ? "leo" : own;
      const stateTask = (session.task_id ? taskById.get(session.task_id) : undefined) || latestTaskBySession.get(session.id);
      const ownState = activityStateOf(session);
      const working =
        workingSessionIds.has(session.id) ||
        Boolean(session.task_id && workingTaskIds.has(session.task_id)) ||
        (!stateTask && isTaskWorking({ ...session, activity_state: ownState }));
      const selectedState = activityStateOf(stateTask);
      const finishing = finishingSessionIds.has(session.id) || Boolean(session.task_id && finishingTaskIds.has(session.task_id));
      const activity_state = working ? "working"
        : selectedState === "failed" || selectedState === "offline" || selectedState === "waiting_user" ? selectedState
        : finishing ? "finishing" : selectedState ?? ownState;
      return {
        kind: "session",
        id: session.id,
        session:
          created_by === "leo" && own !== "leo"
            ? { ...session, created_by: "leo" }
            : session,
        created_by,
        ...(working ? { working: true as const } : {}),
        ...(activity_state ? { activity_state } : {}),
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
        ...(activityStateOf(task) ? { activity_state: activityStateOf(task) } : {}),
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
