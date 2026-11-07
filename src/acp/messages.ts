// The view model in the shapes the task chat's own components already render (rulings "One UI system"):
// `AgentTranscriptBubble` for words, gates and notices, `AgentProgress` for thoughts, tool steps and plans.
// Pure functions; the transcript component only maps over their output.

import type { AgentAttachment, AgentMessage } from "../lib/agent";
import type { AcpItem, AcpPermission, AcpToolCall, AcpTurn, AcpView, ContentBlock, JsonRpcError, ToolCallStatus } from "./types";

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** One thing on screen, in order. */
export type AcpBlock =
  | {
      type: "bubble";
      key: string;
      message: AgentMessage;
      streaming?: boolean;
      stopped?: boolean;
      request?: AcpPermission;
      /** A user prompt the program holds until the running turn ends (`AcpTurn.queued`, still open). */
      queued?: AcpTurn;
    }
  /** Consecutive thoughts / tool steps / plans of one turn: one foldable `AgentProgress`. */
  | { type: "process"; key: string; messages: AgentMessage[]; running: boolean }
  /** An agent request this page has no form for, still waiting: method and params as sent. */
  | { type: "raw-request"; key: string; request: AcpPermission };

/** The labels the transcript prints; the component passes them through `tt()`. */
export type AcpLabels = {
  gap: (count: number) => string;
  oversize: (bytes: number) => string;
  exit: (code: number | null, signal: string | null) => string;
  stopReason: (reason: string) => string;
  cancelled: string;
  permissionPrompt: string;
};

const TIMELINE_STATUS: Record<ToolCallStatus, string> = {
  pending: "pending",
  in_progress: "running",
  completed: "done",
  failed: "failed",
};

function toolCard(tool: AcpToolCall, children: AcpToolCall[]): Json {
  const content = tool.content.flatMap((part): Json[] => {
    if (part.type === "diff") return [{ type: "diff", path: part.path, old_text: part.oldText ?? "", new_text: part.newText }];
    if (part.type === "content" && isRecord(part.content)) {
      const block = part.content as ContentBlock;
      if (block.type === "text") return [{ type: "text", text: block.text }];
      if (block.type === "resource" && typeof block.resource?.text === "string") return [{ type: "text", text: block.resource.text }];
      if (block.type === "resource_link") return [{ type: "text", text: block.uri }];
    }
    return [];
  });
  return {
    id: tool.id,
    kind: tool.kind,
    title: tool.title,
    status: tool.status,
    content,
    locations: tool.locations.map((loc) => (typeof loc.line === "number" ? { path: loc.path, line: loc.line } : { path: loc.path })),
    ...(tool.rawInput !== undefined ? { rawInput: tool.rawInput } : {}),
    ...(tool.rawOutput !== undefined ? { rawOutput: tool.rawOutput } : {}),
    ...(children.length ? { children: children.map((child) => toolCard(child, [])) } : {}),
  };
}

function stepMessage(tool: AcpToolCall, children: AcpToolCall[]): AgentMessage {
  return {
    id: tool.rowIds[0] ?? 0,
    role: "assistant",
    kind: "step",
    content: tool.title,
   
    meta: { native: true, tool_status: TIMELINE_STATUS[tool.status], tool_card: toolCard(tool, children) },
  };
}

function errorText(error: JsonRpcError): string {
  const data = error.data === undefined ? "" : typeof error.data === "string" ? error.data : JSON.stringify(error.data, null, 2);
  return [error.message, data].filter(Boolean).join("\n");
}

function attachments(blocks: readonly ContentBlock[]): AgentAttachment[] {
  return blocks.flatMap((block): AgentAttachment[] => {
    if (block.type === "resource_link") return [{ url: "", name: block.title || block.name, ...(block.mimeType ? { mime: block.mimeType } : {}) }];
    // Names only: a prompt's file reference is a path or link on the user's side, never fetched from here.
    if (block.type === "image") return [{ url: "", name: block.uri?.split("/").pop() || block.mimeType, mime: block.mimeType, media_type: "image" }];
    if (block.type === "resource") return [{ url: "", name: block.resource.uri.split("/").pop() || block.resource.uri }];
    return [];
  });
}

function chosenLabel(request: AcpPermission, labels: AcpLabels): string {
  if (request.state !== "answered") return "";
  if (request.error) return request.error.message || String(request.error.code);
  const outcome = isRecord(request.result) && isRecord(request.result.outcome) ? request.result.outcome : null;
  if (!outcome) return "";
  if (outcome.outcome === "cancelled") return labels.cancelled;
  const id = str(outcome.optionId);
  return request.options.find((option) => option.optionId === id)?.name || id;
}

function requestState(request: AcpPermission): string {
  return request.state === "pending" ? "waiting" : request.state === "ended" ? "expired" : "answered";
}

function permissionMessage(request: AcpPermission, labels: AcpLabels): AgentMessage {
  const prompt = request.toolCall?.title || labels.permissionPrompt;
  return {
    id: request.rowId,
    role: "assistant",
    kind: "gate",
    content: prompt,
   
    meta: {
      gate_prompt: prompt,
      native_permission: {
        permId: String(request.requestId),
        options: request.options.map((option) => ({ id: option.optionId, name: option.name, kind: option.kind })),
        chosen: chosenLabel(request, labels),
        actionable: request.state === "pending",
        requestState: requestState(request),
      },
    },
  };
}

/** Cursor: `cursor/ask_question` and `cursor/create_plan` are its own requests; their forms live here. */
export function isCursorQuestion(method: string): boolean {
  return method === "cursor/ask_question" || method === "cursor/create_plan";
}

function cursorQuestionMessage(request: AcpPermission): AgentMessage {
  const params = isRecord(request.params) ? request.params : {};
  const plan = request.method === "cursor/create_plan";
  // Cursor nests the questions at `params.questions` (older builds sent the list itself).
  const questions = plan
    ? [{ id: "__plan__", prompt: str(params.name) || str(params.overview) || request.method, options: [{ id: "accepted", label: "accepted" }, { id: "rejected", label: "rejected" }] }]
    : Array.isArray(request.params) ? request.params : Array.isArray(params.questions) ? params.questions : [];
  const first = isRecord(questions[0]) ? questions[0] : {};
  const title = str(params.title) || str(params.name) || str(params.overview) || str(first.prompt);
  return {
    id: request.rowId,
    role: "assistant",
    kind: "gate",
    content: title,
   
    meta: {
      gate_prompt: title,
      native_question: {
        questionId: String(request.requestId),
        detail: str(params.plan),
        questions,
        submitted: request.state === "answered",
        actionable: request.state === "pending",
        requestState: requestState(request),
      },
    },
  };
}

/**
 * Cursor: the JSON-RPC result it reads as `result.outcome.outcome` (same rules the old gateway used).
 * `values` is what the question form submits: `{ [questionId]: "id1,id2" }` or `{ text }`.
 */
export function cursorAnswerResult(method: string, values: unknown): Json {
  const raw = isRecord(values) ? values : {};
  if (method === "cursor/create_plan") {
    return { outcome: { outcome: str(raw.__plan__) === "accepted" ? "accepted" : "rejected" } };
  }
  const answers: Json[] = [];
  for (const [questionId, value] of Object.entries(raw)) {
    if (questionId === "text") continue;
    const ids = (Array.isArray(value) ? value.map(String) : String(value ?? "").split(",")).map((id) => id.trim()).filter(Boolean);
    if (ids.length) answers.push({ questionId, selectedOptionIds: ids });
  }
  return answers.length ? { outcome: { outcome: "answered", answers } } : { outcome: { outcome: "skipped" } };
}

function bubble(key: string, id: number, kind: string, content: string, meta?: AgentMessage["meta"]): AcpBlock {
  return { type: "bubble", key, message: { id, role: "assistant", kind, content, ...(meta ? { meta } : {}) } };
}

/**
 * Items of one container (the preamble or a turn) → blocks. `live`: the container is still producing output, so its
 * last process block runs and its last text streams.
 */
export function itemBlocks(items: readonly AcpItem[], live: boolean, labels: AcpLabels): AcpBlock[] {
  const blocks: AcpBlock[] = [];
  const known = new Set(items.flatMap((item) => (item.type === "tool" ? [item.tool.id] : [])));
  const childrenOf = new Map<string, AcpToolCall[]>();
  for (const item of items) {
    if (item.type !== "tool" || !item.tool.parentId || !known.has(item.tool.parentId)) continue;
    const list = childrenOf.get(item.tool.parentId) ?? [];
    list.push(item.tool);
    childrenOf.set(item.tool.parentId, list);
  }
  let process: AgentMessage[] = [];
  let processKey = "";
  const flush = () => {
    if (process.length) blocks.push({ type: "process", key: processKey, messages: process, running: false });
    process = [];
    processKey = "";
  };
  const addProcess = (key: string, message: AgentMessage) => {
    if (!process.length) processKey = `process-${key}`;
    process.push(message);
  };
  for (const item of items) {
    switch (item.type) {
      case "thought":
        if (item.text.trim()) addProcess(item.key, { id: item.rowIds[0] ?? 0, role: "assistant", kind: "analysis", content: item.text, meta: { native: true } });
        break;
      case "tool":
        if (item.tool.parentId && known.has(item.tool.parentId)) break;
        addProcess(item.key, stepMessage(item.tool, childrenOf.get(item.tool.id) ?? []));
        break;
      case "plan":
        addProcess(item.key, {
          id: item.rowId,
          role: "assistant",
          kind: "plan",
          content: "",
         
          meta: { native: true, plan_entries: item.entries },
        });
        break;
      case "message":
        // A sub-agent's words are part of the process, not words to the user.
        if (item.scope) {
          if (item.text.trim()) addProcess(item.key, { id: item.rowIds[0] ?? 0, role: "assistant", kind: "analysis", content: item.text, meta: { native: true } });
          break;
        }
        flush();
        if (item.role === "user") {
          const files = attachments(item.blocks);
          blocks.push({
            type: "bubble",
            key: item.key,
            message: { id: item.rowIds[0] ?? 0, role: "user", kind: "text", content: item.text, ...(files.length ? { meta: { attachments: files } } : {}) },
          });
        } else if (item.text) {
          blocks.push(bubble(item.key, item.rowIds[0] ?? 0, "text", item.text, { native: true }));
        }
        break;
      case "request":
        flush();
        if (item.request.method === "session/request_permission") {
          blocks.push({ type: "bubble", key: item.key, message: permissionMessage(item.request, labels), request: item.request });
        } else if (isCursorQuestion(item.request.method)) {
          blocks.push({ type: "bubble", key: item.key, message: cursorQuestionMessage(item.request), request: item.request });
        } else if (item.request.state === "pending") {
          blocks.push({ type: "raw-request", key: item.key, request: item.request });
        }
        break;
      case "notice":
        flush();
        blocks.push(bubble(item.key, item.rowId, item.severity === "error" ? "error" : "notice", [item.title, item.description].filter(Boolean).join("\n")));
        break;
      case "error":
        flush();
        blocks.push(bubble(item.key, item.rowId, "error", errorText(item.error)));
        break;
      case "gap":
        flush();
        blocks.push(bubble(item.key, item.rowId, "notice", labels.gap(item.count), { native_notice: "gap" }));
        break;
      case "oversize":
        flush();
        blocks.push(bubble(item.key, item.rowId, "notice", labels.oversize(item.bytes), { native_notice: "oversize" }));
        break;
      case "exit":
        flush();
        blocks.push(bubble(item.key, item.rowId, "notice", labels.exit(item.code, item.signal), { native_notice: "exit" }));
        break;
      case "unknown":
        break;
    }
  }
  flush();
  if (live) {
    const last = blocks[blocks.length - 1];
    if (last?.type === "process") last.running = true;
    if (last?.type === "bubble" && last.message.kind === "text" && last.message.role === "assistant") last.streaming = true;
  }
  return blocks;
}

/**
 * The page can send a prompt again only as text: the rows keep a file's bytes, not the Library upload it came from.
 */
export function resendable(turn: AcpTurn): boolean {
  return Boolean(turn.text.trim()) && turn.prompt.every((block) => block.type === "text");
}

/** The user's prompt, then the turn's output, then how the turn ended when that is something to see. */
export function turnBlocks(turn: AcpTurn, live: boolean, labels: AcpLabels): AcpBlock[] {
  const files = attachments(turn.prompt);
  const prompt: AcpBlock = {
    type: "bubble",
    key: turn.key,
    message: { id: turn.rowId, role: "user", kind: "text", content: turn.text, ...(files.length ? { meta: { attachments: files } } : {}) },
    ...(turn.open && turn.queued ? { queued: turn } : {}),
  };
  const blocks = [prompt, ...itemBlocks(turn.items, live, labels)];
  if (turn.error) blocks.push(bubble(`${turn.key}-error`, turn.rowId, "error", errorText(turn.error)));
  if (turn.stopReason === "cancelled") {
    let text: Extract<AcpBlock, { type: "bubble" }> | undefined;
    for (const block of blocks) {
      if (block.type === "bubble" && block.message.role === "assistant" && block.message.kind === "text") text = block;
    }
    if (text) text.stopped = true;
    else blocks.push(bubble(`${turn.key}-stop`, turn.rowId, "notice", labels.cancelled, { native_notice: "cancelled" }));
  } else if (turn.stopReason && turn.stopReason !== "end_turn") {
    blocks.push(bubble(`${turn.key}-stop`, turn.rowId, "notice", labels.stopReason(turn.stopReason), { native_notice: turn.stopReason }));
  }
  return blocks;
}

/** Every block of the view, in order. The last turn is live while it is open or (Codex) its thread is active. */
export function viewBlocks(view: AcpView, labels: AcpLabels): AcpBlock[] {
  const lastTurn = view.turns[view.turns.length - 1];
  const blocks = itemBlocks(view.preamble, false, labels);
  for (const turn of view.turns) {
    const live = turn.open || (turn === lastTurn && !turn.exited && view.activity === "active");
    blocks.push(...turnBlocks(turn, live, labels));
  }
  return blocks;
}
