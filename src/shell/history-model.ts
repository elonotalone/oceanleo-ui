import type { AgentTask } from "../lib/agent";
import type { AppSession } from "../lib/app-session";

export type HistoryListEntry =
  | { kind: "session"; id: string; session: AppSession }
  | { kind: "task"; id: string; task: AgentTask };

type SnapshotRestorableAppSession = AppSession & {
  site_id: string;
  app_id: string;
  snapshot: Record<string, unknown>;
};

type TaskBackedAgentSession = AppSession & {
  site_id: string;
  app_id: "agent";
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
}

function newestFirst(a?: string | null, b?: string | null): number {
  return String(b || "").localeCompare(String(a || ""));
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
  const orderedSessions = [...sessions].sort((a, b) =>
    newestFirst(a.last_activity_at || a.updated_at, b.last_activity_at || b.updated_at),
  );
  const legacyTasks = tasks
    .filter((task) => options.sessionApiUnavailable || !task.session_id)
    .sort((a, b) =>
      newestFirst(a.updated_at || a.created_at, b.updated_at || b.created_at),
    );
  const entries: HistoryListEntry[] = [
    ...orderedSessions.map(
      (session): HistoryListEntry => ({
        kind: "session",
        id: session.id,
        session,
      }),
    ),
    ...legacyTasks.map(
      (task): HistoryListEntry => ({ kind: "task", id: task.id, task }),
    ),
  ];
  return entries.sort((a, b) => {
    const aTime =
      a.kind === "session"
        ? a.session.last_activity_at || a.session.updated_at
        : a.task.updated_at || a.task.created_at;
    const bTime =
      b.kind === "session"
        ? b.session.last_activity_at || b.session.updated_at
        : b.task.updated_at || b.task.created_at;
    return newestFirst(aTime, bTime);
  });
}

/** session 走聚合删除；只有无 session 的 legacy task 走旧 task 删除。 */
export function canDeleteHistoryEntry(entry: HistoryListEntry): boolean {
  return entry.kind === "session" || !entry.task.session_id;
}

/**
 * 带真实 snapshot 的 app 可恢复完整操作台；标准 `agent` app 的完整 runtime 就是持续
 * task thread，因此允许 task_id 代替 snapshot。其它 app 绝不拿当前默认值冒充历史。
 */
export function isRestorableAppSession(
  session: AppSession | null | undefined,
): session is RestorableAppSession {
  if (!session?.id || !session.site_id || !session.app_id) return false;
  const snapshot = session.snapshot;
  const hasSnapshot =
    snapshot !== undefined &&
    snapshot !== null &&
    typeof snapshot === "object" &&
    !Array.isArray(snapshot);
  return (
    hasSnapshot ||
    (session.app_id === "agent" &&
      typeof session.task_id === "string" &&
      Boolean(session.task_id))
  );
}

/** 迁移期 task 关系已存在但 session.task_id 尚未回填时，用真实关联补齐 agent runtime。 */
export function withLinkedAgentTask(
  session: AppSession,
  linkedTaskId?: string | null,
): AppSession {
  return session.app_id === "agent" && !session.task_id && linkedTaskId
    ? { ...session, task_id: linkedTaskId }
    : session;
}
