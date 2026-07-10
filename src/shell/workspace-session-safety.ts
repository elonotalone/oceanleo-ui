export type WorkspaceSessionSafetyMode = "workspace" | "history" | "embed";

export interface WorkspaceSessionSafetyRecord {
  id: string;
  revision?: number;
  status?: string;
  archived_at?: string | null;
}

export function isArchivedAppSession(
  session: WorkspaceSessionSafetyRecord | null | undefined,
): boolean {
  return Boolean(
    session &&
      (session.status === "archived" || Boolean(session.archived_at)),
  );
}

export function isWorkspaceSessionReadOnly(
  mode: WorkspaceSessionSafetyMode,
  session: WorkspaceSessionSafetyRecord | null | undefined,
): boolean {
  // `archived` is the deployed compatibility marker for a task saved/listed
  // in My Tasks; it no longer means immutable. The owner-scoped history
  // runtime edits that same row in place. Live/embed must never mutate an
  // archived row accidentally (they normally reject it during hydration).
  return isArchivedAppSession(session) && mode !== "history";
}

/** restart/路由切换后到达的旧 flush 必须失效，不能隐式 ensure 一条新 session。 */
export function snapshotTargetsCurrentSession(
  current: WorkspaceSessionSafetyRecord | null | undefined,
  expectedSessionId?: string,
): boolean {
  return !expectedSessionId || current?.id === expectedSessionId;
}

/** 并发的 GET 不得把刚保存成功的较新 revision 倒灌回内存。 */
export function isStaleSessionResponse(
  current: WorkspaceSessionSafetyRecord | null,
  incoming: WorkspaceSessionSafetyRecord,
): boolean {
  return (
    current?.id === incoming.id &&
    (current.revision || 0) > (incoming.revision || 0)
  );
}
