// Native (ACP) dialog state -> the main chat's AgentMessage stream.
//
// Pure and deterministic: the same dialog list always yields the same
// messages with the same ids, so the host can feed the result straight into
// buildAgentRenderItems -> AgentTranscriptBubble / AgentProgress and look
// identical to a cloud conversation. Ids are negative so branch/regenerate
// (which only accept server ids > 0) never apply to native messages.
//
// Nothing the program said is reduced (contract C3): a tool carries its full
// ACP card (`meta.tool_card`: kind, status, content diff | terminal | text,
// locations), a plan carries its entries with status and priority, a thought
// keeps its text, and the turn's last usage rides on its last process row.
// Auto-allowed permissions are dropped; only real failures are `error` rows.

import type { NativeAgentMessage as AgentMessage, NativeAgentAttachment } from "../../native-agent-core/index";
export type { NativeAgentAttachment } from "../../native-agent-core/index";
import { isReconnectingNotice, noticeCopy, visibleNoticeCopy } from "../cloud-computer/legacy-dialog/notice";
import type {
  AgentDialogMessage,
  PermissionOption,
  ToolCard,
  TurnItem,
  UserMessageAttachment,
  NativeFramePosition,
} from "../../native-agent-core/index";
import { mergeLocalPreviews } from "../cloud-computer/legacy-dialog/message-attachments";
import { mergeNativePosition, orderNativeFrames } from "./order";

export type MapTranslate = (zh: string, vars?: Record<string, string | number>) => string;

export type DialogMapOptions = {
  /** True while the controller is connected; false for the cloud-saved archive. */
  live: boolean;
  /** Viewer-language translate; defaults to the Chinese source text. */
  tt?: MapTranslate;
  /** Program that authored this saved/live stream, used by cross-engine task views. */
  engine?: string;
};

export type NativePermissionMeta = {
  permId: string;
  options: PermissionOption[];
  chosen: string;
  auto: boolean;
  actionable?: boolean;
  requestState?: string;
};

export type NativeQuestionMeta = {
  questionId: string;
  title: string;
  detail: string;
  questions: unknown;
  submitted: boolean;
  actionable?: boolean;
  requestState?: string;
};

import { toolRawValue } from "../../native-agent-core/tool-raw";

const INTERRUPTED = new Set(["cancelled", "canceled", "stopped"]);

type ToolCardMeta = {
  id: string;
  kind: string;
  title: string;
  status: string;
  rawInput?: unknown;
  rawOutput?: unknown;
  raw_input?: unknown;
  raw_output?: unknown;
  content: ToolCard["content"];
  locations: ToolCard["locations"];
  /** A Task/Agent step's background sub-agent steps, nested the same way. */
  children?: ToolCardMeta[];
};

function toolCardMeta(tool: ToolCard): ToolCardMeta {
  return {
    id: tool.id,
    kind: tool.kind,
    title: tool.title,
    status: tool.status,
    ...(toolRawValue(tool, "input") !== undefined ? { rawInput: toolRawValue(tool, "input"), raw_input: toolRawValue(tool, "input") } : {}),
    ...(toolRawValue(tool, "output") !== undefined ? { rawOutput: toolRawValue(tool, "output"), raw_output: toolRawValue(tool, "output") } : {}),
    content: tool.content ?? [],
    locations: tool.locations ?? [],
    ...(tool.children?.length ? { children: tool.children.map(toolCardMeta) } : {}),
  };
}

/** Notices that are not failures: shown as a neutral line, never red. */
const NEUTRAL_NOTICES = new Set([
  "acp_exited",
  "dialog_detached",
  "agent_busy",
  "permission_timeout",
  "computer_not_confirmed",
  "session_not_found",
]);

export function isNeutralNotice(code: string): boolean {
  return NEUTRAL_NOTICES.has(code);
}

function sourceText(zh: string, vars?: Record<string, string | number>): string {
  if (!vars) return zh;
  return zh.replace(/\{(\w+)\}/g, (token, key: string) => (key in vars ? String(vars[key]) : token));
}

/** FNV-1a 32-bit. Stable across runs and engines. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

function idAllocator() {
  const used = new Set<number>();
  return (key: string): number => {
    let id = -((hash(key) % 2147483646) + 1);
    while (used.has(id)) id = id <= -2147483647 ? -1 : id - 1;
    used.add(id);
    return id;
  };
}

function isImage(mime: string, name: string): boolean {
  return mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name);
}

function attachmentOf(item: UserMessageAttachment): NativeAgentAttachment {
  const mime = item.mime || item.archive?.mime || "";
  const name = item.name || item.archive?.name || "";
  return {
    url: item.preview || "",
    name,
    mime,
    media_type: isImage(mime, name) ? "image" : "doc",
    ...(item.archive ? { native_archive: item.archive } : {}),
  };
}

function noticeText(
  tt: MapTranslate,
  message: Extract<AgentDialogMessage, { kind: "notice" }>,
): string {
  switch (message.code) {
    case "not_logged_in":
      return tt("这个程序还没有登录，请在设置里登录后再发。");
    case "program_missing":
    case "missing_program":
    case "acp_unavailable":
    case "runtime_missing":
      return tt("这台电脑上还没有装好这个程序，请在设置里安装后再发。");
    case "provider_needs_credits":
      return noticeCopy(tt, message.code, null, message.provider || "nous");
    default:
      return visibleNoticeCopy(tt, message.code, null, message.text ?? "");
  }
}

function permissionPrompt(item: Extract<TurnItem, { kind: "permission" }>, tt: MapTranslate): string {
  const title = item.title.trim();
  const tool = item.toolTitle.trim();
  if (title && tool && title !== tool) return `${title}\n${tool}`;
  return title || tool || tt("这项操作需要你确认。");
}

/**
 * Map native dialog messages to the main chat's message model.
 * See R1 book for the per-kind rules.
 */
export function dialogToAgentMessages(
  messages: AgentDialogMessage[],
  opts: DialogMapOptions,
): AgentMessage[] {
  const tt = opts.tt ?? sourceText;
  const nextId = idAllocator();
  const out: AgentMessage[] = [];
  const latestTurn = new Map<string, string>();
  for (const message of messages) if (message.kind === "turn") latestTurn.set(message.acpSession, message.id);
  const push = (row: AgentMessage, position: NativeFramePosition) => out.push({
    ...row,
    ...(position.at !== undefined ? { created_at: new Date(position.at).toISOString() } : {}),
    meta: { ...row.meta,
      ...(position.seq !== undefined ? { native_seq: position.seq } : {}),
      ...(position.arrivalSource ? { native_arrival_source: position.arrivalSource, native_arrival: position.arrival } : {}),
      ...(position.updatedAt !== undefined ? { native_updated_at: new Date(position.updatedAt).toISOString() } : {}),
    },
  });
  let step = 0;

  for (const message of messages) {
    if (message.kind === "user") {
      const attachments = (message.attachments ?? []).map(attachmentOf);
      // Delivery metadata alone is not conversation content. Older saved
      // states may contain an empty placeholder; file-only prompts still count.
      if (!message.text.trim() && !attachments.length) continue;
      const sender = message.sender;
      push({
        id: nextId(`u:${message.id}`),
        role: sender ? "assistant" : "user",
        kind: "text",
        content: message.text,
        meta: { native: true, ...(message.messageId ? { native_message_id: message.messageId } : {}), ...(message.turnId ? { native_turn_id: message.turnId } : {}), ...(message.delivery ? { native_delivery: message.delivery } : {}), ...(opts.engine ? { engine: opts.engine } : {}), ...(sender ? { sender } : {}), ...(attachments.length ? { attachments } : {}) },
        ...(typeof message.at === "number" ? { created_at: new Date(message.at).toISOString() } : {}),
      }, message);
      continue;
    }

    if (message.kind === "notice") {
      // Connection churn is machine state, not conversation content. The host
      // shows reachability through the thread's blocked/offline signals.
      if (isReconnectingNotice(message.code)) continue;
      push({
        id: nextId(`n:${message.id}`),
        role: "assistant",
        kind: isNeutralNotice(message.code) ? "notice" : "error",
        content: noticeText(tt, message),
        meta: { native: true, ...(opts.engine ? { engine: opts.engine } : {}), native_notice: message.code },
      }, message);
      continue;
    }

    const firstTurnRow = out.length;
    const finished =
      !opts.live || (Boolean(message.stop) && message.stop !== "stopping") || message.live !== true;
    const finishing = !finished && message.finishing === true && latestTurn.get(message.acpSession) === message.id;
    const interrupted = INTERRUPTED.has(message.stop);
    let lastText = -1;
    let lastProcess = -1;
    let usage: { used: number; size: number } | null = null;

    for (const item of message.items) {
      const key = `${message.turnId ?? message.id}/${item.seq !== undefined ? `frame:${item.seq}` : item.id}`;
      // A live continuation has no stored seq yet; inheriting the turn-start
      // position would move it above newer user input.
      const position = item;
      if (item.kind === "assistant") {
        if (!item.text) continue;
        lastText = out.length;
        push({
          id: nextId(`a:${key}`),
          role: "assistant",
          kind: "text",
          content: item.text,
          meta: { native: true, ...(opts.engine ? { engine: opts.engine } : {}) },
        }, position);
        continue;
      }
      if (item.kind === "thought") {
        if (!item.text.trim()) continue;
        step += 1;
        lastProcess = out.length;
        push({
          id: nextId(`t:${key}`),
          role: "assistant",
          kind: "analysis",
          content: item.text,
          meta: { native: true, ...(opts.engine ? { engine: opts.engine } : {}), step_index: step },
        }, position);
        continue;
      }
      if (item.kind === "tool") {
        step += 1;
        lastProcess = out.length;
        const tool = item.tool;
        const title = tool.title.trim() || tt("执行步骤");
        push({
          id: nextId(`s:${key}`),
          role: "assistant",
          kind: "step",
          content: title,
          meta: {
            native: true,
            ...(opts.engine ? { engine: opts.engine } : {}),
            native_tool: true,
            step_index: step,
            tool_status: tool.status,
            tool_kind: tool.kind,
            tool_card: toolCardMeta(tool),
          },
        }, position);
        continue;
      }
      if (item.kind === "plan") {
        lastProcess = out.length;
        push({
          id: nextId(`p:${key}`),
          role: "assistant",
          kind: "plan",
          content: "",
          meta: {
            native: true,
            ...(opts.engine ? { engine: opts.engine } : {}),
            plan_steps: item.entries.map((entry) => entry.content).filter((text) => text.trim()),
            plan_entries: item.entries,
          },
        }, position);
        continue;
      }
      if (item.kind === "permission") {
        // Auto-allowed permissions are noise (as on the old Computers page).
        if (item.auto) continue;
        const native_permission: NativePermissionMeta = {
          permId: item.permId,
          options: item.options,
          chosen: item.chosen,
          auto: false,
          actionable: !finished && item.actionable !== false && (!item.requestState || item.requestState === "waiting") && !item.chosen,
          requestState: item.requestState || (finished ? "expired" : "waiting"),
        };
        const prompt = permissionPrompt(item, tt);
        push({
          id: nextId(`g:${key}`),
          role: "assistant",
          kind: "gate",
          content: prompt,
          meta: { native: true, ...(opts.engine ? { engine: opts.engine } : {}), gate_prompt: prompt, native_permission, native_actionable: native_permission.actionable },
        }, position);
        continue;
      }
      if (item.kind === "question") {
        const native_question: NativeQuestionMeta = {
          questionId: item.questionId,
          title: item.title,
          detail: item.detail,
          questions: item.questions,
          submitted: item.submitted,
          actionable: !finished && item.actionable !== false && (!item.requestState || item.requestState === "waiting") && !item.submitted,
          requestState: item.requestState || (finished ? "expired" : "waiting"),
        };
        const prompt = item.title.trim() || tt("需要你回答");
        push({
          id: nextId(`q:${key}`),
          role: "assistant",
          kind: "gate",
          content: prompt,
          meta: { native: true, ...(opts.engine ? { engine: opts.engine } : {}), gate_prompt: prompt, native_question, native_actionable: native_question.actionable },
        }, position);
        continue;
      }
      if (item.kind === "usage") {
        if (item.size > 0) usage = { used: item.used, size: item.size };
        continue;
      }
    }

    if (message.turnId) {
      for (let index = firstTurnRow; index < out.length; index += 1) out[index] = { ...out[index], meta: { ...out[index].meta, native_turn_id: message.turnId, native_turn_live: !finished,
        native_turn_finishing: finishing,
        ...(message.autonomous ? { native_turn_autonomous: true } : {}) } };
    }
    if (!finished && !finishing && lastText >= 0 && message.turnId) out[lastText] = { ...out[lastText], meta: { ...out[lastText].meta, native_streaming: true } };
    // Usage is shown faintly in the folded process line of this turn.
    if (usage && lastProcess >= 0) {
      const row = out[lastProcess];
      out[lastProcess] = { ...row, meta: { ...row.meta, native_usage: usage } };
    }

    if (finished && lastText >= 0) {
      const last = out[lastText];
      out[lastText] = { ...last, meta: { ...last.meta, final: true, ...(interrupted ? { stopped: true } : {}) } };
    }
  }
  return orderNativeFrames(out, (message) => ({ seq: typeof message.meta?.native_seq === "number" ? message.meta.native_seq : undefined,
    at: message.created_at ? Date.parse(message.created_at) : undefined,
    arrival: typeof message.meta?.native_arrival === "number" ? message.meta.native_arrival : undefined,
    arrivalSource: typeof message.meta?.native_arrival_source === "string" ? message.meta.native_arrival_source : undefined,
  }));
}

/** The same turn item on two pages (ids where both have them, else stored seq or text). */
function sameTurnItem(old: TurnItem, item: TurnItem): boolean {
  return old.kind === item.kind && (
    old.id === item.id ||
    (old.kind === "tool" && item.kind === "tool" && old.tool.id === item.tool.id) ||
    (old.kind === "permission" && item.kind === "permission" && old.permId === item.permId) ||
    (old.kind === "question" && item.kind === "question" && old.questionId === item.questionId) ||
    old.kind === "plan" || old.kind === "usage" ||
    ((old.kind === "assistant" || old.kind === "thought") && (item.kind === "assistant" || item.kind === "thought") &&
      (old.seq !== undefined && item.seq !== undefined
        ? old.seq === item.seq || (old.seq <= (item.updatedSeq ?? item.seq) && item.seq <= (old.updatedSeq ?? old.seq) &&
          (old.text.includes(item.text) || item.text.includes(old.text)))
        : old.text.includes(item.text) || item.text.includes(old.text))));
}

function sameDialogRow(own: AgentDialogMessage, row: AgentDialogMessage): boolean {
  if (own.kind !== row.kind) return false;
  if (own.kind === "notice" && row.kind === "notice") {
    if (own.program !== row.program || own.code !== row.code || own.provider !== row.provider || own.model !== row.model) return false;
    // Error/notice reducers allocate local ids on every replay. Only the stored
    // frame identifies those copies; equal text at another seq is a real row.
    if (Number.isFinite(own.seq) && Number.isFinite(row.seq)) return own.seq === row.seq;
    return own.id === row.id;
  }
  if (own.kind === "user" && row.kind === "user" && row.messageId) return own.messageId === row.messageId;
  if (own.kind === "turn" && row.kind === "turn") {
    if (own.turnId && row.turnId) return own.turnId === row.turnId;
    // Older stored turns can lack a wire turn id, but their container's first
    // frame is still durable. Never cross a session or conflicting turn ids.
    if (own.acpSession === row.acpSession && Number.isFinite(own.seq) && Number.isFinite(row.seq) && own.seq === row.seq) return true;
    if (row.turnId) return false;
  }
  return own.id === row.id;
}

/** ID-aware union for the durable protocol. Legacy sessions still use the legacy merger. */
export function mergeNativeDialogPages(saved: readonly AgentDialogMessage[], live: readonly AgentDialogMessage[]): AgentDialogMessage[] {
  const out = saved.slice();
  let userAnchor = -1;
  // The gateway's text-only replay of the native session (session/load after a gateway
  // restart: no message/turn identity) restates saved rows; it never adds them again.
  let replayAnchor = false;
  // Replayed history keeps its own place: a message sent before the replay arrived
  // comes first in the live list, but the replay still restates the saved turns.
  let replayCursor = -1;
  const restated = new Set<number>();
  for (const row of live) {
    let index = out.findIndex((own) => sameDialogRow(own, row));
    if (index < 0 && row.kind === "user" && !row.messageId && row.replay === true) {
      index = out.findIndex((own, at) => at > replayCursor && at < saved.length && !restated.has(at) && own.kind === "user" && own.text === row.text);
      if (index >= 0) { replayCursor = index; restated.add(index); }
    }
    if (index < 0 && row.kind === "user" && !row.messageId) {
      index = out.findIndex((own, at) => at > userAnchor && own.kind === "user" && !own.messageId && own.text === row.text &&
        (own.at == null || row.at == null || Math.abs(own.at - row.at) < 10_000));
    }
    if (index < 0 && row.kind === "turn" && !row.turnId && userAnchor >= 0) {
      for (let at = userAnchor + 1; at < out.length; at += 1) {
        const candidate = out[at];
        if (candidate.kind === "user") break;
        if (candidate.kind === "turn" && (!candidate.turnId || replayAnchor)) { index = at; break; }
      }
    }
    if (index < 0) { out.push(row); if (row.kind === "user") { userAnchor = out.length - 1; replayAnchor = false; } continue; }
    if (row.kind === "user") { userAnchor = index; replayAnchor = row.replay === true && !row.messageId; }
    const own = out[index];
    if (row.kind === "user" && own.kind === "user") {
      const attachments = row.attachments?.some((item) => item.archive) ? mergeLocalPreviews(row.attachments, own.attachments ?? [])
        : own.attachments?.some((item) => item.archive) ? mergeLocalPreviews(own.attachments, row.attachments ?? [])
        : row.attachments?.length ? row.attachments : own.attachments;
      out[index] = { ...own, ...row, ...mergeNativePosition(own, row),
        ...(row.arrivalSource ? { arrivalSource: row.arrivalSource, arrival: row.arrival, updatedArrival: row.updatedArrival } : {}),
        turnId: row.delivery ? row.turnId ?? own.turnId : own.delivery ? own.turnId ?? row.turnId : row.turnId ?? own.turnId,
        id: own.id, delivery: row.delivery ?? own.delivery, attachments };
    } else if (row.kind === "notice" && own.kind === "notice") {
      out[index] = { ...own, ...mergeNativePosition(own, row) };
    } else if (row.kind === "turn" && own.kind === "turn") {
      const items = own.items.slice();
      const replayed = replayAnchor && !row.turnId;
      const siblings: Extract<AgentDialogMessage, { kind: "turn" }>[] = [];
      if (replayed) {
        for (let at = userAnchor + 1; at < out.length && out[at].kind !== "user"; at += 1) {
          const turn = out[at];
          if (at !== index && turn.kind === "turn") siblings.push(turn);
        }
      }
      for (const item of row.items) {
        const at = items.findIndex((old) => sameTurnItem(old, item));
        if (at < 0) {
          // Already saved in a sibling turn (the native replay has no autonomous
          // boundaries: an autonomous reply comes back inside the prompt's turn).
          if (replayed && siblings.some((turn) => turn.items.some((old) => old.kind !== "plan" && old.kind !== "usage" && sameTurnItem(old, item)))) continue;
          items.push(item);
        } else {
          const old = items[at];
          // A replay restates what is saved; the saved text stays.
          const kept = replayed ? old : (old.kind === "assistant" || old.kind === "thought") &&
            (item.kind === "assistant" || item.kind === "thought") && old.text.length > item.text.length ? old : item;
          // Seen again on the newer page, an item keeps that page's arrival, as a user
          // does: later rows of that page then sort after it. With only the echoed user
          // carrying it, a live U2 landed between a saved U1 and its saved answer A1
          // (V1 2026-11-04). The turn keeps its own first position.
          items[at] = { ...kept, ...mergeNativePosition(old, item),
            ...(item.arrivalSource ? { arrivalSource: item.arrivalSource, arrival: item.arrival, updatedArrival: item.updatedArrival } : {}) };
        }
      }
      const status = own.turnStateSeq !== undefined && row.turnStateSeq !== undefined && own.turnStateSeq > row.turnStateSeq
        ? own : row.finishing !== undefined ? row : own;
      out[index] = { ...own, ...row, ...mergeNativePosition(own, row),
        ...(status.finishing !== undefined ? { finishing: status.finishing, turnStateSeq: status.turnStateSeq,
          turnStateArrival: status.turnStateArrival, turnStateSource: status.turnStateSource, turnStateBinding: status.turnStateBinding } : {}),
        id: own.id, items: orderNativeFrames(items, (item) => item), stop: row.live ? row.stop : row.stop || own.stop };
    }
  }
  const joined = out.map((message) => {
    if (message.kind !== "turn") return message;
    const foreign = out.flatMap((other) => other === message ? [] : other.kind === "turn"
      ? [other.seq, ...other.items.map((item) => item.seq)] : [other.seq]);
    const items: TurnItem[] = [];
    for (const item of message.items) {
      const previous = items[items.length - 1];
      if (previous && (previous.kind === "thought" || previous.kind === "assistant") &&
          (item.kind === "thought" || item.kind === "assistant") && item.kind === previous.kind &&
          previous.seq !== undefined && item.seq !== undefined && (previous.updatedSeq ?? previous.seq) < item.seq &&
          !foreign.some((seq) => seq !== undefined && seq > (previous.updatedSeq ?? previous.seq!) && seq < item.seq!)) {
        // A page edge can split a text/thought chunk (including whitespace-only
        // fragments). Join only across a clear stored interval, never across input.
        items[items.length - 1] = { ...previous, ...mergeNativePosition(previous, item), text: previous.text + item.text };
      } else items.push(item);
    }
    return { ...message, items };
  });
  return orderNativeFrames(joined, (message) => message);
}
