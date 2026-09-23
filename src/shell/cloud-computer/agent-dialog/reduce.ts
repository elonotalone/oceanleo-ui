// 把网关帧收成面板状态。这里不碰 WebSocket，方便对照协议逐帧看落点。

import { DEFAULT_INSTALL_DIR } from "./install-dir";
import {
  asRecord,
  isWsProgram,
  parseCommands,
  parseCost,
  parseMode,
  parseModels,
  parseOptions,
  parsePlan,
  parsePrograms,
  parseTool,
  toolTitleOf,
} from "./parse";
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
  | { type: "user"; text: string }
  | { type: "cancel-local" }
  | { type: "clear-offline" }
  | { type: "set-model"; id: string }
  | { type: "set-mode"; value: string }
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
  | { type: "close-session"; program: WsProgram };

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
  const id = isWsProgram(named) ? named : state.program;
  if (!id || !isWsProgram(id) || state.opened.includes(id)) return state;
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
        questions: frame.questions,
        submitted: false,
      },
    ];
  });
}

function onCommands(state: DialogState, frame: Record<string, unknown>): DialogState {
  const commands = parseCommands(frame.commands);
  return mapOpenTurn(state, (items) => [...items, { kind: "commands", id: nextId(), commands }]);
}

function onDone(state: DialogState, frame: Record<string, unknown>): DialogState {
  const stop = str(frame.stop);
  const messages = state.messages.slice();
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.kind === "turn" && !message.stop) {
      messages[index] = { ...message, stop };
      break;
    }
  }
  return { ...state, messages, busy: false, agentBusy: false };
}

function storedNoticeText(message: AgentDialogMessage): string {
  if (message.kind !== "notice") return "";
  const raw = (message as { text?: unknown }).text;
  return typeof raw === "string" ? raw : "";
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
    storedNoticeText(last) === text;
  const base = { kind: "notice" as const, id: nextId(), code, program };
  const notice = text ? { ...base, text } : base;
  return {
    ...state,
    busy: false,
    agentBusy: code === "agent_busy",
    offline: code === "computer_offline" ? true : state.offline,
    messages: same ? state.messages : [...state.messages, notice],
  };
}

function installMatches(state: DialogState, frame: Record<string, unknown>): boolean {
  const program = str(frame.program);
  if (!program || !state.install.program) return true;
  return program === state.install.program;
}

function onFrame(state: DialogState, frame: Record<string, unknown>): DialogState {
  const kind = str(frame.t);
  if (kind === "status") return { ...state, programs: parsePrograms(frame.programs) };
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
  if (kind === "models") {
    const models = parseModels(frame.models);
    const source = str(frame.source);
    const fallback = models.find((model) => model.default)?.id ?? models[0]?.id ?? "";
    const selected = models.some((model) => model.id === state.selectedModel)
      ? state.selectedModel
      : fallback;
    return { ...state, models, modelSource: source, selectedModel: selected };
  }
  if (kind === "config") {
    const mode = parseMode(frame.options);
    if (!mode) return state;
    return { ...state, mode, selectedMode: mode.current || state.selectedMode };
  }
  if (kind === "turn_start") return onTurnStart(state, frame);
  if (kind === "delta") return appendText(state, "assistant", str(frame.text));
  if (kind === "thought") return appendText(state, "thought", str(frame.text));
  if (kind === "tool") return onTool(state, frame);
  if (kind === "plan") return onPlan(state, frame);
  if (kind === "usage") return onUsage(state, frame);
  if (kind === "permission") return onPermission(state, frame);
  if (kind === "question") return onQuestion(state, frame);
  if (kind === "commands") return onCommands(state, frame);
  if (kind === "done") return onDone(state, frame);
  if (kind === "error") return onError(state, frame);
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
      if (state.busy) return state;
      return {
        ...state,
        program: event.program,
        models: [],
        modelSource: "",
        selectedModel: "",
        mode: null,
        selectedMode: "",
      };
    case "send-began":
      return { ...state, busy: true };
    case "send-failed":
      return {
        ...state,
        busy: false,
        messages: pushNotice(state.messages, "dialog_unreachable", state.program ?? ""),
      };
    case "user":
      return {
        ...state,
        busy: true,
        messages: [...state.messages, { kind: "user", id: nextId(), text: event.text }],
      };
    case "cancel-local":
      return { ...state, busy: false, agentBusy: false };
    case "clear-offline":
      // 已不在离线就原样返回：调用方可能在 effect 里每次挂载都发，别白造一帧渲染。
      return state.offline ? { ...state, offline: false } : state;
    case "set-model":
      return { ...state, selectedModel: event.id };
    case "set-mode":
      return { ...state, selectedMode: event.value };
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
    default:
      return state;
  }
}
