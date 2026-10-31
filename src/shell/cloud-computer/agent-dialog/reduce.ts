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
import { mergeLocalPreviews, normalizeUserMessage } from "./message-attachments";
import { blankOccupancy } from "./occupancy";
import { chatTimeMs } from "../../chat-time-separators";
import {
  hasOpenTurn,
  isRetriableStreamCancelText,
  turnHasUnfinishedWork,
  turnLooksSettled,
} from "./session-status";
import type {
  AgentDialogMessage,
  AgentProgram,
  DialogState,
  InstallState,
  LoginState,
  ToolCard,
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
  "node_error",
  "gateway_error",
  "dialog_unreachable",
  "dialog_detached",
  "invalid_argument",
]);

const COMPUTER_WIDE_ERRORS = new Set([
  "computer_offline",
  "computer_reconnecting",
  "dialog_unreachable",
  "acp_exited",
]);

function markLatestTurnLive(messages: DialogState["messages"]): DialogState["messages"] {
  const next = messages.slice();
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const message = next[index];
    if (message.kind === "user") break;
    if (message.kind === "turn" && !message.stop) {
      if (message.live) return messages;
      next[index] = { ...message, live: true };
      return next;
    }
  }
  return messages;
}

function armTurn(state: DialogState, frame: Record<string, unknown>): DialogState {
  if (frame.replay === true) return state;
  const program = str(frame.program) || state.program;
  const session = str(frame.acp_session) || state.activeSession || state.draftRef || "";
  if (!session) return state;
  const messages = markLatestTurnLive(state.messages);
  return noteProbeWorking(markTurn({ ...state, messages }, program, session, true), session);
}

function occupancyIds(busy: unknown): string[] {
  if (!Array.isArray(busy)) return [];
  return [...new Set(busy.filter((id): id is string => typeof id === "string" && Boolean(id)))];
}

function applyOccupancyBusy(state: DialogState, program: string, busyIds: string[]): DialogState {
  if (program && state.program && program !== state.program) return state;
  const busySet = new Set(busyIds);
  const prefix = `${state.program ?? ""}::`;
  const liveTurns = { ...state.liveTurns };
  const current = state.activeSession || state.draftRef || "";
  for (const key of Object.keys(liveTurns)) {
    if (!key.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    if (busySet.has(id)) continue;
    if (id === current && state.occupancyPendingAt != null) continue;
    delete liveTurns[key];
  }
  for (const id of busySet) {
    const key = turnKey(state.program, id);
    liveTurns[key] = true;
  }
  const currentKey = turnKey(state.program, current);
  const currentLive = Boolean(current && liveTurns[currentKey]);
  return {
    ...state,
    liveTurns,
    occupancyLink: true,
    occupancyAt: Date.now(),
    occupancyBusy: [...busySet],
    occupancyPendingAt: current && busySet.has(current) ? null : state.occupancyPendingAt,
    occupancyPendingSession: current && busySet.has(current) ? null : state.occupancyPendingSession,
    busy: currentLive,
    busySession: currentLive ? current : "",
  };
}

function applyOccupancyWaiting(state: DialogState, waitingIds: string[]): DialogState {
  return { ...state, occupancyWaiting: [...new Set(waitingIds.filter(Boolean))] };
}

function noteProbeWorking(state: DialogState, session: string): DialogState {
  if (!session) return state;
  const known = state.occupancyBusy ?? [];
  const occupancyBusy = known.includes(session) ? known : [...known, session];
  const current = state.activeSession || state.draftRef || "";
  return {
    ...state,
    occupancyLink: true,
    occupancyAt: Date.now(),
    occupancyBusy,
    occupancyPendingAt: session === current ? null : state.occupancyPendingAt,
    occupancyPendingSession: session === current ? null : state.occupancyPendingSession,
  };
}

function occupancyLost(state: DialogState): DialogState {
  return {
    ...state,
    occupancyLink: false,
    occupancyAt: null,
    occupancyBusy: [],
    occupancyWaiting: [],
  };
}

/** One session ended. This is not a full occupancy snapshot, so other live turns stay. */
function dropOccupancySession(state: DialogState, session: string): DialogState {
  if (!session) return state;
  const current = state.activeSession || state.draftRef || "";
  return {
    ...state,
    occupancyLink: true,
    occupancyAt: Date.now(),
    occupancyBusy: (state.occupancyBusy ?? []).filter((id) => id !== session),
    occupancyPendingAt: session === current ? null : state.occupancyPendingAt,
    occupancyPendingSession: session === current ? null : state.occupancyPendingSession,
  };
}

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

function stampOpenTurn(messages: DialogState["messages"], stop: string): DialogState["messages"] {
  const next = messages.slice();
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const message = next[index];
    if (message.kind === "turn" && !message.stop) {
      next[index] = { ...message, stop };
      break;
    }
  }
  return next;
}

function settleStoppingTurn(messages: DialogState["messages"], stop: string, session = ""): DialogState["messages"] {
  const next = messages.slice();
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const message = next[index];
    if (message.kind === "turn" && (message.stop === "stopping" || message.stop === "stopped") && (!session || message.acpSession === session)) {
      next[index] = { ...message, stop };
      // Output may arrive after the cancel request and create another open row.
      // The terminal frame closes that live output as well as the stopping row.
      return next.map((row) => row.kind === "turn" && row.live && !row.stop &&
        (!session || !row.acpSession || row.acpSession === session)
        ? { ...row, stop } : row);
    }
    if (!session && message.kind === "user") break;
  }
  if (!session) return stampOpenTurn(messages, stop);
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const message = next[index];
    if (message.kind === "turn" && !message.stop && (!message.acpSession || message.acpSession === session)) {
      next[index] = { ...message, stop };
      return next;
    }
  }
  return messages;
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
    ...blankOccupancy(),
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
    runningSessions: [],
    sessionLoading: false,
    historyOffset: 0,
    historyTotal: 0,
    hasOlder: false,
    historyLoading: false,
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
  /** The optimistic echo (last user bubble, same text) of a prompt the gateway refused before acknowledging it. */
  | { type: "drop-unsent"; text: string }
  /** `open_session` got no answer after the retry: stop the loading state. */
  | { type: "session-load-timeout"; acpSession: string }
  | { type: "occupancy-lost" }
  | { type: "occupancy-link"; up: boolean }
  | { type: "user"; text: string; attachments?: { name: string; mime: string; preview?: string }[] }
  | { type: "cancel-local" }
  | { type: "server-settled" }
  | { type: "clear-offline" }
  | { type: "set-model"; id: string }
  | { type: "set-mode"; value: string }
  | { type: "set-config"; id: string; value: string | boolean }
  | { type: "session-loading"; id: string; messages?: AgentDialogMessage[] }
  | { type: "history-loading" }
  | { type: "history-idle" }
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
      historyOffset?: number;
      historyTotal?: number;
      hasOlder?: boolean;
      historyLoading?: boolean;
      sessionPath?: string;
      sessionPathResolved?: boolean;
      models: DialogState["models"];
      modelSource: string;
      selectedModel: string;
      mode: DialogState["mode"];
      selectedMode: string;
      configOptions: DialogState["configOptions"];
      commands: DialogState["commands"];
      occupancyPendingAt?: number | null;
      occupancyPendingSession?: string | null;
    };

/** A user frame's own send time (ISO or epoch), when the gateway includes one; saved frames without it stay untimed. */
function frameTime(frame: Record<string, unknown>): { at?: number } {
  const at = chatTimeMs(frame.ts ?? frame.at ?? frame.created_at);
  return at === null ? {} : { at };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function forCurrent(state: DialogState, frame: Record<string, unknown>): boolean {
  const program = str(frame.program);
  if (!program || !state.program) return true;
  return program === state.program;
}

/** Remove the last user bubble when it is the (never acknowledged) echo of `text`. */
export function dropUnsentEcho(messages: AgentDialogMessage[], text: string): AgentDialogMessage[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.kind !== "user") continue;
    if (message.replay || message.text !== text) return messages;
    return [...messages.slice(0, index), ...messages.slice(index + 1)];
  }
  return messages;
}

function pushNotice(messages: AgentDialogMessage[], code: string, program: string): AgentDialogMessage[] {
  const last = messages[messages.length - 1];
  if (last && last.kind === "notice" && last.code === code && last.program === program) return messages;
  return [...messages, { kind: "notice", id: nextId(), code, program }];
}

type TurnMessage = Extract<AgentDialogMessage, { kind: "turn" }>;

function mapOpenTurnMessage(
  state: DialogState,
  update: (turn: TurnMessage) => TurnMessage,
): DialogState {
  const messages = state.messages.slice();
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    // 回放（I6 `replay:true`）不发 done：一条用户消息之前的轮次不再接收后续回复。
    if (message.kind === "user") break;
    if (message.kind === "turn" && !message.stop) {
      messages[index] = update(message);
      return { ...state, messages };
    }
  }
  const turn = update({
    kind: "turn",
    id: nextId(),
    acpSession: "",
    stop: "",
    items: [],
  });
  return { ...state, messages: [...messages, turn] };
}

function mapOpenTurn(
  state: DialogState,
  update: (items: TurnItem[]) => TurnItem[],
): DialogState {
  return mapOpenTurnMessage(state, (turn) => ({ ...turn, items: update(turn.items) }));
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function mergeTurnItems(older: TurnItem[], newer: TurnItem[]): TurnItem[] {
  if (!older.length) return newer;
  if (!newer.length) return older;
  const last = older[older.length - 1];
  const first = newer[0];
  if (last.kind === "assistant" && first.kind === "assistant") {
    return [...older.slice(0, -1), { ...last, text: last.text + first.text }, ...newer.slice(1)];
  }
  if (last.kind === "thought" && first.kind === "thought") {
    return [...older.slice(0, -1), { ...last, text: last.text + first.text }, ...newer.slice(1)];
  }
  return [...older, ...newer];
}

function mergeMessageLists(
  older: AgentDialogMessage[],
  newer: AgentDialogMessage[],
): AgentDialogMessage[] {
  if (!older.length) return newer;
  if (!newer.length) return older;
  const last = older[older.length - 1];
  const first = newer[0];
  if (last.kind === "turn" && first.kind === "turn" && last.acpSession === first.acpSession && !last.stop) {
    return [
      ...older.slice(0, -1),
      { ...first, items: mergeTurnItems(last.items, first.items), stop: first.stop || last.stop },
      ...newer.slice(1),
    ];
  }
  return [...older, ...newer];
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

// Claude Code's Task/Agent tool (claude-agent-acp AgentReporter: kind "think",
// title = the description). Other "think" tools are todo/task-list/findings/compaction.
const NOT_AGENT_LAUNCH = /^(Update TODOs|Create task|Update task|List tasks|Get task|Report findings|Report \d+ findings?\b|Compact conversation)/;

function isAgentLaunch(tool: ToolCard): boolean {
  return tool.kind === "think" && !tool.parent && !NOT_AGENT_LAUNCH.test(tool.title);
}

/** The new chunk carries on the sentence before it rather than starting a new message. */
function continuesText(before: string, next: string): boolean {
  if (/^[ \t,，、;；:：)）\]]/.test(next) || /^[a-z]/.test(next)) return true;
  return !/(?:[.!?。！？:：…]|\n)\s*$/.test(before);
}

/**
 * Saved sessions from before tool frames carried `parent`: a background
 * sub-agent's tool calls landed between two chunks of the parent's reply and
 * split it mid-sentence ("Point" · 1 step · " 2 (line width)…"). When the only
 * items since the previous text are tools that came after an Agent launch that
 * precedes that text, the chunk rejoins the text and those tools move under the
 * launch (one launch) or after the text (several, so the owner is unknown).
 */
function rejoinSubagentSplit(items: TurnItem[], text: string): TurnItem[] | null {
  const prev = lastOfKind(items, "assistant");
  const previous = items[prev];
  if (!previous || previous.kind !== "assistant" || prev === items.length - 1) return null;
  const between = items.slice(prev + 1);
  const tools: ToolCard[] = [];
  for (const item of between) {
    if (item.kind !== "tool" || isAgentLaunch(item.tool)) return null;
    tools.push(item.tool);
  }
  const launches = items
    .slice(0, prev)
    .filter((item): item is Extract<TurnItem, { kind: "tool" }> => item.kind === "tool" && isAgentLaunch(item.tool));
  if (!launches.length || !continuesText(previous.text, text)) return null;
  const merged: TurnItem = { ...previous, text: previous.text + text };
  if (launches.length === 1) {
    const owner = launches[0].tool.id;
    return items.slice(0, prev + 1).map((item, index) => {
      if (index === prev) return merged;
      if (item.kind !== "tool" || item.tool.id !== owner) return item;
      return { ...item, tool: { ...item.tool, children: [...(item.tool.children ?? []), ...tools] } };
    });
  }
  return [...items.slice(0, prev), merged, ...between];
}

function appendText(
  state: DialogState,
  kind: "assistant" | "thought",
  text: string,
): DialogState {
  if (!text) return state;
  const legacy = kind === "assistant" && (state.program === "claude" || !state.program);
  return mapOpenTurn(state, (items) => {
    const last = items[items.length - 1];
    if (last && last.kind === kind) {
      const copy = items.slice();
      copy[copy.length - 1] = { ...last, text: last.text + text };
      return copy;
    }
    const rejoined = legacy ? rejoinSubagentSplit(items, text) : null;
    if (rejoined) return rejoined;
    return [...items, { kind, id: nextId(), text }];
  });
}

/** `tool` (or a sub-agent step under it) updated by this frame; null when `id` is not in it. */
function updateToolTree(tool: ToolCard, id: string, frame: Record<string, unknown>): ToolCard | null {
  if (tool.id === id) return parseTool(frame, tool);
  if (!tool.children) return null;
  for (let index = 0; index < tool.children.length; index += 1) {
    const child = updateToolTree(tool.children[index], id, frame);
    if (!child) continue;
    const children = tool.children.slice();
    children[index] = child;
    return { ...tool, children };
  }
  return null;
}

/** `tool` with `child` under its launcher (any depth); null when the launcher is not in it. */
function addToolChild(tool: ToolCard, child: ToolCard): ToolCard | null {
  if (tool.id === child.parent) return { ...tool, children: [...(tool.children ?? []), child] };
  if (!tool.children) return null;
  for (let index = 0; index < tool.children.length; index += 1) {
    const nested = addToolChild(tool.children[index], child);
    if (!nested) continue;
    const children = tool.children.slice();
    children[index] = nested;
    return { ...tool, children };
  }
  return null;
}

/** Waiting sub-agent steps whose launcher is `tool` (or one of them), moved under it. */
function adoptOrphans(tool: ToolCard, orphans: ToolCard[]): { tool: ToolCard; rest: ToolCard[] } {
  let next = tool;
  let rest = orphans;
  for (let moved = true; moved && rest.length; ) {
    moved = false;
    const left: ToolCard[] = [];
    for (const orphan of rest) {
      const adopted = addToolChild(next, orphan);
      if (adopted) {
        next = adopted;
        moved = true;
      } else {
        left.push(orphan);
      }
    }
    rest = left;
  }
  return { tool: next, rest };
}

function onTool(state: DialogState, frame: Record<string, unknown>): DialogState {
  const id = str(frame.id);
  if (!id) return state;
  let found = false;
  const messages = state.messages.map((message) => {
    if (message.kind !== "turn") return message;
    let changed = false;
    const items = message.items.map((item) => {
      if (item.kind !== "tool") return item;
      const tool = updateToolTree(item.tool, id, frame);
      if (!tool) return item;
      found = true;
      changed = true;
      return { ...item, tool };
    });
    const orphans = message.orphans?.map((tool) => {
      const next = updateToolTree(tool, id, frame);
      if (!next) return tool;
      found = true;
      changed = true;
      return next;
    });
    return changed ? { ...message, items, ...(orphans ? { orphans } : {}) } : message;
  });
  if (found) return { ...state, messages };
  const tool = parseTool(frame);
  if (tool.parent) {
    // A background sub-agent's step: under its Task/Agent tool, never in the
    // main timeline (it would split the reply text it streams beside).
    let attached = false;
    const nested = messages.map((message) => {
      if (attached || message.kind !== "turn") return message;
      const items = message.items.map((item) => {
        if (attached || item.kind !== "tool") return item;
        const next = addToolChild(item.tool, tool);
        if (!next) return item;
        attached = true;
        return { ...item, tool: next };
      });
      return attached ? { ...message, items } : message;
    });
    if (attached) return { ...state, messages: nested };
    return mapOpenTurnMessage({ ...state, messages }, (turn) => ({
      ...turn,
      orphans: [...(turn.orphans ?? []), tool],
    }));
  }
  let launched = tool;
  const adopted = messages.map((message) => {
    if (message.kind !== "turn" || !message.orphans?.length) return message;
    const { tool: next, rest } = adoptOrphans(launched, message.orphans);
    if (next === launched) return message;
    launched = next;
    return { ...message, orphans: rest };
  });
  return mapOpenTurn({ ...state, messages: adopted }, (items) => [
    ...items,
    { kind: "tool", id: nextId(), tool: launched },
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
  const messages = settleStoppingTurn(state.messages, stop, session);
  const program = str(frame.program) || state.program;
  const ended = session || state.activeSession || state.draftRef || "";
  const next = markTurn({ ...state, messages }, program, ended, false);
  return dropOccupancySession(next, ended);
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
  if (isRetriableStreamCancelText(text) || isRetriableStreamCancelText(code)) {
    const session = str(frame.acp_session) || state.activeSession || state.draftRef || "";
    return session ? noteProbeWorking(state, session) : state;
  }
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
  const matches = session
    ? !state.activeSession || session === state.activeSession
    : !state.activeSession
      || COMPUTER_WIDE_ERRORS.has(code)
      || (code === "invalid_argument" && program === (state.program ?? ""));
  const endsTurn = matches && TURN_END_ERRORS.has(code);
  const next = {
    ...state,
    agentBusy: code === "agent_busy" ? matches : state.agentBusy,
    offline: code === "computer_offline" || code === "computer_reconnecting" ? true : state.offline,
    sessionLoading: matches ? false : state.sessionLoading,
    messages: same || !matches ? state.messages : [...state.messages, notice],
  };
  if (endsTurn) {
    const ended = session || state.activeSession || state.draftRef || "";
    const marked = markTurn({ ...next, messages: settleStoppingTurn(next.messages, code, session) }, program || state.program, ended, false);
    return dropOccupancySession(marked, ended);
  }
  if (code === "computer_offline" || code === "computer_reconnecting" || code === "dialog_unreachable") {
    return occupancyLost(next);
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
      (message.code !== "computer_offline" && message.code !== "computer_reconnecting" && message.code !== "dialog_unreachable")),
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
  if (kind === "occupancy") {
    if (!Array.isArray(frame.busy)) return state;
    let next = applyOccupancyBusy(state, str(frame.program) || state.program || "", occupancyIds(frame.busy));
    if (Array.isArray(frame.waiting)) next = applyOccupancyWaiting(next, occupancyIds(frame.waiting));
    return next;
  }
  if (kind === "sessions") {
    let next = Array.isArray(frame.busy)
      ? applyOccupancyBusy(state, str(frame.program) || state.program || "", occupancyIds(frame.busy))
      : state;
    if (Array.isArray(frame.waiting)) next = applyOccupancyWaiting(next, occupancyIds(frame.waiting));
    const sessions = frame.supported === false ? [] : parseSessions(frame.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const listedPath = sessions.find((session) => session.id === next.activeSession)?.path || "";
    const runningSessions = Array.isArray(frame.running)
      ? frame.running.filter((id): id is string => typeof id === "string" && Boolean(id))
      : next.runningSessions;
    return {
      ...next,
      runningSessions,
      sessionsSupported: frame.supported !== false,
      sessions,
      serverActiveSession: str(frame.active),
      sessionPath: listedPath || next.sessionPath,
      sessionPathResolved: Boolean(listedPath) || next.sessionPathResolved,
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
    const mode = str(frame.mode) || "replace";
    const incomingOffset = num(frame.offset) ?? 0;
    const incomingTotal = num(frame.total);
    if (mode === "prepend") {
      if (session && state.activeSession && session !== state.activeSession) {
        return { ...state, historyLoading: false };
      }
      if (!frames.length) {
        return { ...state, historyLoading: false, hasOlder: false };
      }
      if (incomingOffset >= state.historyOffset && state.historyOffset > 0) {
        return { ...state, historyLoading: false };
      }
      let prefix: DialogState = { ...state, messages: [], liveTurns: {}, busy: false, historyLoading: false };
      for (const raw of frames) {
        const item = asRecord(raw);
        if (item) prefix = onFrame(prefix, item);
      }
      return rememberSession({
        ...state,
        messages: mergeMessageLists(prefix.messages, state.messages),
        historyOffset: incomingOffset,
        historyTotal: incomingTotal ?? state.historyTotal,
        hasOlder: frame.has_older === true || incomingOffset > 0,
        historyLoading: false,
        sessionLoading: false,
      }, frame);
    }
    const keptTurns = state.liveTurns;
    let next: DialogState = {
      ...state,
      activeSession: session || state.activeSession,
      sessionLoading: false,
      historyLoading: false,
      historyOffset: incomingOffset,
      historyTotal: incomingTotal ?? frames.length,
      hasOlder: frame.has_older === true || incomingOffset > 0,
      messages: [],
    };
    for (const raw of frames) {
      const item = asRecord(raw);
      if (item) next = onFrame(next, item);
    }
    // An authoritative completed transcript disarms live evidence, including
    // adapters whose replay omitted done or left a tool in_progress.
    let messages = frame.live === false
      ? next.messages.map((message) => message.kind === "turn" ? { ...message, live: false } : message)
      : next.messages;
    const sid = next.activeSession;
    const program = next.program || "";
    if (
      frame.live === false &&
      hasOpenTurn(messages) &&
      next.occupancyPendingAt == null &&
      turnLooksSettled(messages) &&
      !turnHasUnfinishedWork(messages)
    ) {
      messages = stampOpenTurn(messages, "end_turn");
    }
    if (frame.live === false && state.messages.some((message) => message.kind === "turn" && message.stop === "stopping")) {
      messages = settleStoppingTurn(messages, "stopped", sid);
    }
    let occupied = { ...next, messages, liveTurns: { ...keptTurns } };
    if (typeof frame.live === "boolean" && sid) {
      if (frame.live) {
        occupied = noteProbeWorking(markTurn(occupied, program, sid, true), sid);
      } else if (occupied.occupancyPendingAt == null) {
        occupied = dropOccupancySession(markTurn(occupied, program, sid, false), sid);
      }
    } else if (sid && isLiveTurn(occupied.liveTurns, occupied.program, sid)) {
      occupied = noteProbeWorking(occupied, sid);
    }
    return rememberSession(occupied, frame);
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
    const models = parseModels(frame.models, str(frame.program));
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
    // An empty or mode-only update is not a new model catalog. Keep Fast/effort
    // that we already have so the chips do not blink out between frames.
    if (!configOptions.length) return state;
    const hasTuning = configOptions.some((option) => !isModelFamilyConfig(option, mode?.id));
    if (!hasTuning && !model) {
      const seen = new Set(configOptions.map((option) => option.id));
      configOptions = [
        ...configOptions,
        ...state.configOptions.filter((option) => !isModelFamilyConfig(option, state.mode?.id) && !seen.has(option.id)),
      ];
    }
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
      // The gateway's copy (archive ids) supersedes the optimistic echo; the
      // echo's local thumbnails stay on the same files.
      const serverRows = attachments.some((item) => item.archive);
      if (attachments.length && (!last.attachments?.length || serverRows)) {
        return {
          ...state,
          messages: state.messages.slice(0, -1).concat({ ...last, attachments: mergeLocalPreviews(attachments, last.attachments) }),
        };
      }
      return state;
    }
    return {
      ...state,
      messages: [
        ...state.messages,
        { kind: "user", id: nextId(), text, replay: frame.replay === true, ...(attachments.length ? { attachments } : {}), ...frameTime(frame) },
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
    if (session && started.draftRef) next = markTurn(next, program, started.draftRef, false);
    next = markTurn(next, program, session || next.activeSession, true);
    if (frame.replay !== true) next = { ...next, messages: markLatestTurnLive(next.messages) };
    return noteProbeWorking(next, session || next.activeSession);
  }
  if (kind === "delta") {
    const text = str(frame.text);
    if (isRetriableStreamCancelText(text)) return armTurn(state, frame);
    return text ? armTurn(appendText(state, "assistant", text), frame) : state;
  }
  if (kind === "thought") {
    const text = str(frame.text);
    return text ? armTurn(appendText(state, "thought", text), frame) : state;
  }
  if (kind === "tool") return str(frame.id) ? armTurn(onTool(state, frame), frame) : state;
  if (kind === "plan") return armTurn(onPlan(state, frame), frame);
  if (kind === "usage") return onUsage(state, frame);
  if (kind === "permission") return armTurn(onPermission(state, frame), frame);
  if (kind === "question") return armTurn(onQuestion(state, frame), frame);
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
        historyOffset: 0,
        historyTotal: 0,
        hasOlder: false,
        historyLoading: false,
        busy: false,
        agentBusy: false,
        busySession: "",
        ...blankOccupancy(),
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
        historyOffset: event.historyOffset ?? 0,
        historyTotal: event.historyTotal ?? 0,
        hasOlder: event.hasOlder ?? false,
        historyLoading: event.historyLoading ?? false,
        sessionPath: event.sessionPath ?? "",
        sessionPathResolved: event.sessionPathResolved ?? false,
        models: event.models,
        modelSource: event.modelSource,
        selectedModel: event.selectedModel,
        mode: event.mode,
        selectedMode: event.selectedMode,
        configOptions: event.configOptions,
        commands: event.commands,
        occupancyPendingAt: event.occupancyPendingAt ?? null,
        occupancyPendingSession: event.occupancyPendingSession ?? null,
      };
      const id = next.activeSession || next.draftRef || "";
      const live = isLiveTurn(next.liveTurns, next.program, id);
      return { ...next, busy: live, busySession: live ? next.activeSession : "", agentBusy: false };
    }
    case "send-began": {
      const pendingSession = state.activeSession || state.draftRef || "";
      return {
        ...markTurn(state, state.program, pendingSession, true),
        occupancyPendingAt: Date.now(),
        occupancyPendingSession: pendingSession || null,
      };
    }
    case "send-failed":
      return occupancyLost(markTurn(
        {
          ...state,
          sessionLoading: false,
          occupancyPendingAt: null,
          occupancyPendingSession: null,
          messages: pushNotice(state.messages, "dialog_unreachable", state.program ?? ""),
        },
        state.program,
        state.activeSession || state.draftRef || "",
        false,
      ));
    case "drop-unsent":
      return { ...state, messages: dropUnsentEcho(state.messages, event.text) };
    case "session-load-timeout":
      if (!state.sessionLoading || state.activeSession !== event.acpSession) return state;
      return {
        ...state,
        sessionLoading: false,
        messages: pushNotice(state.messages, "session_load_timeout", state.program ?? ""),
      };
    case "occupancy-lost":
      return occupancyLost(state);
    case "occupancy-link":
      return event.up
        ? { ...state, occupancyLink: true }
        : occupancyLost(state);
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
            at: Date.now(),
          }],
        },
        state.program,
        state.activeSession || state.draftRef || "",
        true,
      );
    }
    case "cancel-local": {
      return {
        ...state,
        // A cancel request is not a terminal frame. Keep server-confirmed busy
        // and pending-send state until done, transcript, or occupancy resolves it.
        messages: stampOpenTurn(state.messages, "stopping"),
      };
    }
    case "server-settled": {
      const session = state.activeSession || state.draftRef || "";
      return markTurn({
        ...state,
        occupancyPendingAt: null,
        occupancyPendingSession: null,
        messages: state.messages.some((message) => message.kind === "turn" && message.stop === "stopping")
          ? settleStoppingTurn(state.messages, "stopped", session) : state.messages,
      }, state.program, session, false);
    }
    case "clear-offline":
      // 已不在离线就原样返回：调用方可能在 effect 里每次挂载都发，别白造一帧渲染。
      return state.offline ? { ...state, offline: false } : state;
    case "set-model":
      return {
        ...state,
        selectedModel: event.id,
      };
    case "set-mode":
      return { ...state, selectedMode: event.value };
    case "set-config":
      return {
        ...state,
        configOptions: state.configOptions.map((option) =>
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
        historyOffset: 0,
        historyTotal: 0,
        hasOlder: false,
        historyLoading: false,
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
        historyOffset: 0,
        historyTotal: 0,
        hasOlder: false,
        historyLoading: false,
      };
    case "history-loading":
      return state.historyLoading ? state : { ...state, historyLoading: true };
    case "history-idle":
      return state.historyLoading ? { ...state, historyLoading: false } : state;
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
    case "close-session": {
      const closed = {
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
      return state.program === event.program ? occupancyLost(closed) : closed;
    }
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
