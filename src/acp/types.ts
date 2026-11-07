// ACP wire types the page renders, and the view model built from them.
//
// The schema subset is copied from `@agentclientprotocol/sdk` 1.8.0
// `dist/schema/types.gen.d.ts` (the SDK claude-agent-acp 0.90.0 bundles). The
// package itself is not a dependency: the page only needs the types, and every
// field is read defensively in parse.ts because adapters add fields freely.
// Non-standard update kinds the adapters on disk emit are typed below their
// standard neighbours with the adapter that sends them.

/** One stored line, as `GET /v1/tasks/{id}/frames` returns it. */
export type AcpFrameRow = {
  id: number;
  direction: "agent" | "client";
  node_seq: number | null;
  raw: string;
  received_at: string;
};

export type JsonRpcId = number | string;

export type JsonRpcError = { code: number; message: string; data?: unknown };

// ---- content -----------------------------------------------------------------

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string; uri?: string | null }
  | { type: "audio"; data: string; mimeType: string }
  | { type: "resource_link"; uri: string; name: string; title?: string | null; mimeType?: string | null; size?: number | null }
  | { type: "resource"; resource: { uri: string; text?: string; blob?: string; mimeType?: string | null } };

// ---- tool calls ----------------------------------------------------------------

export type ToolKind = "read" | "edit" | "delete" | "move" | "search" | "execute" | "think" | "fetch" | "switch_mode" | "other";
export type ToolCallStatus = "pending" | "in_progress" | "completed" | "failed";
export type ToolCallLocation = { path: string; line?: number | null };
export type ToolCallContent =
  | { type: "content"; content: ContentBlock }
  | { type: "diff"; path: string; oldText?: string | null; newText: string }
  | { type: "terminal"; terminalId: string };

/** `tool_call` (all fields) and `tool_call_update` (only `toolCallId` required). */
export type ToolCallFields = {
  toolCallId: string;
  title?: string | null;
  kind?: ToolKind | null;
  status?: ToolCallStatus | null;
  content?: ToolCallContent[] | null;
  locations?: ToolCallLocation[] | null;
  rawInput?: unknown;
  rawOutput?: unknown;
  _meta?: Record<string, unknown> | null;
};

// ---- plans, modes, config, usage ----------------------------------------------

export type PlanEntry = {
  content: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed";
};

export type SessionMode = { id: string; name: string; description?: string | null };
export type SessionModelInfo = { modelId: string; name: string; description?: string | null };

export type SessionConfigOption = {
  id: string;
  name: string;
  type?: string;
  category?: string | null;
  currentValue?: unknown;
  options?: unknown;
  [key: string]: unknown;
};

export type AvailableCommand = { name: string; description: string; input?: unknown };

export type UsageUpdate = { used: number; size: number; cost?: { amount: number; currency: string } | null };

export type StopReason = "end_turn" | "max_tokens" | "max_turn_requests" | "refusal" | "cancelled";

export type PermissionOptionKind = "allow_once" | "allow_always" | "reject_once" | "reject_always";
export type PermissionOption = { optionId: string; name: string; kind: PermissionOptionKind | string };

/** What `session/request_permission` is answered with (the `result` of the client response row). */
export type RequestPermissionOutcome =
  | { outcome: "cancelled" }
  | { outcome: "selected"; optionId: string };

/** `session/update` → `params.update`, discriminated by `sessionUpdate`. */
export type SessionUpdate =
  | { sessionUpdate: "user_message_chunk" | "agent_message_chunk" | "agent_thought_chunk"; content: ContentBlock; messageId?: string | null }
  | (ToolCallFields & { sessionUpdate: "tool_call" | "tool_call_update" })
  | { sessionUpdate: "plan"; entries: PlanEntry[] }
  | { sessionUpdate: "available_commands_update"; availableCommands: AvailableCommand[] }
  | { sessionUpdate: "current_mode_update"; currentModeId: string }
  | { sessionUpdate: "config_option_update"; configOptions: SessionConfigOption[] }
  | { sessionUpdate: "session_info_update"; title?: string | null; updatedAt?: string | null; _meta?: Record<string, unknown> | null }
  | ({ sessionUpdate: "usage_update" } & UsageUpdate)
  | { sessionUpdate: "notice"; severity: string; title: string; description?: string | null }
  // claude-agent-acp 0.90 / codex-acp 2.2 (AIR async tasks, only when the client advertises them).
  | { sessionUpdate: "async_task_spawned"; asyncTaskId: string; name?: string; taskType?: string; description?: string; canStop?: boolean; toolCallId?: string; outputFilePath?: string }
  | { sessionUpdate: "async_task_progress"; asyncTaskId: string; description?: string; summary?: string; lastToolName?: string; toolCallId?: string; outputFilePath?: string }
  | { sessionUpdate: "async_task_state_update"; asyncTaskId: string; state: string; summary?: string; toolCallId?: string; outputFilePath?: string };

/** Every `sessionUpdate` value parse.ts types; anything else is kept as `unknown_update`. */
export const KNOWN_SESSION_UPDATES = [
  "user_message_chunk",
  "agent_message_chunk",
  "agent_thought_chunk",
  "tool_call",
  "tool_call_update",
  "plan",
  "available_commands_update",
  "current_mode_update",
  "config_option_update",
  "session_info_update",
  "usage_update",
  "notice",
  "async_task_spawned",
  "async_task_progress",
  "async_task_state_update",
] as const;

// ---- parsed rows ---------------------------------------------------------------

type RowRef = { row: AcpFrameRow };

/** One row as a typed event. Nothing is dropped: an unreadable row is `unknown` with its raw line. */
export type AcpEvent =
  | (RowRef & { kind: "update"; sessionId: string; update: SessionUpdate })
  /** A `session/update` whose `sessionUpdate` this page does not know. */
  | (RowRef & { kind: "unknown_update"; sessionId: string; sessionUpdate: string; update: Record<string, unknown> })
  /** The agent asks the client something and waits (`session/request_permission`, `fs/*`, `terminal/*`, `cursor/*`, …). */
  | (RowRef & { kind: "agent_request"; id: JsonRpcId; method: string; params: unknown })
  /** Any other notification from the agent. */
  | (RowRef & { kind: "agent_notification"; method: string; params: unknown })
  /** The agent answers a client request (prompt → `stopReason`, set_* → result, or an error). */
  | (RowRef & { kind: "agent_response"; id: JsonRpcId; result?: unknown; error?: JsonRpcError })
  | (RowRef & { kind: "prompt"; id: JsonRpcId; sessionId: string; prompt: ContentBlock[] })
  /** Any other request the gateway wrote (`session/set_model`, `session/close`, `session/new`, …). */
  | (RowRef & { kind: "client_request"; id: JsonRpcId; method: string; params: unknown })
  /** A notification the gateway wrote (`session/cancel`). */
  | (RowRef & { kind: "client_notification"; method: string; params: unknown })
  /** The answer written back to an agent request (permission answer, method-not-found for fs/terminal). */
  | (RowRef & { kind: "client_response"; id: JsonRpcId; result?: unknown; error?: JsonRpcError })
  /** Node meta line: frames dropped while no gateway was attached (contract §2.3). */
  | (RowRef & { kind: "gap"; from: number; to: number; count: number })
  /** Node meta line: the agent process ended. */
  | (RowRef & { kind: "exit"; code: number | null; signal: string | null })
  /** Node meta line: one stdout line over 2 MiB was replaced. */
  | (RowRef & { kind: "oversize"; bytes: number })
  | (RowRef & { kind: "unknown"; reason: string; value?: unknown });

// ---- view model ----------------------------------------------------------------

export type AcpToolCall = {
  id: string;
  /** Session that owns the call; differs from the main session for a sub-agent's steps. */
  sessionId: string;
  title: string;
  kind: string;
  status: ToolCallStatus;
  content: ToolCallContent[];
  locations: ToolCallLocation[];
  rawInput?: unknown;
  rawOutput?: unknown;
  /** Claude: `_meta.claudeCode.parentToolUseId` — the Task/Agent call that runs this step. */
  parentId: string;
  /** Rows that built this call, in order (the `tool_call` and every `tool_call_update`). */
  rowIds: number[];
};

export type AcpPermission = {
  /** JSON-RPC id of the agent's request, sent back unchanged in `onAnswer`. */
  requestId: JsonRpcId;
  method: string;
  rowId: number;
  sessionId: string;
  params: unknown;
  /** `session/request_permission` only. */
  options: PermissionOption[];
  toolCall: AcpToolCall | null;
  /** `ended`: the agent process exited (node `exit` row) before anyone answered; nobody can answer it now. */
  state: "pending" | "answered" | "ended";
  /** The client response row's `result` / `error` once answered. */
  result?: unknown;
  error?: JsonRpcError;
  answerRowId: number | null;
};

export type AcpBackgroundTask = {
  id: string;
  name: string;
  taskType: string;
  description: string;
  summary: string;
  lastToolName: string;
  state: string;
  canStop: boolean;
  toolCallId: string;
  outputFilePath: string;
};

export type AcpItem =
  /**
   * Joined chunks. `scope` is "" for the main conversation, else the sub-agent that wrote it
   * (`tool:<parentToolUseId>` from Claude's `_meta.claudeCode`, or `session:<id>` for a child session).
   */
  | { type: "message"; key: string; role: "agent" | "user"; text: string; blocks: ContentBlock[]; scope: string; messageId: string; rowIds: number[] }
  | { type: "thought"; key: string; text: string; scope: string; rowIds: number[] }
  | { type: "tool"; key: string; tool: AcpToolCall }
  | { type: "plan"; key: string; entries: PlanEntry[]; rowId: number }
  | { type: "request"; key: string; request: AcpPermission }
  | { type: "notice"; key: string; severity: string; title: string; description: string; rowId: number }
  /** An agent error response to a client request other than the prompt (shown verbatim). */
  | { type: "error"; key: string; method: string; error: JsonRpcError; rowId: number }
  | { type: "gap"; key: string; from: number; to: number; count: number; rowId: number }
  | { type: "oversize"; key: string; bytes: number; rowId: number }
  | { type: "exit"; key: string; code: number | null; signal: string | null; rowId: number }
  | { type: "unknown"; key: string; row: AcpFrameRow; reason: string };

export type AcpTurn = {
  key: string;
  /** Client prompt row. */
  rowId: number;
  requestId: JsonRpcId;
  sessionId: string;
  prompt: ContentBlock[];
  /** Plain text of the prompt's text blocks. */
  text: string;
  items: AcpItem[];
  /** No agent response row for this prompt yet. */
  open: boolean;
  stopReason: string | null;
  /** The prompt's JSON-RPC error response, verbatim. */
  error: JsonRpcError | null;
  /** The user pressed Stop while this turn was open (a client `session/cancel` row). */
  cancelRequested: boolean;
  /** The agent process exited (node `exit` row) while this turn was open; no response can come any more. */
  exited: boolean;
  /**
   * Sent while an earlier prompt of the same session was still open, and no output of its own has arrived yet: the
   * program holds it until that turn ends. Stays true when the prompt is answered without ever running.
   */
  queued: boolean;
};

export type AcpView = {
  /** Rows before the first prompt (session/new replay, commands, …) in the same item shape. */
  preamble: AcpItem[];
  turns: AcpTurn[];
  /** Some prompt has no response yet (and its process has not exited). */
  open: boolean;
  /** Agent requests nobody answered yet, oldest first (any turn). */
  pending: AcpPermission[];
  modeId: string | null;
  modes: SessionMode[];
  modelId: string | null;
  models: SessionModelInfo[];
  configOptions: SessionConfigOption[] | null;
  usage: UsageUpdate | null;
  commands: AvailableCommand[];
  title: string | null;
  /** The latest `plan` update's entries (ACP sends the whole plan each time). */
  plan: PlanEntry[] | null;
  backgroundTasks: AcpBackgroundTask[];
  /** Codex: `session_info_update._meta.codex.threadStatus.type` (Codex keeps working after a prompt for goals). */
  activity: "active" | "idle" | null;
  exited: { code: number | null; signal: string | null } | null;
};
