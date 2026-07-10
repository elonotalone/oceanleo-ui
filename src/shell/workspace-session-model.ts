import type { ReactNode } from "react";
import {
  isAppSessionApiUnavailableStatus,
  type AppSession,
} from "../lib/app-session";
export {
  isArchivedAppSession,
  isStaleSessionResponse,
  isWorkspaceSessionReadOnly,
  snapshotTargetsCurrentSession,
} from "./workspace-session-safety";

export type WorkspaceSessionMode = "workspace" | "history" | "embed";
export type WorkspaceSessionAvailability =
  | "loading"
  | "ready"
  | "signed-out"
  | "unsupported"
  | "error";

/** 各站真实 workspace runtime 的持久化契约。 */
export interface WorkspaceRuntime<S = unknown> {
  schemaVersion: number;
  snapshot: () => S;
  restore: (snapshot: S) => void;
  migrate?: (snapshot: unknown, fromVersion: number) => S;
}

export interface WorkspaceSessionConflict {
  attemptedSnapshot: unknown;
  attemptedSchemaVersion: number;
  /** 409 后重新读取到的服务端最新版；调用方决定合并还是提示用户重试。 */
  latest: AppSession;
}

export interface WorkspaceSnapshotSaveResult {
  ok: boolean;
  session?: AppSession;
  conflict?: WorkspaceSessionConflict;
  unavailable?: boolean;
  /** 已归档会话是只读的，调用方不得回退成其它写入。 */
  readOnly?: boolean;
  /** 保存属于已经离开的 session；常见于 restart/切换时到达的卸载 flush。 */
  stale?: boolean;
  error?: string;
}

export function blockedSnapshotSave(
  conflict: WorkspaceSessionConflict | null,
): WorkspaceSnapshotSaveResult | null {
  return conflict
    ? {
        ok: false,
        session: conflict.latest,
        conflict,
        error: "revision conflict requires explicit resolution",
      }
    : null;
}

export interface WorkspaceSessionRecordContext {
  sessionId: string;
  session_id: string;
  siteId: string;
  site_id: string;
  appId: string;
  app_id: string;
}

export interface EnsureWorkspaceSessionOptions {
  title?: string;
  snapshot?: Record<string, unknown>;
  schemaVersion?: number;
}

export interface SaveWorkspaceSnapshotOptions {
  title?: string;
  /**
   * 安排这次保存时所见的 session。若队列真正执行前已 restart/切换，不得拿旧快照创建
   * 新 session 或覆盖新 session。
   */
  expectedSessionId?: string;
}

export interface WorkspaceSessionContextValue {
  sessionId: string | null;
  siteId: string;
  appId: string;
  /** 当前 GoalApp 展示名，用于历史标题；身份仍以 appId 为准。 */
  appTitle: string;
  mode: WorkspaceSessionMode;
  session: AppSession | null;
  taskId: string | null;
  /** 仅 archived session 只读；active session 从 history 打开后仍可续编。 */
  readOnly: boolean;
  availability: WorkspaceSessionAvailability;
  error: string | null;
  conflict: WorkspaceSessionConflict | null;
  /** 首次有意义动作时取得/创建真实 session；失败返回 null，不伪造本地记录。 */
  ensureActive: (
    options?: EnsureWorkspaceSessionOptions,
  ) => Promise<AppSession | null>;
  saveSnapshot: (
    snapshot: unknown,
    schemaVersion: number,
    options?: SaveWorkspaceSnapshotOptions,
  ) => Promise<WorkspaceSnapshotSaveResult>;
  touch: (title?: string) => Promise<AppSession | null>;
  bindTask: (taskId: string | null, title?: string) => Promise<AppSession | null>;
  artifactContext: (
    title?: string,
  ) => Promise<WorkspaceSessionRecordContext | null>;
  recordArtifact: (
    recorder: (
      context: WorkspaceSessionRecordContext,
    ) => Promise<unknown> | unknown,
    title?: string,
  ) => Promise<boolean>;
  archive: () => Promise<boolean>;
  /** 归档当前会话并回到“尚未创建新会话”的干净状态。 */
  restart: () => Promise<boolean>;
  clearConflict: () => void;
  reload: () => Promise<AppSession | null>;
}

export interface WorkspaceSessionProviderProps {
  children: ReactNode;
  siteId: string;
  appId: string;
  /** 当前 GoalApp 展示名；首次创建 session 时作为默认标题。 */
  title?: string;
  /**
   * 受控 session id。省略时 Provider 自管；传 null 时 live 模式仍会只读查找最近活跃
   * 会话（可用 resumeLatest=false 显式关闭）。新 id 经 onSessionIdChange 回报。
   */
  sessionId?: string | null;
  onSessionIdChange?: (sessionId: string | null) => void;
  mode?: WorkspaceSessionMode;
  /** 历史详情已拿到完整 session 时注入，避免重复请求。 */
  initialSession?: AppSession | null;
  /**
   * 无 sessionId 时是否只读查找最近活跃会话。默认：live/embed 开启，history 关闭。
   * 该查找不会创建空 session。
   */
  resumeLatest?: boolean;
}

export function availabilityForSessionFailure(
  status?: number,
): Exclude<WorkspaceSessionAvailability, "loading" | "ready"> {
  if (status === 401) return "signed-out";
  if (isAppSessionApiUnavailableStatus(status)) return "unsupported";
  return "error";
}

export function workspaceSnapshotsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function workspaceSessionMatches(
  session: AppSession,
  siteId: string,
  appId: string,
): boolean {
  return session.site_id === siteId && session.app_id === appId;
}

export function workspaceSessionMismatch(
  session: AppSession | undefined,
  siteId: string,
  appId: string,
): boolean {
  return Boolean(session && !workspaceSessionMatches(session, siteId, appId));
}

export function matchingInitialSession(
  initial: AppSession | null,
  sessionId: string | null,
  siteId: string,
  appId: string,
): AppSession | null {
  return initial &&
    workspaceSessionMatches(initial, siteId, appId) &&
    (!sessionId || initial.id === sessionId)
    ? initial
    : null;
}

export function changedDuringLoad(
  initial: AppSession | null,
  current: AppSession | null,
  incomingId?: string,
): boolean {
  return current !== initial && current?.id !== incomingId;
}
