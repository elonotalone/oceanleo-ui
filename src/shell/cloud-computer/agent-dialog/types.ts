// Browser controller contract. Pure protocol types live in the shared core.
// Preserve existing web imports while keeping browser types out of the core.
export { WS_PROGRAMS, PROGRAM_LABEL } from "../../../native-agent-core/index";
export type {
  WsProgram, AgentProgram, DirCapability, ProgramAuth, ProgramStatus, ProgramProvider,
  DialogModel, DialogCommand, DialogSession, DialogConfigOption,
  ToolKind, ToolStatus, ToolContent, ToolLocation, ToolCard, PlanEntry,
  PermissionOption, TurnItem, DialogAttachmentState, ArchivedAttachment,
  DialogAttachment, UserMessageAttachment, AgentMessageSender, AgentDialogMessage,
  ModeOption, InstallState, LoginPhase, LoginState, DialogState,
} from "../../../native-agent-core/index";
import type {
  AgentProgram, AgentDialogMessage, DialogAttachment, DialogCommand,
  DialogConfigOption, DialogModel, DialogSession, InstallState, LoginState,
  ModeOption, ProgramStatus, WsProgram,
} from "../../../native-agent-core/index";

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
