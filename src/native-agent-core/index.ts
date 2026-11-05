/**
 * Shared native-agent protocol for web, React Native and Harmony.
 * Keep this entry and its complete dependency closure platform independent.
 * Browser controller contracts live outside this platform-neutral protocol module.
 */

// Native-agent wire messages and conversation state shared by every client.

export const WS_PROGRAMS = ["cursor", "hermes", "claude", "codex"] as const;

export type WsProgram = (typeof WS_PROGRAMS)[number];

export type AgentProgram = WsProgram | "oceanleo";

export const PROGRAM_LABEL: Record<AgentProgram, string> = {
  cursor: "Cursor",
  hermes: "Hermes",
  claude: "Claude Code",
  codex: "Codex",
  oceanleo: "OceanLeo agent",
};

export type DirCapability = "full" | "link_only" | "none";

// 认证真相只有这一种：login=浏览器登录确认、key=贴了 key、none=确认没登录、
// unknown=探针没结论、malformed=存的登录材料坏了（网关会幂等修复后再探）。
// logged_in 只是 auth ∈ {login,key} 的派生，不再单独解析。
export type ProgramAuth = "login" | "key" | "none" | "unknown" | "malformed";

export type ProgramStatus = {
  id: WsProgram;
  installed: boolean;
  path: string;
  version: string;
  auth: ProgramAuth;
  logged_in: boolean | null;
  dir_capability: DirCapability;
  running: boolean;
  /** Hermes only: every provider with a credential on the machine. */
  providers?: ProgramProvider[];
  /** Hermes only; "" when unknown. */
  active_provider?: string;
  account_kind?: string;
};

export type ProgramProvider = {
  id: string;
  label: string;
  auth: "login" | "key";
  tier?: "free" | "paid" | "unknown";
};

export type DialogModel = {
  id: string;
  name: string;
  default: boolean;
  provider?: string;
  provider_label?: string;
  /** `false` = listed but unusable right now; see `reason`. */
  usable?: boolean;
  reason?: string;
};

export type DialogCommand = {
  name: string;
  description: string;
};

export type DialogSession = {
  id: string;
  title: string;
  cwd: string;
  updatedAt: string;
  /** Absolute transcript/session path on the connected computer. */
  path?: string;
};

export type DialogConfigOption = {
  id: string;
  name: string;
  category: string;
  type: "select" | "bool" | "text";
  current: string | boolean;
  options: { value: string; name: string }[];
};

export type ToolKind =
  | "read"
  | "edit"
  | "delete"
  | "move"
  | "search"
  | "execute"
  | "think"
  | "fetch"
  | "switch_mode"
  | "other";

export type ToolStatus = "pending" | "in_progress" | "completed" | "failed";

export type ToolContent =
  | { type: "content"; text: string }
  | { type: "diff"; path: string; old_text: string; new_text: string }
  | { type: "terminal"; output: string };

export type ToolLocation = { path: string; line?: number };

export { toolRawValue, toolPayloadText, TOOL_PAYLOAD_LIMIT } from "./tool-raw";

export type ToolCard = {
  /** Gateway-filtered raw payloads; absent fields retain previous stream values. */
  rawInput?: unknown;
  rawOutput?: unknown;
  id: string;
  kind: ToolKind;
  title: string;
  status: ToolStatus;
  content: ToolContent[];
  locations: ToolLocation[];
  /** Background sub-agent tool: the id of the Task/Agent tool that launched it. */
  parent?: string;
  /** Sub-agent steps of this Task/Agent tool; they never enter the main timeline. */
  children?: ToolCard[];
};

/** Compatibility name for callers of the raw-field parser. */
export type RawToolCard = ToolCard;

export type PlanEntry = {
  content: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed";
};

export type PermissionOption = {
  id: string;
  name: string;
  kind: string;
};

/** First stored position and latest content update; timestamps are server times, never hydration time. */
export type NativeFramePosition = {
  seq?: number; at?: number; updatedSeq?: number; updatedAt?: number;
  /** View-local arrival order until storage assigns seq. Never compared across sources. */
  arrival?: number; updatedArrival?: number; arrivalSource?: string;
};

export type TurnItem = NativeFramePosition & (
  | { kind: "assistant"; id: string; text: string }
  | { kind: "thought"; id: string; text: string }
  | { kind: "tool"; id: string; tool: ToolCard }
  | { kind: "plan"; id: string; entries: PlanEntry[] }
  | {
      kind: "usage";
      id: string;
      used: number;
      size: number;
      cost?: { amount: number; currency: string };
    }
  | {
      kind: "permission";
      id: string;
      permId: string;
      title: string;
      permKind: string;
      options: PermissionOption[];
      toolTitle: string;
      chosen: string;
      auto: boolean;
      actionable?: boolean;
      requestState?: string;
    }
  | {
      kind: "question";
      id: string;
      questionId: string;
      title: string;
      detail: string;
      questions: unknown;
      submitted: boolean;
      actionable?: boolean;
      requestState?: string;
    });

export type DialogAttachmentState = "uploading" | "done" | "error";

export type ArchivedAttachment = { id: string; name: string; mime: string; size: number; download_path: string; artifact_id?: string };

export type DialogAttachment = {
  archive?: ArchivedAttachment;
  id: string;
  name: string;
  mime: string;
  size: number;
  path?: string;
  percent?: number;
  state?: DialogAttachmentState;
  error?: string;
  /** Local `blob:` thumbnail of an image chosen in this tab (never a storage URL). */
  preview?: string;
  /**
   * Held in this tab until the conversation's task session exists, then put
   * into the inbox under it (state stays "uploading", not sendable yet).
   */
  deferred?: boolean;
};

export type UserMessageAttachment = {
  archive?: ArchivedAttachment;
  name: string;
  mime: string;
  preview?: string;
  path?: string;
};

export type AgentMessageSender = {
  kind: "agent";
  label: string;
  program: string;
  task_id: string | null;
};

export const NATIVE_DELIVERY_STATES = ["sending", "queued", "injected", "replaced", "started_new_turn", "delivered", "unsent", "cancelled"] as const;
export type NativeDeliveryState = (typeof NATIVE_DELIVERY_STATES)[number];
export type NativeMessageDelivery = { state: NativeDeliveryState; uncertain?: boolean; reason?: string; intent?: "normal" | "send_now" };
export type NativeMessageSnapshot = {
  message_id: string; turn_id?: string; state: NativeDeliveryState; uncertain?: boolean; reason?: string;
  intent?: "normal" | "send_now"; created_at?: string;
  payload: { text: string; attachments?: UserMessageAttachment[]; files?: Record<string, unknown>[] };
  snapshot_available?: boolean;
};

export type AgentDialogMessage = NativeFramePosition & (
  // at: epoch ms the user sent it, when known (a live send here, or a frame that carries a time); drives the chat time line.
  | { kind: "user"; id: string; messageId?: string; turnId?: string; delivery?: NativeMessageDelivery; text: string; replay?: boolean; attachments?: UserMessageAttachment[]; at?: number; sender?: AgentMessageSender }
  // orphans: sub-agent tools whose Task/Agent tool has not arrived yet; adopted when it does, never shown on their own.
  | { kind: "turn"; id: string; turnId?: string; autonomous?: boolean; acpSession: string; stop: string; items: TurnItem[]; live?: boolean;
      /** Ordered server status; separate from content positions and activity. */
      finishing?: boolean; turnStateSeq?: number; turnStateArrival?: number; turnStateSource?: string; turnStateBinding?: string; orphans?: ToolCard[] }
  // notice 的 text 是错误帧原文透传（reduce 按帧带上、MessageList 优先显示）；无 text 时走 notice.ts 词典。
  | { kind: "notice"; id: string; code: string; program: string; text?: string; provider?: string; model?: string });

export type ModeOption = {
  id: string;
  name: string;
  current: string;
  options: { value: string; name: string }[];
};

export type InstallState = {
  open: boolean;
  program: WsProgram | null;
  dir: string;
  running: boolean;
  lines: string[];
  donePath: string;
  failedText: string;
};

// 登录卡的相位：idle=没开；opening=已发 login 帧、等 login_url；waiting=链接已出、
// 等浏览器完成（needsCode 时还要贴码）；done=探针确认已认证，亮绿一秒自动收起；
// failed=有明确原因（failed 字段是合同 I3 的 code）。
export type LoginPhase = "idle" | "opening" | "waiting" | "done" | "failed";

export type LoginState = {
  open: boolean;
  program: WsProgram | null;
  phase: LoginPhase;
  url: string;
  code: string;
  needsCode: boolean;
  codeDraft: string;
  hint: string;
  failed: string;
  pending: boolean;
};

export type NativeTurnState = {
  program: AgentProgram; acpSession: string; turnId: string; finishing: boolean;
  seq?: number; arrival?: number; arrivalSource?: string; binding?: string;
};

export type DialogState = {
  frameCursor?: number;
  frameSource?: string;
  program: AgentProgram | null;
  messages: AgentDialogMessage[];
  /** Bounded status-only receipts; an archive may arrive before its live turn replay. */
  turnStates?: Record<string, NativeTurnState>;
  busy: boolean;
  agentBusy: boolean;
  offline: boolean;
  /** Last occupancy probe reached the gateway. Not the same as a busy reading. */
  occupancyLink: boolean;
  /** Time of the last occupancy snapshot. Null means no confirmed reading. */
  occupancyAt: number | null;
  /** Session ids the last occupancy snapshot reported as working. */
  occupancyBusy: string[];
  /** Session ids whose turn ended but background work will wake them. */
  occupancyWaiting: string[];
  /** Local send waiting for occupancy to confirm that session. */
  occupancyPendingAt: number | null;
  occupancyPendingSession: string | null;
  programs: ProgramStatus[];
  models: DialogModel[];
  modelSource: string;
  selectedModel: string;
  mode: ModeOption | null;
  selectedMode: string;
  configOptions: DialogConfigOption[];
  commands: DialogCommand[];
  sessions: DialogSession[];
  sessionsSupported: boolean | null;
  activeSession: string;
  /** Absolute conversation file path on the computer, when known. */
  sessionPath: string;
  sessionPathResolved: boolean;
  /** Local turn identity before ACP assigns a session id. */
  draftRef?: string;
  serverActiveSession: string;
  busySession: string;
  /** `${program}::${acpSession}` keys that still have an open turn. */
  liveTurns: Record<string, true>;
  /** ACP session ids that still have a process. Idle leftovers are not in-progress. */
  runningSessions: string[];
  sessionLoading: boolean;
  /** Index of the first loaded transcript frame in the gateway store. */
  historyOffset: number;
  historyTotal: number;
  hasOlder: boolean;
  historyLoading: boolean;
  install: InstallState;
  login: LoginState;
  opened: AgentProgram[];
};

/** The mapped chat row's platform-independent shape (compatible with web AgentMessage). */
export type NativeAgentMessage = {
  id: number;
  role: "user" | "assistant";
  kind: string;
  content: string;
  meta?: {
    final?: boolean;
    attachments?: NativeAgentAttachment[];
    [key: string]: unknown;
  };
  created_at?: string;
};

/** Bubble attachment; native_archive remains an owner-checked private reference. */
export type NativeAgentAttachment = {
  url: string;
  mime?: string;
  name?: string;
  media_type?: string;
  artifact_id?: string;
  revision_id?: string;
  native_archive?: ArchivedAttachment;
};

/** Only the session identity fields needed to map/merge a saved transcript. */
export type NativeTranscriptSession = {
  id: string;
  program: AgentProgram | null;
  created_at: string;
  native_session_id: string | null;
};
