// Shell 对话面板 v2 的类型。浏览器只渲染网关帧，不拼命令。

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

export type ToolCard = {
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

export type TurnItem =
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
    }
  | {
      kind: "question";
      id: string;
      questionId: string;
      title: string;
      detail: string;
      questions: unknown;
      submitted: boolean;
    };

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

export type AgentDialogMessage =
  // at: epoch ms the user sent it, when known (a live send here, or a frame that carries a time); drives the chat time line.
  | { kind: "user"; id: string; text: string; replay?: boolean; attachments?: UserMessageAttachment[]; at?: number }
  // orphans: sub-agent tools whose Task/Agent tool has not arrived yet; adopted when it does, never shown on their own.
  | { kind: "turn"; id: string; acpSession: string; stop: string; items: TurnItem[]; live?: boolean; orphans?: ToolCard[] }
  // notice 的 text 是错误帧原文透传（reduce 按帧带上、MessageList 优先显示）；无 text 时走 notice.ts 词典。
  | { kind: "notice"; id: string; code: string; program: string; text?: string; provider?: string; model?: string };

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

export type DialogState = {
  program: AgentProgram | null;
  messages: AgentDialogMessage[];
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

export type AgentDialogController = {
  computerId?: string;
  program: AgentProgram | null;
  setProgram: (program: AgentProgram) => void;
  messages: AgentDialogMessage[];
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  occupancyLink: boolean;
  occupancyAt: number | null;
  occupancyBusy: string[];
  occupancyPendingAt: number | null;
  occupancyPendingSession: string | null;
  /** ACP session ids of the current program that still have an open turn. */
  busySessions?: string[];
  /** ACP session ids parked on background work that will wake them. */
  waitingSessions?: string[];
  /** ACP session ids that still have a process. Not a Past-sessions green dot. */
  runningSessions?: string[];
  /** Known interrupted sessions of the current program, without inferring unopened history. */
  interruptedSessions?: string[];
  /** Completions the operator has not opened since they finished. */
  unreadSessions?: string[];
  /** Sends the draft, or `text` when a host composer owns the input. True only when the prompt went out. */
  send: (text?: string) => Promise<boolean>;
  abort: () => void;
  /** Pointer-down on Stop: ignore the rest of this click so the draft is not sent. */
  armAbortSendGuard?: () => void;
  programs: ProgramStatus[];
  models: DialogModel[];
  modelSource: string;
  selectedModel: string;
  setSelectedModel: (id: string) => void;
  mode: ModeOption | null;
  selectedMode: string;
  setMode: (value: string) => void;
  configOptions: DialogConfigOption[];
  setConfig: (id: string, value: string | boolean) => void;
  commands: DialogCommand[];
  sessions: DialogSession[];
  sessionsSupported: boolean | null;
  activeSession: string;
  sessionLoading: boolean;
  historyOffset: number;
  hasOlder: boolean;
  historyLoading: boolean;
  draftRef?: string;
  requestSessions: () => void;
  requestSessionPath: () => void;
  sessionPath: string;
  sessionPathResolved: boolean;
  openSession: (id: string) => void;
  loadOlderHistory: () => void;
  newSession: (cwd?: string) => void;
  attachments: DialogAttachment[];
  addAttachments: (files: File[]) => void;
  removeAttachment: (id: string) => void;
  fresh: boolean;
  setFresh: (value: boolean) => void;
  install: InstallState;
  openInstall: (program: WsProgram) => void;
  closeInstall: () => void;
  setInstallDir: (dir: string) => void;
  startInstall: () => void;
  login: LoginState;
  openLogin: (program: WsProgram) => void;
  closeLogin: () => void;
  submitLoginCode: (program: WsProgram, code: string) => void;
  cancelLogin: (program: WsProgram) => void;
  /** 登录卡贴码输入框的受控草稿（LoginCard 用；清空随 submitLoginCode）。 */
  setLoginCodeDraft: (code: string) => void;
  /** oceanleo 程序标题「OceanLeo agent · 电脑名」用；agentState 未回到前为空串。 */
  computerName: string;
  answerPermission: (id: string, option: string, name: string) => void;
  answerQuestion: (id: string, values: Record<string, string>) => void;
  openedPrograms: AgentProgram[];
  closeProgram: (program: WsProgram) => void;
  logoutProgram: (program: WsProgram, provider?: string) => void;
  retryConnect: () => void;
  offline: boolean;
  agentBusy: boolean;
};
