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
};

export type DialogModel = {
  id: string;
  name: string;
  default: boolean;
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
    }
  | {
      kind: "question";
      id: string;
      questionId: string;
      title: string;
      questions: unknown;
      submitted: boolean;
    }
  | {
      kind: "commands";
      id: string;
      commands: { name: string; description: string }[];
    };

export type AgentDialogMessage =
  | { kind: "user"; id: string; text: string }
  | { kind: "turn"; id: string; acpSession: string; stop: string; items: TurnItem[] }
  // notice 的 text 是错误帧原文透传（reduce 按帧带上、MessageList 优先显示）；无 text 时走 notice.ts 词典。
  | { kind: "notice"; id: string; code: string; program: string; text?: string };

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
  programs: ProgramStatus[];
  models: DialogModel[];
  modelSource: string;
  selectedModel: string;
  mode: ModeOption | null;
  selectedMode: string;
  install: InstallState;
  login: LoginState;
  opened: WsProgram[];
};

export type AgentDialogController = {
  program: AgentProgram | null;
  setProgram: (program: AgentProgram) => void;
  messages: AgentDialogMessage[];
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  send: () => Promise<void>;
  abort: () => void;
  programs: ProgramStatus[];
  models: DialogModel[];
  modelSource: string;
  selectedModel: string;
  setSelectedModel: (id: string) => void;
  mode: ModeOption | null;
  selectedMode: string;
  setMode: (value: string) => void;
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
  openedPrograms: WsProgram[];
  closeProgram: (program: WsProgram) => void;
  retryConnect: () => void;
  offline: boolean;
  agentBusy: boolean;
};
