// 把网关帧收成面板状态。这里不碰 WebSocket，方便对照协议逐帧看落点。

import { DEFAULT_INSTALL_DIR } from "./install-dir";
import {
  asRecord,
  isWsProgram,
  parseCommands,
  parseConfigOptions,
  parseCost,
  parseMode,
  parseModels,
  parseOptions,
  parsePlan,
  parsePrograms,
  parseSessions,
  parseTool,
  toolTitleOf,
  conversationPath,
} from "./parse";
import { isModelFamilyConfig } from "./notice";
import { normalizeUserMessage } from "./message-attachments";
import type {
  AgentDialogMessage,
  AgentProgram,
  DialogState,
  InstallState,
  LoginState,
  TurnItem,
  WsProgram,
} from "./types";

const MAX_INSTALL_LINES = 400;

let seq = 0;

function nextId(): string {
  seq += 1;
  return `m-${seq.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function turnKey(program: string | null | undefined, session: string): string {
  return `${program ?? ""}::${session}`;
}

export function isLiveTurn(
  liveTurns: Record<string, true> | undefined,
  program: string | null | undefined,
  session: string,
): boolean {
  return Boolean(liveTurns?.[turnKey(program, session)]);
}

export function busySessionsFor(
  liveTurns: Record<string, true> | undefined,
  program: string | null | undefined,
): string[] {
  const prefix = `${program ?? ""}::`;
  return Object.keys(liveTurns ?? {})
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}

const TURN_END_ERRORS = new Set([
  "acp_exited",
  "acp_start_failed",
  "acp_unavailable",
  "program_missing",
  "missing_program",
  "runtime_missing",
  "not_logged_in",
  "computer_offline",
  "node_error",
  "dialog_unreachable",
]);

function markTurn(state: DialogState, program: string | null, session: string, live: boolean): DialogState {
  const key = turnKey(program, session);
  const liveTurns = { ...state.liveTurns };
  if (live) liveTurns[key] = true;
  else delete liveTurns[key];
  const currentKey = turnKey(state.program, state.activeSession || state.draftRef || "");
  const busy = Boolean(liveTurns[currentKey]);
  return {
    ...state,
    liveTurns,
    busy,
    busySession: busy ? state.activeSession : "",
    agentBusy: live ? state.agentBusy : state.agentBusy && busy,
  };
}

function blankInstall(): InstallState {
  return {
    open: false,
    program: null,
    dir: DEFAULT_INSTALL_DIR,
    running: false,
    lines: [],
    donePath: "",
    failedText: "",
  };
}

function blankLogin(): LoginState {
  return {
    open: false,
    program: null,
    phase: "idle",
    url: "",
    code: "",
    needsCode: false,
    codeDraft: "",
    hint: "",
    failed: "",
    pending: false,
  };
}

export function initialDialogState(): DialogState {
  return {
    // 合同 I6：OceanLeo agent 是对话框第一个程序，打开即选中。
    program: "oceanleo",
    messages: [],
    busy: false,
    agentBusy: false,
    offline: false,
    programs: [],
    models: [],
    modelSource: "",
    selectedModel: "",
    mode: null,
    selectedMode: "",
    configOptions: [],
    commands: [],
    sessions: [],
    sessionsSupported: null,
    activeSession: "",
    sessionPath: "",
    sessionPathResolved: false,
    serverActiveSession: "",
    busySession: "",
    liveTurns: {},
    sessionLoading: false,
    install: blankInstall(),
    login: blankLogin(),
    opened: [],
  };
}

export type DialogEvent =
  | { type: "reset" }
  | { type: "frame"; frame: Record<string, unknown> }
  | { type: "notice"; code: string; program: string }
  | { type: "program"; program: AgentProgram }
  | { type: "send-began" }
  | { type: "send-failed" }
  | { type: "user"; text: string; attachments?: { name: string; mime: string; preview?: string }[] }
  | { type: "cancel-local" }
  | { type: "clear-offline" }
  | { type: "set-model"; id: string }
  | { type: "set-mode"; value: string }
  | { type: "set-config"; id: string; value: string | boolean }
  | { type: "session-loading"; id: string; messages?: AgentDialogMessage[] }
  | { type: "sessions-unavailable" }
  | { type: "open-install"; program: WsProgram }
  | { type: "close-install" }
  | { type: "set-install-dir"; dir: string }
  | { type: "install-began" }
  | { type: "install-local-fail" }
  | { type: "open-login"; program: WsProgram }
  | { type: "close-login" }
  | { type: "login-code-draft"; code: string }
  | { type: "messages-replace"; messages: AgentDialogMessage[] }
  | { type: "permission-chose"; id: string; name: string }
  | { type: "question-submitted"; id: string }
  | { type: "close-session"; program: WsProgram }
  | { type: "set-live-turns"; liveTurns: Record<string, true> }
  | {
      type: "restore-view";
      messages: AgentDialogMessage[];
      activeSession: string;
      draftRef?: string;
      sessions: DialogState["sessions"];
      sessionsSupported: boolean | null;
      sessionLoading: boolean;
      sessionPath?: string;
      sessionPathResolved?: boolean;
      models: DialogState["models"];
      modelSource: string;
      selectedModel: string;
      mode: DialogState["mode"];
      selectedMode: string;
      configOptions: DialogState["configOptions"];
      commands: DialogState["commands"];
    };

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function forCurrent(state: DialogState, frame: Record<string, unknown>): boolean {
  const program = str(frame.program);
  if (!program || !state.program) return true;
  return program === state.program;
}

function pushNotice(messages: AgentDialogMessage[], code: string, program: string): AgentDialogMessage[] {
  const last = messages[messages.length - 1];
  if (last && last.kind === "notice" && last.code === code && last.program === program) return messages;
  return [...messages, { kind: "notice", id: nextId(), code, program }];
}

function mapOpenTurn(
  state: DialogState,
  update: (items: TurnItem[]) => TurnItem[],
): DialogState {
  const messages = state.messages.slice();
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    // 回放（I6 `replay:true`）不发 done：一条用户消息之前的轮次不再接收后续回复。
    if (message.kind === "user") break;
    if (message.kind === "turn" && !message.stop) {
      messages[index] = { ...message, items: update(message.items) };
      return { ...state, messages };
    }
  }
  const turn: AgentDialogMessage = {
    kind: "turn",
    id: nextId(),
    acpSession: "",
    stop: "",
    items: update([]),
  };
  return { ...state, messages: [...messages, turn] };
}

function rememberSession(state: DialogState, frame: Record<string, unknown>): DialogState {
  const named = str(frame.program);
  const id = (isWsProgram(named) || named === "oceanleo") ? named : state.program;
  if (!id || state.opened.includes(id)) return state;
  return { ...state, opened: [...state.opened, id] };
}

function onTurnStart(state: DialogState, frame: Record<string, unknown>): DialogState {
  const acpSession = str(frame.acp_session);
  const last = state.messages[state.messages.length - 1];
  const base =
    last && last.kind === "turn" && !last.stop && last.acpSession === ""
      ? {
          ...state,
          messages: state.messages.slice(0, -1).concat({ ...last, acpSession }),
        }
      : {
          ...state,
          messages: [
            ...state.messages,
            { kind: "turn" as const, id: nextId(), acpSession, stop: "", items: [] },
          ],
        };
  return rememberSession(base, frame);
}

function appendText(
  state: DialogState,
  kind: "assistant" | "thought",
  text: string,
): DialogState {
  if (!text) return state;
  return mapOpenTurn(state, (items) => {
    const last = items[items.length - 1];
    if (last && last.kind === kind) {
      const copy = items.slice();
      copy[copy.length - 1] = { ...last, text: last.text + text };
      return copy;
    }
    return [...items, { kind, id: nextId(), text }];
  });
}

function onTool(state: DialogState, frame: Record<string, unknown>): DialogState {
  const id = str(frame.id);
  if (!id) return state;
  let found = false;
  const messages = state.messages.map((message) => {
    if (message.kind !== "turn") return message;
    let changed = false;
    const items = message.items.map((item) => {
      if (item.kind !== "tool" || item.tool.id !== id) return item;
      found = true;
      changed = true;
      return { ...item, tool: parseTool(frame, item.tool) };
    });
    return changed ? { ...message, items } : message;
  });
  if (found) return { ...state, messages };
  return mapOpenTurn({ ...state, messages }, (items) => [
    ...items,
    { kind: "tool", id: nextId(), tool: parseTool(frame) },
  ]);
}

function lastOfKind(items: TurnItem[], kind: TurnItem["kind"]): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].kind === kind) return index;
  }
  return -1;
}

function onPlan(state: DialogState, frame: Record<string, unknown>): DialogState {
  const entries = parsePlan(frame.entries);
  return mapOpenTurn(state, (items) => {
    const index = lastOfKind(items, "plan");
    if (index >= 0) {
      const copy = items.slice();
      const current = copy[index];
      if (current.kind === "plan") copy[index] = { ...current, entries };
      return copy;
    }
    return [...items, { kind: "plan", id: nextId(), entries }];
  });
}

function onUsage(state: DialogState, frame: Record<string, unknown>): DialogState {
  const used = typeof frame.used === "number" && Number.isFinite(frame.used) ? frame.used : 0;
  const size = typeof frame.size === "number" && Number.isFinite(frame.size) ? frame.size : 0;
  const cost = parseCost(frame.cost);
  return mapOpenTurn(state, (items) => {
    const index = lastOfKind(items, "usage");
    const next = { kind: "usage" as const, id: nextId(), used, size, cost };
    if (index >= 0) {
      const copy = items.slice();
      const current = copy[index];
      if (current.kind === "usage") copy[index] = { ...next, id: current.id };
      return copy;
    }
    return [...items, next];
  });
}

function onPermission(state: DialogState, frame: Record<string, unknown>): DialogState {
  const permId = str(frame.id);
  if (!permId) return state;
  const next = {
    title: str(frame.title),
    permKind: str(frame.kind),
    options: parseOptions(frame.options),
    toolTitle: toolTitleOf(frame.tool),
    auto: frame.auto === true,
  };
  let found = false;
  const messages = state.messages.map((message) => {
    if (message.kind !== "turn") return message;
    const items = message.items.map((item) => {
      if (item.kind !== "permission" || item.permId !== permId) return item;
      found = true;
      return { ...item, ...next, chosen: item.chosen };
    });
    return { ...message, items };
  });
  if (found) return { ...state, messages };
  return mapOpenTurn({ ...state, messages }, (items) => [
    ...items,
    { kind: "permission", id: nextId(), permId, chosen: "", ...next },
  ]);
}

function onQuestion(state: DialogState, frame: Record<string, unknown>): DialogState {
  const questionId = str(frame.id);
  if (!questionId) return state;
  return mapOpenTurn(state, (items) => {
    if (items.some((item) => item.kind === "question" && item.questionId === questionId)) return items;
    return [
      ...items,
      {
        kind: "question",
        id: nextId(),
        questionId,
        title: str(frame.title),
        detail: str(frame.detail),
        questions: frame.questions,
        submitted: false,
      },
    ];
  });
}

function onDone(state: DialogState, frame: Record<string, unknown>): DialogState {
  const stop = str(frame.stop);
  const session = str(frame.acp_session);
  const messages = state.messages.slice();
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.kind === "turn" && !message.stop) {
      messages[index] = { ...message, stop };
      break;
    }
  }
  const program = str(frame.program) || state.program;
  const ended = session || state.activeSession || state.draftRef || "";
  return markTurn({ ...state, messages }, program, ended, false);
}

function storedNoticeText(message: AgentDialogMessage): string {
  if (message.kind !== "notice") return "";
  return message.text ?? "";
}

// 防御（合同 I3 起 W2 已改发 login_failed busy，这里兜底旧节点）：登录卡开着时
// 收到 agent_busy，按 busy 失败收尾登录卡，不让它一直转「正在打开登录」。
// 登录卡属于它自己那张程序行，不挑当前选中的程序——oceanleo 是默认选中，
// 用户多半是在看着 oceanleo 时点 codex 的登录，所以必须放在 forCurrent 之前。
function finishLoginOnAgentBusy(
  state: DialogState,
  frame: Record<string, unknown>,
): DialogState {
  if (str(frame.t) !== "error" || str(frame.code) !== "agent_busy") return state;
  const open =
    state.login.open &&
    (state.login.pending || state.login.phase === "opening" || state.login.phase === "waiting");
  if (!open) return state;
  return { ...state, login: { ...state.login, phase: "failed", pending: false, failed: "busy" } };
}

function onError(state: DialogState, frame: Record<string, unknown>): DialogState {
  const code = str(frame.code) || "node_error";
  const program = str(frame.program);
  const text = str(frame.text).trim();
  const last = state.messages[state.messages.length - 1];
  const same =
    last !== undefined &&
    last.kind === "notice" &&
    last.code === code &&
    last.program === program &&
    storedNoticeText(last) === text && last.provider === (typeof frame.provider === "string" ? frame.provider : undefined) && last.model === (typeof frame.model === "string" ? frame.model : undefined);
  const base = { kind: "notice" as const, id: nextId(), code, program,
    ...(typeof frame.provider === "string" ? { provider: frame.provider } : {}),
    ...(typeof frame.model === "string" ? { model: frame.model } : {}),
  };
  const notice = text ? { ...base, text } : base;
  const session = str(frame.acp_session);
  const matches = !session || !state.activeSession || session === state.activeSession;
  const endsTurn = matches && TURN_END_ERRORS.has(code);
  const next = {
    ...state,
    agentBusy: code === "agent_busy" ? matches : state.agentBusy,
    offline: code === "computer_offline" ? true : state.offline,
    sessionLoading: matches ? false : state.sessionLoading,
    messages: same || !matches ? state.messages : [...state.messages, notice],
  };
  if (endsTurn) {
    return markTurn(next, program || state.program, session || state.activeSession || state.draftRef || "", false);
  }
  return next;
}

function installMatches(state: DialogState, frame: Record<string, unknown>): boolean {
  const program = str(frame.program);
  if (!program || !state.install.program) return true;
  return program === state.install.program;
}

function onFrame(state: DialogState, frame: Record<string, unknown>): DialogState {
  const kind = str(frame.t);
  if (kind === "status") return {
    ...state,
    programs: parsePrograms(frame.programs),
    offline: false,
    messages: state.messages.filter((message) => message.kind !== "notice" ||
      (message.code !== "computer_offline" && message.code !== "dialog_unreachable")),
  };
  if (kind === "install_progress" && installMatches(state, frame)) {
    const text = str(frame.text);
    if (!text) return state;
    return {
      ...state,
      install: {
        ...state.install,
        running: true,
        lines: [...state.install.lines, text].slice(-MAX_INSTALL_LINES),
      },
    };
  }
  if (kind === "install_done" && installMatches(state, frame)) {
    return {
      ...state,
      install: { ...state.install, running: false, donePath: str(frame.path), failedText: "" },
    };
  }
  if (kind === "install_failed" && installMatches(state, frame)) {
    return {
      ...state,
      install: {
        ...state.install,
        running: false,
        donePath: "",
        failedText: str(frame.text) || str(frame.code),
      },
    };
  }
  // 登录相位机（合同 I3 + W3-interface 映射表）：opening → waiting → done/failed。
  if (kind === "login_url") {
    return {
      ...state,
      login: {
        ...state.login,
        open: true,
        phase: "waiting",
        url: str(frame.url),
        code: str(frame.code),
        needsCode: frame.needs_code === true,
        hint: "",
        failed: "",
        pending: false,
      },
    };
  }
  if (kind === "login_hint") {
    // hint 可能先于 url 到（codex 先打印一行说明）：那也算进入 waiting。
    const phase = state.login.phase === "opening" || state.login.phase === "idle" ? "waiting" : state.login.phase;
    return {
      ...state,
      login: { ...state.login, open: true, phase, hint: str(frame.text), pending: false, failed: "" },
    };
  }
  if (kind === "login_failed") {
    return {
      ...state,
      login: {
        ...state.login,
        open: true,
        phase: "failed",
        pending: false,
        failed: str(frame.code) || "login_failed",
      },
    };
  }
  // login_done 不关卡：phase:"done" 亮绿一秒由 LoginCard 自己 closeLogin（W3-interface）。
  if (kind === "login_done") {
    return { ...state, login: { ...state.login, phase: "done", pending: false, failed: "" } };
  }
  // 登录卡的 agent_busy 兜底不挑当前程序（见 finishLoginOnAgentBusy 注释）。
  state = finishLoginOnAgentBusy(state, frame);
  if (!forCurrent(state, frame)) return state;
  if (kind === "sessions") {
    const liveTurns = { ...state.liveTurns };
    for (const session of Array.isArray(frame.busy) ? frame.busy : []) {
      if (typeof session === "string") liveTurns[turnKey(state.program, session)] = true;
    }
    const sessions = frame.supported === false ? [] : parseSessions(frame.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const listedPath = sessions.find((session) => session.id === state.activeSession)?.path || "";
    return {
      ...state,
      liveTurns,
      sessionsSupported: frame.supported !== false,
      sessions,
      serverActiveSession: str(frame.active),
      sessionPath: listedPath || state.sessionPath,
      sessionPathResolved: Boolean(listedPath) || state.sessionPathResolved,
    };
  }
  if (kind === "session_path") {
    const id = str(frame.acp_session);
    const path = conversationPath(frame.path);
    return {
      ...state,
      sessions: state.sessions.map((session) => (session.id === id ? { ...session, ...(path ? { path } : {}) } : session)),
      sessionPath: id === state.activeSession ? path : state.sessionPath,
      sessionPathResolved: id === state.activeSession ? true : state.sessionPathResolved,
    };
  }
  if (kind === "transcript") {
    const session = str(frame.acp_session);
    const frames = Array.isArray(frame.frames) ? frame.frames : [];
    const keptTurns = state.liveTurns;
    let next: DialogState = {
      ...state,
      activeSession: session || state.activeSession,
      sessionLoading: false,
      messages: [],
    };
    for (const raw of frames) {
      const item = asRecord(raw);
      if (item) next = onFrame(next, item);
    }
    const live = typeof frame.live === "boolean" ? frame.live : isLiveTurn(keptTurns, next.program, next.activeSession);
    const liveTurns = { ...keptTurns };
    if (live) liveTurns[turnKey(next.program, next.activeSession)] = true;
    else delete liveTurns[turnKey(next.program, next.activeSession)];
    return rememberSession({
      ...next,
      liveTurns,
      busy: live,
      busySession: live ? next.activeSession : "",
    }, frame);
  }
  if (kind === "session_opened") {
    const session = str(frame.acp_session);
    const opened = rememberSession(state, frame);
    const live = isLiveTurn(opened.liveTurns, opened.program, session);
    const path = conversationPath(frame.path) || opened.sessions.find((row) => row.id === session)?.path || "";
    return {
      ...opened,
      activeSession: session,
      sessionLoading: false,
      sessionPath: path,
      sessionPathResolved: Boolean(path),
      busy: live,
      busySession: live ? session : "",
    };
  }
  if (kind === "models") {
    const models = parseModels(frame.models);
    const source = str(frame.source);
    const fallback = models.find((model) => model.default)?.id ?? models[0]?.id ?? "";
    const configModel = state.configOptions.find((option) => option.id === "model" || option.category === "model");
    const selectedModel = (models.some((model) => model.id === state.selectedModel && model.usable !== false) ||
      (!models.some((model) => model.id === state.selectedModel) &&
        configModel?.options.some((option) => option.value === state.selectedModel)))
      ? state.selectedModel : fallback;
    return { ...state, models, modelSource: source, selectedModel };
  }
  if (kind === "config") {
    let configOptions = parseConfigOptions(frame.options);
    const mode = parseMode(frame.options);
    const model = configOptions.find((option) => option.id === "model" || option.category === "model");
    // A fresh view's choices belong to the user, not the spare session used
    // to discover the adapter's options. Existing history remains authoritative.
    if (!state.activeSession) {
      configOptions = configOptions.map((option) => {
        const previous = state.configOptions.find((item) => item.id === option.id);
        const want = option === model ? state.selectedModel
          : option.id === mode?.id ? state.selectedMode : previous?.current;
        return option.options.some((choice) => choice.value === String(want))
          ? { ...option, current: want as string | boolean } : option;
      });
    }
    const liveModel = configOptions.find((option) => option.id === model?.id);
    const liveMode = configOptions.find((option) => option.id === mode?.id);
    return {
      ...state,
      configOptions,
      mode: mode && liveMode ? { ...mode, current: String(liveMode.current) } : mode,
      selectedModel: typeof liveModel?.current === "string" ? liveModel.current : state.selectedModel,
      selectedMode: liveMode ? String(liveMode.current) : state.selectedMode,
    };
  }
  if (kind === "user_message") {
    const { text, attachments } = normalizeUserMessage(str(frame.text), frame.attachments);
    if (!text && attachments.length === 0) return state;
    const last = state.messages[state.messages.length - 1];
    if (
      frame.replay !== true &&
      last &&
      last.kind === "user" &&
      last.text === text
    ) {
      if (attachments.length && !last.attachments?.length) {
        return {
          ...state,
          messages: state.messages.slice(0, -1).concat({ ...last, attachments }),
        };
      }
      return state;
    }
    return {
      ...state,
      messages: [
        ...state.messages,
        { kind: "user", id: nextId(), text, replay: frame.replay === true, ...(attachments.length ? { attachments } : {}) },
      ],
    };
  }
  if (kind === "turn_start") {
    const started = onTurnStart(state, frame);
    const session = str(frame.acp_session);
    const program = str(frame.program) || started.program;
    let next = started;
    if (session && !started.activeSession) next = { ...next, activeSession: session };
    if (session) next = markTurn(next, program, "", false);
    next = markTurn(next, program, session || next.activeSession, true);
    return next;
  }
  if (kind === "delta") return appendText(state, "assistant", str(frame.text));
  if (kind === "thought") return appendText(state, "thought", str(frame.text));
  if (kind === "tool") return onTool(state, frame);
  if (kind === "plan") return onPlan(state, frame);
  if (kind === "usage") return onUsage(state, frame);
  if (kind === "permission") return onPermission(state, frame);
  if (kind === "question") return onQuestion(state, frame);
  if (kind === "commands") return { ...state, commands: parseCommands(frame.commands) };
  if (kind === "done") return onDone(state, frame);
  if (kind === "error" || kind === "notice") return onError(state, frame);
  // 未知帧：忽略并留一条 debug，不许当成「对话连不上」报错（P7 整面复核）。
  if (kind) console.debug("[agent-dialog] unknown frame ignored:", kind);
  return state;
}

export function applyDialog(state: DialogState, event: DialogEvent): DialogState {
  switch (event.type) {
    case "reset":
      return initialDialogState();
    case "frame":
      return onFrame(state, asRecord(event.frame) ?? {});
    case "notice":
      return { ...state, messages: pushNotice(state.messages, event.code, event.program) };
    case "program":
      return {
        ...state,
        program: event.program,
        models: [],
        modelSource: "",
        selectedModel: "",
        mode: null,
        selectedMode: "",
        configOptions: [],
        commands: [],
        sessions: [],
        sessionsSupported: null,
        activeSession: "",
        sessionPath: "",
        sessionPathResolved: false,
        sessionLoading: false,
        busy: false,
        agentBusy: false,
        busySession: "",
      };
    case "restore-view": {
      const next = {
        ...state,
        messages: event.messages,
        activeSession: event.activeSession,
        draftRef: event.draftRef,
        sessions: event.sessions,
        sessionsSupported: event.sessionsSupported,
        sessionLoading: event.sessionLoading,
        sessionPath: event.sessionPath ?? "",
        sessionPathResolved: event.sessionPathResolved ?? false,
        models: event.models,
        modelSource: event.modelSource,
        selectedModel: event.selectedModel,
        mode: event.mode,
        selectedMode: event.selectedMode,
        configOptions: event.configOptions,
        commands: event.commands,
      };
      const live = isLiveTurn(next.liveTurns, next.program, next.activeSession || next.draftRef || "");
      return { ...next, busy: live, busySession: live ? next.activeSession : "", agentBusy: false };
    }
    case "send-began":
      return markTurn(state, state.program, state.activeSession || state.draftRef || "", true);
    case "send-failed":
      return markTurn(
        {
          ...state,
          messages: pushNotice(state.messages, "dialog_unreachable", state.program ?? ""),
        },
        state.program,
        state.activeSession || state.draftRef || "",
        false,
      );
    case "user": {
      const { text, attachments } = normalizeUserMessage(event.text, event.attachments);
      return markTurn(
        {
          ...state,
          messages: [...state.messages, {
            kind: "user",
            id: nextId(),
            text,
            ...(attachments.length ? { attachments } : {}),
          }],
        },
        state.program,
        state.activeSession || state.draftRef || "",
        true,
      );
    }
    case "cancel-local":
      return markTurn({ ...state, agentBusy: false }, state.program, state.activeSession, false);
    case "clear-offline":
      // 已不在离线就原样返回：调用方可能在 effect 里每次挂载都发，别白造一帧渲染。
      return state.offline ? { ...state, offline: false } : state;
    case "set-model":
      return {
        ...state,
        selectedModel: event.id,
        // Fast/High belong to the current model. Drop them until the next
        // config frame; a leftover Fast selector would lie about the new model.
        configOptions: state.configOptions.filter((option) => isModelFamilyConfig(option, state.mode?.id)),
      };
    case "set-mode":
      return { ...state, selectedMode: event.value };
    case "set-config":
      return {
        ...state,
        configOptions: (
          event.id === "model"
            ? state.configOptions.filter((option) => isModelFamilyConfig(option, state.mode?.id))
            : state.configOptions
        ).map((option) =>
          option.id === event.id ? { ...option, current: event.value } : option,
        ),
        mode:
          state.mode?.id === event.id
            ? { ...state.mode, current: String(event.value) }
            : state.mode,
        selectedMode:
          state.mode?.id === event.id ? String(event.value) : state.selectedMode,
      };
    case "session-loading":
      return {
        ...state,
        activeSession: event.id,
        sessionLoading: true,
        sessionPath: state.sessions.find((session) => session.id === event.id)?.path || "",
        sessionPathResolved: Boolean(state.sessions.find((session) => session.id === event.id)?.path),
        messages: event.messages ?? [],
        commands: [],
        busy: isLiveTurn(state.liveTurns, state.program, event.id),
        busySession: isLiveTurn(state.liveTurns, state.program, event.id) ? event.id : "",
        agentBusy: false,
      };
    case "sessions-unavailable":
      return {
        ...state,
        sessions: [],
        sessionsSupported: false,
        activeSession: "",
        sessionPath: "",
        sessionPathResolved: false,
        sessionLoading: false,
      };
    case "open-install": {
      if (state.install.running && state.install.program && state.install.program !== event.program) {
        return { ...state, install: { ...state.install, open: true } };
      }
      const same = state.install.program === event.program;
      return {
        ...state,
        install: {
          ...state.install,
          open: true,
          program: event.program,
          dir: same ? state.install.dir : DEFAULT_INSTALL_DIR,
          lines: same ? state.install.lines : [],
          donePath: same ? state.install.donePath : "",
          failedText: same ? state.install.failedText : "",
        },
      };
    }
    case "close-install":
      return { ...state, install: { ...state.install, open: false } };
    case "set-install-dir":
      if (state.install.running) return state;
      return { ...state, install: { ...state.install, dir: event.dir } };
    case "install-began":
      return {
        ...state,
        install: { ...state.install, running: true, lines: [], donePath: "", failedText: "" },
      };
    case "install-local-fail":
      return {
        ...state,
        install: { ...state.install, running: false },
        messages: pushNotice(state.messages, "dialog_unreachable", state.install.program ?? ""),
      };
    case "open-login":
      return {
        ...state,
        login: { ...blankLogin(), open: true, program: event.program, pending: true, phase: "opening" },
      };
    case "close-login":
      return { ...state, login: { ...state.login, open: false, phase: "idle" } };
    case "login-code-draft":
      return { ...state, login: { ...state.login, codeDraft: event.code } };
    case "messages-replace":
      return { ...state, messages: event.messages };
    case "permission-chose":
      return {
        ...state,
        messages: state.messages.map((message) => {
          if (message.kind !== "turn") return message;
          return {
            ...message,
            items: message.items.map((item) => {
              if (item.kind !== "permission" || item.permId !== event.id || item.chosen) return item;
              return { ...item, chosen: event.name };
            }),
          };
        }),
      };
    case "close-session":
      return {
        ...state,
        opened: state.opened.filter((id) => id !== event.program),
        programs: state.programs.map((row) =>
          row.id === event.program ? { ...row, running: false } : row,
        ),
        liveTurns: Object.fromEntries(
          Object.entries(state.liveTurns ?? {}).filter(([key]) => !key.startsWith(`${event.program}::`)),
        ) as Record<string, true>,
        busy: state.program === event.program ? false : state.busy,
        agentBusy: state.program === event.program ? false : state.agentBusy,
      };
    case "question-submitted":
      return {
        ...state,
        messages: state.messages.map((message) => {
          if (message.kind !== "turn") return message;
          return {
            ...message,
            items: message.items.map((item) => {
              if (item.kind !== "question" || item.questionId !== event.id) return item;
              return { ...item, submitted: true };
            }),
          };
        }),
      };
    case "set-live-turns": {
      const live = isLiveTurn(event.liveTurns, state.program, state.activeSession || state.draftRef || "");
      return {
        ...state,
        liveTurns: event.liveTurns,
        busy: live,
        busySession: live ? state.activeSession : "",
      };
    }
    default:
      return state;
  }
}
