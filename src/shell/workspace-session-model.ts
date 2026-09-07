import type { ReactNode } from "react";
import {
  isAppSessionApiUnavailableStatus,
  type AppSession,
  type AppSessionSurface,
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

/**
 * 建档意图。`app_sessions` 一行就是用户在「我的任务」里看到的一条任务，因此建行的
 * 权力只交给「已经产生了一份重做要付出代价的产物」的调用方。
 *
 * - `"output"`：本次调用伴随真实产物（AI 产出、用户手工保存的文档、登记的素材）。
 *   允许创建会话。
 * - `"thread"`：用户刚把第一句话发给 agent。允许创建会话，让 task 在服务端一出生就
 *   绑在这条会话上；这一行在服务端记下第一条 AI 回答（`first_output_at`）之前仍是
 *   草稿，「我的任务」看不见它。发出去没回答，就永远只是草稿。
 *   为什么不等第一条回答再建：客户端事后 `bindTask` 只改内存，服务端不会把已建的
 *   task 回绑到后来的会话，结果是会话永远不被盖章、对话也挂不回任务。
 * - `"attach"`（默认）：只想拿到当前会话。没有就返回空，绝不创建。右栏页签、备注、
 *   操作台输入这类「还没产出」的状态走这条路，落到 `agent_console_drafts` 草稿里；
 *   已有会话时只回写快照、不推进 `last_activity_at`。
 */
export type SessionCreateIntent = "output" | "thread" | "attach";

/** 未传视为 `"attach"`：只有明确伴随产物的调用才有权建档。 */
export function isOutputCreateIntent(
  intent?: SessionCreateIntent,
): boolean {
  return intent === "output";
}

/** 哪些意图有权新建 `app_sessions` 行：产物落地，或 agent 线程刚开始。 */
export function canCreateSessionWithIntent(
  intent?: SessionCreateIntent,
): boolean {
  return intent === "output" || intent === "thread";
}

/**
 * 这次保存算不算「在这条任务上干活」。只有伴随产物的保存推进 `last_activity_at`；
 * 切右栏页签、改备注、敲还没发出去的输入都只是回写界面状态，「我的任务」的排序
 * 和时间不得因此变化。
 */
export function snapshotSaveCountsAsActivity(
  intent?: SessionCreateIntent,
): boolean {
  return intent === "output";
}

/**
 * 把草稿里攒下的输入并进本次快照。草稿是非空对象时展开，本次快照覆盖同名键；
 * 没有草稿就原样返回本次快照。
 */
export function mergeDraftStateIntoSnapshot(
  draftState: unknown,
  snapshot?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (
    draftState &&
    typeof draftState === "object" &&
    !Array.isArray(draftState) &&
    Object.keys(draftState as Record<string, unknown>).length > 0
  ) {
    return {
      ...(draftState as Record<string, unknown>),
      ...(snapshot || {}),
    };
  }
  return snapshot;
}

/**
 * 这条会话是否已经产出过内容。
 *
 * 判定的是**三态**，不是真假：字段缺失与字段为 null 必须分开看。未产出的会话会被
 * `archive` / `startNew` 直接 `DELETE`（后端级联删任务、消息与产物），所以只有服务端
 * **明确说**没有产出时才可以丢弃。
 *
 * - 字段缺失（`undefined`）：后端还没有这一列，或这条响应没带上它。此时无从判断，
 *   一律当作**已产出**——宁可多留一条空记录，也不能删掉用户真实的已保存任务。
 *   迁移 `0208` 应用之前，线上每一行都走这条分支。
 * - `null`：服务端明确表示这条只有输入、没有任何产出，可以丢弃。
 * - 时间戳：已产出。
 */
export function sessionHasProducedOutput(
  session: { first_output_at?: string | null } | null | undefined,
): boolean {
  if (!session) return false;
  if (!("first_output_at" in session)) return true;
  if (session.first_output_at === undefined) return true;
  return Boolean(session.first_output_at);
}

export interface WorkspaceSnapshotSaveResult {
  ok: boolean;
  session?: AppSession;
  conflict?: WorkspaceSessionConflict;
  unavailable?: boolean;
  /** 当前路由无权写该会话；调用方不得回退成其它本地写入。 */
  readOnly?: boolean;
  /** 保存属于已经离开的 session；常见于 restart/切换时到达的卸载 flush。 */
  stale?: boolean;
  /**
   * 尚无会话且本次不是产出：快照已写进 `agent_console_drafts` 草稿，未建任务行。
   * `ok` 仍为 true——用户的输入没有丢，只是还不配叫一条任务。
   */
  deferred?: boolean;
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
  /** Keep the mounted runtime when the caller is already orchestrating its first run. */
  remountRuntime?: boolean;
  /** 默认 `"attach"`：没有产物的调用方不得建档。 */
  intent?: SessionCreateIntent;
}

export interface SaveWorkspaceSnapshotOptions {
  title?: string;
  /**
   * 安排这次保存时所见的 session。若队列真正执行前已 restart/切换，不得拿旧快照创建
   * 新 session 或覆盖新 session。
   */
  expectedSessionId?: string;
  /** 默认 `"attach"`：自动保存永远不建档，只有伴随产物的保存才建。 */
  intent?: SessionCreateIntent;
}

export interface WorkspaceSessionContextValue {
  sessionId: string | null;
  siteId: string;
  appId: string;
  /** 当前 GoalApp 展示名，用于历史标题；身份仍以 appId 为准。 */
  appTitle: string;
  surface: AppSessionSurface;
  mode: WorkspaceSessionMode;
  session: AppSession | null;
  taskId: string | null;
  /** 完整「我的任务」session 可续编；旧/错误路由仍可被标为只读。 */
  readOnly: boolean;
  /**
   * 这条会话是否已经产出过内容（服务端 `first_output_at`）。无会话时为 false。
   * 未产出的会话不会出现在「我的任务」，restart 时直接丢弃而不是归档。
   */
  hasOutput: boolean;
  availability: WorkspaceSessionAvailability;
  error: string | null;
  conflict: WorkspaceSessionConflict | null;
  /** Persists across the keyed runtime remount triggered by Restart. */
  restartFeedback: "saved" | "reset" | null;
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
  /** 接管后端刚创建的分支 aggregate，并原子切换 task/session 身份。 */
  adoptSession: (sessionId: string) => Promise<AppSession | null>;
  artifactContext: (
    title?: string,
  ) => Promise<WorkspaceSessionRecordContext | null>;
  recordArtifact: (
    recorder: (
      context: WorkspaceSessionRecordContext,
    ) => Promise<unknown> | unknown,
    title?: string,
  ) => Promise<boolean>;
  archive: () => Promise<false | "empty" | "archived">;
  /** live 工作台保存当前会话并回到“尚未创建新会话”的干净状态。 */
  restart: () => Promise<false | "empty" | "archived">;
  /**
   * 显式结束当前聚合并建立下一条会话。高级功能的「新建对话」使用它：
   * 当前 active 会先归档，已归档历史保持不变；新会话沿用同一 site/app 身份。
   */
  startNew: (
    options?: EnsureWorkspaceSessionOptions,
  ) => Promise<AppSession | null>;
  clearConflict: () => void;
  reload: () => Promise<AppSession | null>;
}

export interface WorkspaceSessionProviderProps {
  children: ReactNode;
  siteId: string;
  appId: string;
  /** Product data partition. Advanced work never inherits or appears in App history. */
  surface?: AppSessionSurface;
  /** 当前 GoalApp 展示名；首次创建 session 时作为默认标题。 */
  title?: string;
  /**
   * 受控 session id。省略时 Provider 自管；传 null 时 live 模式仍会只读查找最近活跃
   * 会话（可用 resumeLatest=false 显式关闭）。新 id 经 onSessionIdChange 回报。
   */
  sessionId?: string | null;
  onSessionIdChange?: (sessionId: string | null) => void;
  /** Agent task 已绑定聚合后通知宿主；可先 flush runtime 再切 canonical history URL。 */
  onTaskBound?: (
    sessionId: string,
    taskId: string,
  ) => void | Promise<void>;
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

/** 建档合并草稿后，服务端快照是本次记录的超集，不得再用瘦快照覆盖。 */
export function snapshotCoversRecord(
  snapshot: unknown,
  record: Record<string, unknown>,
): boolean {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return false;
  }
  const held = snapshot as Record<string, unknown>;
  return Object.keys(record).every((key) =>
    workspaceSnapshotsEqual(held[key], record[key]),
  );
}

export function workspaceSessionMatches(
  session: AppSession,
  siteId: string,
  appId: string,
  surface: AppSessionSurface = "app",
): boolean {
  return (
    session.site_id === siteId &&
    session.app_id === appId &&
    (session.surface || "app") === surface
  );
}

export function workspaceSessionMismatch(
  session: AppSession | undefined,
  siteId: string,
  appId: string,
  surface: AppSessionSurface = "app",
): boolean {
  return Boolean(
    session && !workspaceSessionMatches(session, siteId, appId, surface),
  );
}

export function matchingInitialSession(
  initial: AppSession | null,
  sessionId: string | null,
  siteId: string,
  appId: string,
  surface: AppSessionSurface = "app",
): AppSession | null {
  return initial &&
    workspaceSessionMatches(initial, siteId, appId, surface) &&
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
