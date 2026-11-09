// Ordered rows → the view the transcript renders. Pure: the same rows always give the same view.
//
// Nothing here is stored or guessed by the gateway (contract §2.2): a turn is a client `session/prompt` row, and it
// is open until an agent response row carries the same JSON-RPC id. A response answers the latest EARLIER request
// with that id (ids restart when the gateway or the adapter restarts). An agent request is pending until a client
// response row with its id follows. Everything else is placed in the turn it arrived in, in row order.
// The `session/update` rows between a client `session/load` and its response are the agent replaying a conversation
// the task already shows from its earlier session rows: they render nothing (parent update 1, no dedupe).

import { parseRow } from "./parse";
import type {
  AcpBackgroundTask,
  AcpEvent,
  AcpFrameRow,
  AcpItem,
  AcpPermission,
  AcpToolCall,
  AcpTurn,
  AcpView,
  ContentBlock,
  JsonRpcError,
  JsonRpcId,
  PermissionOption,
  PlanEntry,
  SessionConfigOption,
  SessionMode,
  SessionModelInfo,
  SessionUpdate,
  ToolCallContent,
  ToolCallFields,
  ToolCallLocation,
  ToolCallStatus,
} from "./types";

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function idKey(id: JsonRpcId): string {
  return `${typeof id}:${id}`;
}

/** The plain text of a prompt or chunk; non-text blocks are kept in `blocks`. */
export function blocksText(blocks: readonly ContentBlock[]): string {
  return blocks.map((block) => (block.type === "text" ? block.text : "")).join("");
}

function finishedBackgroundState(state: string): boolean { return ["completed", "complete", "failed", "stopped", "cancelled", "canceled", "terminated", "ended"].includes(state.toLowerCase()); }

const TOOL_STATUSES = new Set<ToolCallStatus>(["pending", "in_progress", "completed", "failed"]);

function claudeMeta(value: unknown): Json {
  const meta = isRecord(value) ? value._meta : null;
  const claude = isRecord(meta) ? meta.claudeCode : null;
  return isRecord(claude) ? claude : {};
}

function applyToolFields(tool: AcpToolCall, fields: ToolCallFields): void {
  if (typeof fields.title === "string") tool.title = fields.title;
  if (typeof fields.kind === "string") tool.kind = fields.kind;
  if (typeof fields.status === "string" && TOOL_STATUSES.has(fields.status)) tool.status = fields.status;
  // ACP: `content` and `locations` replace the collection when present.
  if (Array.isArray(fields.content)) tool.content = fields.content.filter((part): part is ToolCallContent => isRecord(part));
  if (Array.isArray(fields.locations)) {
    tool.locations = fields.locations.filter((loc): loc is ToolCallLocation => isRecord(loc) && typeof loc.path === "string");
  }
  if (fields.rawInput !== undefined) tool.rawInput = fields.rawInput;
  if (fields.rawOutput !== undefined) tool.rawOutput = fields.rawOutput;
  const parent = str(claudeMeta(fields).parentToolUseId);
  if (parent) tool.parentId = parent;
}

function newTool(sessionId: string, fields: ToolCallFields, rowId: number): AcpToolCall {
  const tool: AcpToolCall = {
    id: fields.toolCallId,
    sessionId,
    title: "",
    kind: "other",
    status: "pending",
    content: [],
    locations: [],
    parentId: "",
    rowIds: [rowId],
  };
  applyToolFields(tool, fields);
  return tool;
}

function permissionOptions(params: unknown): PermissionOption[] {
  const options = isRecord(params) && Array.isArray(params.options) ? params.options : [];
  return options.flatMap((option): PermissionOption[] => {
    if (!isRecord(option) || typeof option.optionId !== "string") return [];
    return [{ optionId: option.optionId, name: str(option.name) || option.optionId, kind: str(option.kind) }];
  });
}

/** Hermes acknowledges a prompt sent during a running turn with one of these two fixed lines (hermes-acp). */
const HERMES_FOLLOWUP = /^(Redirected the active turn with your correction\.|Queued for the next turn\. \([0-9]+ queued\))$/;

type PendingClient = { method: string; params: unknown; turn: AcpTurn | null };

export function reduceRows(rows: readonly AcpFrameRow[], program = ""): AcpView {
  const view: AcpView = {
    preamble: [],
    turns: [],
    open: false,
    pending: [],
    modeId: null,
    modes: [],
    modelId: null,
    models: [],
    configOptions: null,
    usage: null,
    commands: [],
    title: null,
    plan: null,
    backgroundTasks: [],
    activity: null,
    exited: null,
    retrying: false,
  };
  const mainSessions = new Set<string>();
  const clientRequests = new Map<string, PendingClient>();
  const agentRequests = new Map<string, AcpPermission>();
  const tools = new Map<string, AcpToolCall>();
  const tasks = new Map<string, AcpBackgroundTask>();

  const openTurns = () => view.turns.filter((turn) => turn.open);
  const replaying = () => [...clientRequests.values()].some((request) => request.method === "session/load");
  /**
   * Where new output goes: the oldest open turn (Claude Code and Codex queue a prompt sent during a turn and answer
   * them in order), else the newest turn, else the preamble.
   */
  const target = (): AcpItem[] => {
    const open = openTurns();
    // Cursor: a prompt sent during a turn REPLACES it — Cursor answers the replaced prompt and the output that
    // follows belongs to the newer one.
    const turn = program === "cursor" ? open[open.length - 1] : open[0];
    // Its first output: a queued prompt's turn has started.
    if (turn) turn.queued = false;
    return (turn ?? view.turns[view.turns.length - 1])?.items ?? view.preamble;
  };
  /**
   * Programs that hold a prompt sent during a turn until that turn ends. Not Cursor (the new prompt replaces the
   * running one) and not Hermes (it says itself what it did with the prompt, see HERMES_FOLLOWUP).
   */
  const queues = program !== "cursor" && program !== "hermes";
  const push = (item: AcpItem) => target().push(item);

  /** Scope of a chunk: "" for the main conversation, else the sub-agent that produced it. */
  const scopeOf = (sessionId: string, update: SessionUpdate): string => {
    const parent = str(claudeMeta(update).parentToolUseId);
    if (parent) return `tool:${parent}`;
    if (!sessionId || mainSessions.size === 0 || mainSessions.has(sessionId)) return "";
    return `session:${sessionId}`;
  };

  const chunk = (row: AcpFrameRow, sessionId: string, update: Extract<SessionUpdate, { content: ContentBlock }>) => {
    if (!isRecord(update.content)) return;
    const block = update.content;
    const scope = scopeOf(sessionId, update);
    const items = target();
    const last = items[items.length - 1];
    const text = block.type === "text" ? block.text : "";
    if (update.sessionUpdate === "agent_thought_chunk") {
      if (last?.type === "thought" && last.scope === scope) {
        last.text += text;
        last.rowIds.push(row.id);
      } else {
        items.push({ type: "thought", key: `thought-${row.id}`, text, scope, rowIds: [row.id] });
      }
      return;
    }
    const role = update.sessionUpdate === "user_message_chunk" ? "user" : "agent";
    const messageId = str(update.messageId);
    if (
      last?.type === "message" &&
      last.role === role &&
      last.scope === scope &&
      (!messageId || !last.messageId || last.messageId === messageId)
    ) {
      last.text += text;
      last.blocks.push(block);
      last.rowIds.push(row.id);
      if (messageId) last.messageId = messageId;
      return;
    }
    items.push({ type: "message", key: `message-${row.id}`, role, text, blocks: [block], scope, messageId, rowIds: [row.id] });
  };

  const tool = (row: AcpFrameRow, sessionId: string, fields: ToolCallFields) => {
    if (typeof fields.toolCallId !== "string" || !fields.toolCallId) return;
    const key = `${sessionId}\u0000${fields.toolCallId}`;
    const known = tools.get(key);
    if (known) {
      applyToolFields(known, fields);
      known.rowIds.push(row.id);
      return;
    }
    // A `tool_call_update` for a call this page never saw still shows the step.
    const next = newTool(sessionId, fields, row.id);
    tools.set(key, next);
    push({ type: "tool", key: `tool-${row.id}`, tool: next });
  };

  const task = (row: AcpFrameRow, update: Extract<SessionUpdate, { asyncTaskId: string }>) => {
    if (typeof update.asyncTaskId !== "string" || !update.asyncTaskId) return;
    let entry = tasks.get(update.asyncTaskId);
    if (!entry) {
      entry = {
        id: update.asyncTaskId,
        name: "",
        taskType: "",
        description: "",
        summary: "",
        lastToolName: "",
        state: "running",
        canStop: false,
        toolCallId: "",
        outputFilePath: "",
        startedAt: row.received_at,
        updatedAt: row.received_at,
      };
      tasks.set(update.asyncTaskId, entry);
      view.backgroundTasks.push(entry);
    }
    const fields = update as Json;
    for (const name of ["name", "taskType", "description", "summary", "lastToolName", "toolCallId", "outputFilePath"] as const) {
      if (typeof fields[name] === "string") entry[name] = fields[name] as string;
    }
    if (typeof fields.canStop === "boolean") entry.canStop = fields.canStop;
    if (fields.backgroundState === "stale" || fields.backgroundState === "unknown" || fields.backgroundState === "running") entry.backgroundState = fields.backgroundState;
    if (update.sessionUpdate === "async_task_state_update" && typeof update.state === "string") entry.state = update.state;
    entry.updatedAt = row.received_at;
  };

  const sessionUpdate = (row: AcpFrameRow, sessionId: string, update: SessionUpdate) => {
    if (sessionId && mainSessions.size === 0) mainSessions.add(sessionId);
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
        view.retrying = false;
        if (program === "hermes" && isRecord(update.content) && update.content.type === "text") {
          const text = update.content.text.trim();
          if (HERMES_FOLLOWUP.test(text)) {
            // Hermes: this line answers the NEWEST prompt (it was redirected into, or queued behind, the running
            // turn); it is not part of the running turn's reply.
            const open = openTurns();
            const items = (open[open.length - 1] ?? view.turns[view.turns.length - 1])?.items ?? view.preamble;
            items.push({ type: "notice", key: `notice-${row.id}`, severity: "info", title: text, description: "", rowId: row.id });
            return;
          }
        }
        chunk(row, sessionId, update);
        return;
      case "agent_thought_chunk":
        view.retrying = false;
        chunk(row, sessionId, update);
        return;
      case "user_message_chunk":
        chunk(row, sessionId, update);
        return;
      case "tool_call":
      case "tool_call_update":
        tool(row, sessionId, update);
        return;
      case "plan": {
        const entries = Array.isArray(update.entries)
          ? update.entries.filter((entry): entry is PlanEntry => isRecord(entry) && typeof entry.content === "string")
          : [];
        view.plan = entries;
        push({ type: "plan", key: `plan-${row.id}`, entries, rowId: row.id });
        return;
      }
      case "available_commands_update":
        if (Array.isArray(update.availableCommands)) view.commands = update.availableCommands;
        return;
      case "current_mode_update":
        if (typeof update.currentModeId === "string") view.modeId = update.currentModeId;
        return;
      case "config_option_update":
        if (Array.isArray(update.configOptions)) view.configOptions = update.configOptions;
        return;
      case "session_info_update": {
        if (typeof update.title === "string") view.title = update.title;
        // Codex: codex-acp reports its thread's own activity here (`thread/status/changed`); with a goal Codex keeps
        // working after it answered the prompt, so the prompt response alone does not say it went idle.
        const codex = isRecord(update._meta) && isRecord(update._meta.codex) ? update._meta.codex : null;
        const status = codex && isRecord(codex.threadStatus) ? str(codex.threadStatus.type) : "";
        if (status === "active" || status === "idle") view.activity = status;
        return;
      }
      case "usage_update":
        if (typeof update.used === "number" && typeof update.size === "number") {
          view.usage = { used: update.used, size: update.size, ...(update.cost ? { cost: update.cost } : {}) };
        }
        return;
      case "notice": {
        const title = str(update.title);
        const description = str(update.description);
        const retryText = `${title} ${description}`.toLowerCase();
        if (retryText.includes("retry") || retryText.includes("重试") || retryText.includes("reconnect") || retryText.includes("重新连接")) view.retrying = true;
        push({
          type: "notice",
          key: `notice-${row.id}`,
          severity: str(update.severity),
          title,
          description,
          rowId: row.id,
        });
        return;
      }
      case "async_task_spawned":
      case "async_task_progress":
      case "async_task_state_update":
        task(row, update);
        return;
    }
  };

  const sessionResult = (result: unknown) => {
    if (!isRecord(result)) return;
    if (typeof result.sessionId === "string" && result.sessionId) mainSessions.add(result.sessionId);
    const modes = isRecord(result.modes) ? result.modes : null;
    if (modes) {
      if (typeof modes.currentModeId === "string") view.modeId = modes.currentModeId;
      if (Array.isArray(modes.availableModes)) view.modes = modes.availableModes.filter((mode): mode is SessionMode => isRecord(mode) && typeof mode.id === "string");
    }
    const models = isRecord(result.models) ? result.models : null;
    if (models) {
      if (typeof models.currentModelId === "string") view.modelId = models.currentModelId;
      if (Array.isArray(models.availableModels)) {
        view.models = models.availableModels.filter((model): model is SessionModelInfo => isRecord(model) && typeof model.modelId === "string");
      }
    }
    if (Array.isArray(result.configOptions)) view.configOptions = result.configOptions as SessionConfigOption[];
  };

  const agentResponse = (row: AcpFrameRow, id: JsonRpcId, result: unknown, error: JsonRpcError | undefined) => {
    const key = idKey(id);
    const request = clientRequests.get(key);
    if (!request) {
      push({ type: "unknown", key: `unknown-${row.id}`, row, reason: "response_without_request" });
      return;
    }
    clientRequests.delete(key);
    if (request.turn) {
      request.turn.open = false;
      if (error) request.turn.error = error;
      else if (isRecord(result) && typeof result.stopReason === "string") request.turn.stopReason = result.stopReason;
      return;
    }
    if (error) {
      push({ type: "error", key: `error-${row.id}`, method: request.method, error, rowId: row.id });
      return;
    }
    const params = isRecord(request.params) ? request.params : {};
    switch (request.method) {
      case "session/new":
      case "session/load":
      case "session/resume":
      case "session/fork":
        sessionResult(result);
        return;
      case "session/set_mode":
        if (typeof params.modeId === "string") view.modeId = params.modeId;
        return;
      case "session/set_model":
        if (typeof params.modelId === "string") view.modelId = params.modelId;
        return;
      case "session/set_config_option":
        if (isRecord(result) && Array.isArray(result.configOptions)) view.configOptions = result.configOptions as SessionConfigOption[];
        return;
    }
  };

  const agentRequest = (row: AcpFrameRow, id: JsonRpcId, method: string, params: unknown) => {
    const key = idKey(id);
    const known = agentRequests.get(key);
    // JSON-RPC ids are unique among outstanding requests: the same id while pending is the same request delivered
    // again, not a second card.
    if (known && known.state === "pending" && known.method === method) return;
    const sessionId = isRecord(params) ? str(params.sessionId) : "";
    let toolCall: AcpToolCall | null = null;
    if (method === "session/request_permission" && isRecord(params) && isRecord(params.toolCall)) {
      const fields = params.toolCall as ToolCallFields;
      const seen = tools.get(`${sessionId}\u0000${str(fields.toolCallId)}`);
      toolCall = seen ? { ...seen, rowIds: [...seen.rowIds] } : newTool(sessionId, { ...fields, toolCallId: str(fields.toolCallId) }, row.id);
      if (seen) applyToolFields(toolCall, fields);
    }
    const request: AcpPermission = {
      requestId: id,
      method,
      rowId: row.id,
      sessionId,
      params,
      options: method === "session/request_permission" ? permissionOptions(params) : [],
      toolCall,
      state: "pending",
      answerRowId: null,
    };
    agentRequests.set(key, request);
    push({ type: "request", key: `request-${row.id}`, request });
  };

  const event = (parsed: AcpEvent) => {
    const { row } = parsed;
    switch (parsed.kind) {
      case "update":
        if (!replaying()) sessionUpdate(row, parsed.sessionId, parsed.update);
        return;
      case "prompt": {
        if (parsed.sessionId) mainSessions.add(parsed.sessionId);
        // A prompt after an exit went to a process the gateway started again.
        view.exited = null;
        const queued = queues && openTurns().some((turn) => turn.sessionId === parsed.sessionId);
        const turn: AcpTurn = {
          key: `turn-${row.id}`,
          rowId: row.id,
          requestId: parsed.id,
          sessionId: parsed.sessionId,
          prompt: parsed.prompt,
          text: blocksText(parsed.prompt),
          items: [],
          open: true,
          stopReason: null,
          error: null,
          cancelRequested: false,
          exited: false,
          queued,
        };
        view.turns.push(turn);
        clientRequests.set(idKey(parsed.id), { method: "session/prompt", params: null, turn });
        return;
      }
      case "client_request": {
        const params = isRecord(parsed.params) ? parsed.params : {};
        if (typeof params.sessionId === "string" && params.sessionId) mainSessions.add(params.sessionId);
        clientRequests.set(idKey(parsed.id), { method: parsed.method, params: parsed.params, turn: null });
        return;
      }
      case "client_notification":
        if (parsed.method === "session/cancel") {
          const sessionId = isRecord(parsed.params) ? str(parsed.params.sessionId) : "";
          for (const turn of openTurns()) if (!sessionId || turn.sessionId === sessionId) turn.cancelRequested = true;
        }
        return;
      case "client_response": {
        const request = agentRequests.get(idKey(parsed.id));
        if (!request || request.state !== "pending") return;
        request.state = "answered";
        request.answerRowId = row.id;
        if (parsed.error) request.error = parsed.error;
        else request.result = parsed.result;
        return;
      }
      case "agent_response":
        agentResponse(row, parsed.id, parsed.result, parsed.error);
        return;
      case "agent_request":
        agentRequest(row, parsed.id, parsed.method, parsed.params);
        return;
      case "gap":
        push({ type: "gap", key: `gap-${row.id}`, from: parsed.from, to: parsed.to, count: parsed.count, rowId: row.id });
        return;
      case "oversize":
        push({ type: "oversize", key: `oversize-${row.id}`, bytes: parsed.bytes, rowId: row.id });
        return;
      case "exit":
        for (const task of tasks.values()) if (!finishedBackgroundState(task.state)) { task.state = "ended"; task.backgroundState = "stale"; task.canStop = false; }
        view.exited = { code: parsed.code, signal: parsed.signal };
        // The process that would answer these is gone: its open prompts and its unanswered requests end here. The
        // row says so; nothing is sent to anyone.
        for (const turn of openTurns()) {
          turn.open = false;
          turn.exited = true;
        }
        for (const request of agentRequests.values()) if (request.state === "pending") request.state = "ended";
        clientRequests.clear();
        push({ type: "exit", key: `exit-${row.id}`, code: parsed.code, signal: parsed.signal, rowId: row.id });
        return;
      case "unknown_update":
        if (!replaying()) push({ type: "unknown", key: `unknown-${row.id}`, row, reason: parsed.kind });
        return;
      case "agent_notification":
        push({ type: "unknown", key: `unknown-${row.id}`, row, reason: parsed.kind });
        return;
      case "unknown":
        push({ type: "unknown", key: `unknown-${row.id}`, row, reason: parsed.reason });
        return;
    }
  };

  // Row ids are the commit order (contract §2.1); a row delivered twice (backlog + live) counts once.
  const seen = new Set<number>();
  const ordered = [...rows].sort((a, b) => a.id - b.id);
  for (const row of ordered) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    event(parseRow(row));
  }

  // A background task's final state belongs on the tool row that launched it. The
  // strip only shows live tasks; completed / failed / stopped work therefore stays
  // in the ordered process timeline instead of becoming a trailing list.
  for (const background of tasks.values()) {
    if (!background.toolCallId) continue;
    for (const tool of tools.values()) {
      if (tool.id === background.toolCallId) tool.backgroundTask = background;
    }
  }

  view.open = view.turns.some((turn) => turn.open);
  view.pending = [...agentRequests.values()].filter((request) => request.state === "pending").sort((a, b) => a.rowId - b.rowId);
  return view;
}
