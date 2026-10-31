import type { AgentMessage } from "./agent";


export interface AgentMessageRenderItem {
  type: "message";
  key: string;
  message: AgentMessage;
  index: number;
}

export interface AgentProgressRenderItem {
  type: "progress";
  key: string;
  /**
   * One run of consecutive process in a turn, in real order: plans, thoughts
   * (`analysis`, interim rows, and a reply's or a speech row's `meta.reasoning`
   * as a synthetic `analysis` row with `meta.reasoning === true`) and tool
   * steps. Never words the agent said to the user (2026-10-31 invariant).
   */
  messages: AgentMessage[];
  startIndex: number;
  endIndex: number;
}

export type AgentRenderItem =
  | AgentMessageRenderItem
  | AgentProgressRenderItem;

export type ProcessToolStatus = "pending" | "running" | "done" | "failed";

export type ProcessToolContent =
  | { type: "text"; text: string }
  | { type: "diff"; path: string; oldText: string; newText: string }
  | { type: "terminal"; output: string };

export interface ProcessPlanItem {
  content: string;
  status: "pending" | "in_progress" | "completed" | "";
  priority: "high" | "medium" | "low" | "";
}

export interface ProcessToolEntry {
  type: "tool";
  key: string;
  title: string;
  /** ACP tool kind (`read`, `edit`, `execute`, …) or one guessed from a cloud tool name. */
  kind: string;
  status: ProcessToolStatus;
  content: ProcessToolContent[];
  locations: { path: string; line?: number }[];
  args: string;
  result: string;
  error: string;
  /** A Task/Agent step's background sub-agent steps (native `tool_card.children`). */
  children?: ProcessToolEntry[];
}

export type ProcessEntry =
  | {
      type: "thought";
      key: string;
      text: string;
      /** One-line preview: the row's `meta.summary` or the first prose line. */
      summary: string;
      /** Reasoning time when the gateway reported it (`meta.reasoning_ms`). */
      ms: number | null;
      /** The model is still writing this thought. */
      streaming: boolean;
    }
  | ProcessToolEntry
  | {
      type: "plan";
      key: string;
      items: ProcessPlanItem[];
      text: string;
      /** 0 for the first plan of the block, then 1, 2… for updates. */
      revision: number;
    };

export interface ProcessSummary {
  thoughts: number;
  tools: number;
  failed: number;
  plans: number;
  /** Known thinking/working time, or null. */
  ms: number | null;
  /** Native context usage percentage, or null. */
  usagePct: number | null;
}

/** Keep polling idempotent so an unchanged transcript does not re-render or
 * retrigger smooth scrolling every 1.5 seconds. Messages may be updated in
 * place while streaming, so IDs and length alone are not sufficient. */
export function sameAgentMessages(
  current: AgentMessage[],
  incoming: AgentMessage[],
): boolean {
  if (current === incoming) return true;
  if (current.length !== incoming.length) return false;
  return current.every((message, index) => {
    const next = incoming[index];
    return (
      message.id === next.id &&
      message.role === next.role &&
      message.kind === next.kind &&
      message.content === next.content &&
      message.created_at === next.created_at &&
      JSON.stringify(message.meta || null) === JSON.stringify(next.meta || null)
    );
  });
}


/** Process-only messages belong in the task timeline, never as chat answers. */
export function isAgentProgressMessage(message: AgentMessage): boolean {
  if (message.role !== "assistant" || message.meta?.done === true) return false;
  return (
    message.kind === "plan" ||
    message.kind === "analysis" ||
    message.kind === "step" ||
    message.meta?.interim === true ||
    message.meta?.plan === true
  );
}

function isAnswerText(message: AgentMessage): boolean {
  return (
    message.role === "assistant" &&
    (message.kind === "text" || !message.kind) &&
    message.meta?.interim !== true
  );
}

/** The reply row's streamed reasoning (contract C1); "" when absent. */
export function agentReasoningText(message: AgentMessage): string {
  const raw = message.meta?.reasoning;
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * A cloud `analysis` row whose content is words the agent said to the user in
 * a round that also called tools (backend `round_end`). Its `meta.reasoning`
 * is the thought; its content is a normal message. `meta.speech` decides;
 * rows written before that flag existed count as speech when their content
 * is not just the reasoning repeated.
 */
export function isAgentSpeechMessage(message: AgentMessage): boolean {
  if (message.role !== "assistant" || message.kind !== "analysis") return false;
  const content = (message.content || "").trim();
  if (!content) return false;
  const flag = message.meta?.speech;
  if (flag === true) return true;
  if (flag === false) return false;
  const reasoning = agentReasoningText(message);
  return Boolean(reasoning) && content !== reasoning;
}

/** An assistant answer row that has no visible words yet (still reasoning). */
function isPendingAnswer(message: AgentMessage): boolean {
  return isAnswerText(message) && !(message.content || "").trim();
}

function positiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** A reply's reasoning, as the thought row that precedes its text. */
function reasoningRow(message: AgentMessage): AgentMessage {
  const ms = positiveNumber(message.meta?.reasoning_ms);
  return {
    id: message.id,
    role: "assistant",
    kind: "analysis",
    content: agentReasoningText(message),
    created_at: message.created_at,
    meta: {
      reasoning: true,
      ...(ms !== null ? { reasoning_ms: ms } : {}),
      // Still reasoning: the reply is streaming and has no answer text yet.
      streaming: message.meta?.streaming === true && !(message.content || "").trim(),
      ...(message.meta?.native === true ? { native: true } : {}),
    },
  };
}

/**
 * Ordered timeline items.
 *
 * Inside one assistant turn (between user messages) every message stays
 * where it happened. Only consecutive process (thoughts, tools, plans) forms
 * a collapsible block. Any words the agent says to the user — interim text
 * between tools, a speech row's content, the answer — end the block and are
 * a normal message in place, with a key that never changes as more process
 * arrives after it. Gates, artifacts, errors and other non-process rows also
 * stay outside and end the current block. A reply's or speech row's
 * `meta.reasoning` becomes the thought right before its text.
 */
export function buildAgentRenderItems(
  messages: AgentMessage[],
): AgentRenderItem[] {
  const items: AgentRenderItem[] = [];
  // Keys come from message ids, not positions: an earlier batch prepended on
  // scroll-up must not remount every bubble already on screen. A repeated id
  // (optimistic rows) falls back to its position so keys stay unique.
  const usedKeys = new Set<string>();
  const uniqueKey = (base: string, index: number): string => {
    const key = usedKeys.has(base) ? `${base}@${index}` : base;
    usedKeys.add(key);
    return key;
  };
  let segmentStart = 0;

  while (segmentStart < messages.length) {
    let segmentEnd = segmentStart + 1;
    while (
      segmentEnd < messages.length &&
      messages[segmentEnd].role !== "user"
    ) {
      segmentEnd += 1;
    }

    let block: AgentProgressRenderItem | null = null;
    const flush = () => {
      if (block && block.messages.length) items.push(block);
      block = null;
    };
    const join = (message: AgentMessage, index: number) => {
      if (!block) {
        block = {
          type: "progress",
          key: uniqueKey(`progress-${message.id}`, index),
          messages: [],
          startIndex: index,
          endIndex: index,
        };
      }
      block.messages.push(message);
      block.endIndex = index;
    };

    for (let index = segmentStart; index < segmentEnd; index += 1) {
      const message = messages[index];
      // Trusted workspace actions are machine-to-UI transport. They must never
      // appear as an empty or JSON-shaped chat bubble.
      if (message.kind === "ui_action") continue;
      const speech = isAgentSpeechMessage(message);
      if (!speech && isAgentProgressMessage(message)) {
        join(message, index);
        continue;
      }
      if ((speech || isAnswerText(message)) && agentReasoningText(message)) {
        join(reasoningRow(message), index);
      }
      flush();
      items.push({
        type: "message",
        key: uniqueKey(`message-${message.id}`, index),
        message,
        index,
      });
    }
    flush();
    segmentStart = segmentEnd;
  }

  return items;
}


/**
 * Return the progress group that belongs to the latest user turn.
 *
 * While a follow-up has been submitted but its first process event has not
 * arrived, this deliberately returns an empty key so the previous completed
 * card is not reopened and mislabeled as running.
 */
export function activeAgentProgressKey(
  items: AgentRenderItem[],
  messages: AgentMessage[],
): string {
  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.type === "progress" && item.startIndex > lastUserIndex) {
      return item.key;
    }
  }
  return "";
}

/**
 * The progress block that is live right now: the latest turn's last block,
 * and only while nothing visible follows it. Once the agent's words (or a
 * gate, artifact, error…) start after it, it is no longer live, so it folds
 * by itself; the next run of process opens a new live block.
 */
export function liveAgentProgressKey(
  items: AgentRenderItem[],
  messages: AgentMessage[],
): string {
  const key = activeAgentProgressKey(items, messages);
  if (!key) return "";
  const at = items.findIndex((item) => item.key === key);
  for (let index = at + 1; index < items.length; index += 1) {
    const item = items[index];
    if (item.type === "message" && isPendingAnswer(item.message)) continue;
    return "";
  }
  return key;
}

/** Words the agent said to the user: an answer, a speech row's content, a report. Never tools or thoughts. */
function isTurnWords(message: AgentMessage): boolean {
  if (message.role !== "assistant" || !(message.content || "").trim()) return false;
  return isAnswerText(message) || isAgentSpeechMessage(message) || message.kind === "report";
}

/**
 * One action row (copy · redo · share) per agent turn (operator 2026-10-31,
 * Manus-style): only under the turn's LAST words, never under every scattered
 * sentence. Returns render-item key → the text that row copies: all of the
 * turn's words in order, joined by blank lines (no tool output, no thoughts).
 * A turn is everything between two user messages. The turn still running gets
 * no row; it appears once the turn ends.
 */
export function agentTurnActionTargets(
  items: AgentRenderItem[],
  running: boolean,
): Map<string, string> {
  const targets = new Map<string, string>();
  let words: AgentMessageRenderItem[] = [];
  const close = () => {
    const last = words[words.length - 1];
    if (last) targets.set(last.key, words.map((item) => item.message.content.trim()).join("\n\n"));
    words = [];
  };
  for (const item of items) {
    if (item.type !== "message") continue;
    if (item.message.role === "user") {
      close();
      continue;
    }
    if (isTurnWords(item.message)) words.push(item);
  }
  if (running) words = [];
  close();
  return targets;
}


function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Cloud `<code>` blocks and legacy "Thought:" prefixes, as Markdown. */
export function normalizeProcessText(value: string): string {
  return (value || "")
    .replace(/^\s*(Thought|Analysis|Reasoning)\s*:\s*/i, "")
    .replace(/<code>\s*/gi, "```python\n")
    .replace(/\s*<\/code>/gi, "\n```")
    .trim();
}

function firstLine(value: string): string {
  return (
    (value || "")
      .replace(/^\s*(Thought|Analysis|Reasoning)\s*:\s*/i, "")
      .replace(/<code>[\s\S]*?<\/code>|```[\s\S]*?```/gi, "")
      .split(/\n+/)
      .map((line) => line.replace(/^[#>*\-\s]+/, "").trim())
      .find(Boolean) || ""
  );
}

function toolStatus(message: AgentMessage): ProcessToolStatus {
  const meta = message.meta || {};
  const raw = text(meta.tool_status) || text(meta.status);
  const status = raw.toLowerCase();
  if (["failed", "error", "failure", "cancelled", "canceled"].includes(status)) return "failed";
  if (text(meta.error).trim()) return "failed";
  if (["running", "in_progress", "started"].includes(status)) return "running";
  if (status === "pending") return "pending";
  return "done";
}

/** A cloud tool name → the ACP kind vocabulary, only to pick an icon. */
function guessToolKind(name: string): string {
  const tool = name.toLowerCase();
  if (/search|find|grep|query/.test(tool)) return "search";
  if (/fetch|http|browse|web|url|download/.test(tool)) return "fetch";
  if (/write|edit|save|patch|update|create/.test(tool)) return "edit";
  if (/delete|remove/.test(tool)) return "delete";
  if (/read|get|list|open|view/.test(tool)) return "read";
  if (/run|exec|shell|python|code|command|device|computer|ui\./.test(tool)) return "execute";
  return "other";
}

type ToolCardFields = {
  kind: string;
  title: string;
  content: ProcessToolContent[];
  locations: { path: string; line?: number }[];
  children: ProcessToolEntry[];
};

/** Native card status (`pending` | `in_progress` | `completed` | `failed`) as a timeline status. */
function cardStatus(raw: unknown): ProcessToolStatus {
  const status = text(raw);
  if (status === "failed") return "failed";
  if (status === "in_progress") return "running";
  if (status === "pending") return "pending";
  return "done";
}

/** Sub-agent steps nested under a Task/Agent card, as full tool entries. */
function childEntries(raw: unknown, parentKey: string): ProcessToolEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: ProcessToolEntry[] = [];
  raw.forEach((child, index) => {
    const card = parseToolCard(child, parentKey);
    if (!card) return;
    const row = child as Record<string, unknown>;
    out.push({
      type: "tool",
      key: `${parentKey}/${text(row.id) || index}`,
      title: card.title.trim(),
      kind: card.kind,
      status: cardStatus(row.status),
      content: card.content,
      locations: card.locations,
      args: "",
      result: "",
      error: "",
      ...(card.children.length ? { children: card.children } : {}),
    });
  });
  return out;
}

function toolCardOf(message: AgentMessage, key = ""): ToolCardFields | null {
  return parseToolCard(message.meta?.tool_card, key);
}

function parseToolCard(card: unknown, key = ""): ToolCardFields | null {
  if (!card || typeof card !== "object") return null;
  const raw = card as Record<string, unknown>;
  const content: ProcessToolContent[] = [];
  for (const part of Array.isArray(raw.content) ? raw.content : []) {
    if (!part || typeof part !== "object") continue;
    const row = part as Record<string, unknown>;
    if (row.type === "diff") {
      content.push({
        type: "diff",
        path: text(row.path),
        oldText: text(row.old_text),
        newText: text(row.new_text),
      });
    } else if (row.type === "terminal") {
      content.push({ type: "terminal", output: text(row.output) });
    } else if (text(row.text)) {
      content.push({ type: "text", text: text(row.text) });
    }
  }
  const locations: { path: string; line?: number }[] = [];
  for (const loc of Array.isArray(raw.locations) ? raw.locations : []) {
    if (!loc || typeof loc !== "object") continue;
    const row = loc as Record<string, unknown>;
    const path = text(row.path);
    if (!path) continue;
    locations.push(typeof row.line === "number" ? { path, line: row.line } : { path });
  }
  const children = childEntries(raw.children, `${key}/${text(raw.id)}`);
  return { kind: text(raw.kind) || "other", title: text(raw.title), content, locations, children };
}

function planItems(message: AgentMessage): ProcessPlanItem[] {
  const entries = message.meta?.plan_entries;
  if (Array.isArray(entries)) {
    return entries.flatMap((entry): ProcessPlanItem[] => {
      if (!entry || typeof entry !== "object") return [];
      const row = entry as Record<string, unknown>;
      const content = text(row.content).trim();
      if (!content) return [];
      const status = text(row.status);
      const priority = text(row.priority);
      return [{
        content,
        status: status === "pending" || status === "in_progress" || status === "completed" ? status : "",
        priority: priority === "high" || priority === "medium" || priority === "low" ? priority : "",
      }];
    });
  }
  const steps = message.meta?.plan_steps;
  if (!Array.isArray(steps)) return [];
  return steps
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((content) => ({ content: content.trim(), status: "", priority: "" }));
}

/**
 * One ordered entry per process message; nothing is merged or reordered.
 * Hard invariant: no entry is ever words to the user. A speech row passed in
 * contributes only its reasoning; answer text is dropped.
 */
export function buildProcessEntries(messages: AgentMessage[]): ProcessEntry[] {
  const entries: ProcessEntry[] = [];
  let plans = 0;
  messages.forEach((original, position) => {
    const speech = isAgentSpeechMessage(original);
    if (speech && !agentReasoningText(original)) return;
    const message = speech ? reasoningRow(original) : original;
    const key = `${message.kind || "text"}-${message.id}-${position}`;
    if (message.kind === "plan" || message.meta?.plan === true) {
      const items = planItems(message);
      const body = normalizeProcessText(message.content || "");
      if (!items.length && !body) return;
      entries.push({ type: "plan", key, items, text: body, revision: plans });
      plans += 1;
      return;
    }
    if (message.kind === "step") {
      const card = toolCardOf(message, key);
      const tool = text(message.meta?.tool);
      const title =
        (message.content || "").replace(/^▶\s*/, "").trim() || card?.title.trim() || tool;
      entries.push({
        type: "tool",
        key,
        title,
        kind: card?.kind || text(message.meta?.tool_kind) || guessToolKind(tool || title),
        status: toolStatus(message),
        content: card?.content ?? [],
        locations: card?.locations ?? [],
        args: text(message.meta?.args_preview),
        result: text(message.meta?.result_preview),
        error: text(message.meta?.error).trim(),
        ...(card?.children.length ? { children: card.children } : {}),
      });
      return;
    }
    if (message.kind === "analysis" || message.meta?.interim === true) {
      const body = message.content || "";
      if (!body.trim()) return;
      entries.push({
        type: "thought",
        key,
        text: body,
        summary: text(message.meta?.summary).trim() || firstLine(body),
        ms: positiveNumber(message.meta?.reasoning_ms),
        streaming: message.meta?.streaming === true,
      });
    }
  });
  return entries;
}

/** The numbers behind the folded line "思考 X 秒 · N 个步骤 · 1 个失败". */
export function summarizeProcess(
  messages: AgentMessage[],
  entries: ProcessEntry[] = buildProcessEntries(messages),
): ProcessSummary {
  let thoughts = 0;
  let tools = 0;
  let failed = 0;
  let plans = 0;
  let reasoningMs = 0;
  for (const entry of entries) {
    if (entry.type === "thought") {
      thoughts += 1;
      if (entry.ms) reasoningMs += entry.ms;
    } else if (entry.type === "tool") {
      tools += 1;
      if (entry.status === "failed") failed += 1;
    } else if (entry.type === "plan") {
      plans += 1;
    }
  }
  let ms: number | null = reasoningMs > 0 ? reasoningMs : null;
  if (ms === null) {
    const times = messages
      .map((message) => Date.parse(message.created_at || ""))
      .filter((time) => Number.isFinite(time));
    if (times.length > 1) {
      const span = Math.max(...times) - Math.min(...times);
      if (span >= 1000) ms = span;
    }
  }
  let usagePct: number | null = null;
  for (const message of messages) {
    const usage = message.meta?.native_usage as { used?: unknown; size?: unknown } | undefined;
    const used = Number(usage?.used);
    const size = Number(usage?.size);
    if (Number.isFinite(used) && Number.isFinite(size) && size > 0) {
      usagePct = Math.min(100, Math.max(0, Math.round((used / size) * 100)));
    }
  }
  return { thoughts, tools, failed, plans, ms, usagePct };
}


/**
 * Consume every newly arrived artifact message in source order.
 *
 * Polling can deliver a preview and a later markdown result in the same batch;
 * selecting only the latest artifact would permanently skip the preview. IDs
 * are task-message identities, so the same preview URL in a later turn still
 * produces a new event and can reopen the preview pane. The task identity guard
 * also rejects the one transitional render where props already point at a new
 * task but React still holds the previous task's messages.
 */
export function takeUnreportedAgentArtifacts(
  messages: AgentMessage[],
  reportedIds: Set<number>,
  messagesTaskId: string,
  activeTaskId: string,
): AgentMessage[] {
  if (!messagesTaskId || messagesTaskId !== activeTaskId) return [];
  const fresh: AgentMessage[] = [];
  for (const message of messages) {
    if (!message.meta?.artifact || reportedIds.has(message.id)) continue;
    reportedIds.add(message.id);
    fresh.push(message);
  }
  return fresh;
}
