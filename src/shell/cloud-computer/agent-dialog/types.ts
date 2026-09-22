// Shell 对话面板 v2 的类型。浏览器只渲染网关帧，不拼命令。

export const WS_PROGRAMS = ["cursor", "hermes", "claude", "codex"] as const;

export type WsProgram = (typeof WS_PROGRAMS)[number];

export type AgentProgram = WsProgram | "oceanleo";

export const PROGRAM_LABEL: Record<AgentProgram, string> = {
  cursor: "Cursor",
  hermes: "Hermes",
  claude: "Claude Code",
  codex: "Codex",
  oceanleo: "OceanLeo",
};

export type DirCapability = "full" | "link_only" | "none";

export type ProgramStatus = {
  id: WsProgram;
  installed: boolean;
  path: string;
  version: string;
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
  | { kind: "notice"; id: string; code: string; program: string };

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

export type LoginState = {
  open: boolean;
  program: WsProgram | null;
  url: string;
  code: string;
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
  answerPermission: (id: string, option: string, name: string) => void;
  answerQuestion: (id: string, values: Record<string, string>) => void;
  retryConnect: () => void;
  offline: boolean;
  agentBusy: boolean;
};
