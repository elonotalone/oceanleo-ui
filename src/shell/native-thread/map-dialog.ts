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

import type { AgentAttachment, AgentMessage } from "../../lib/agent";
import { isReconnectingNotice, noticeCopy, visibleNoticeCopy } from "../cloud-computer/agent-dialog/notice";
import type {
  AgentDialogMessage,
  ArchivedAttachment,
  PermissionOption,
  ToolCard,
  TurnItem,
  UserMessageAttachment,
} from "../cloud-computer/agent-dialog/types";

export type MapTranslate = (zh: string, vars?: Record<string, string | number>) => string;

export type DialogMapOptions = {
  /** True while the controller is connected; false for the cloud-saved archive. */
  live: boolean;
  /** Viewer-language translate; defaults to the Chinese source text. */
  tt?: MapTranslate;
};

/** Attachment as rendered on the user bubble; `native_archive` is the owner-checked cloud copy. */
export type NativeAgentAttachment = AgentAttachment & { native_archive?: ArchivedAttachment };

export type NativePermissionMeta = {
  permId: string;
  options: PermissionOption[];
  chosen: string;
  auto: boolean;
};

export type NativeQuestionMeta = {
  questionId: string;
  title: string;
  detail: string;
  questions: unknown;
  submitted: boolean;
};

const INTERRUPTED = new Set(["cancelled", "canceled", "stopped"]);

type ToolCardMeta = {
  id: string;
  kind: string;
  title: string;
  status: string;
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
  let step = 0;

  for (const message of messages) {
    if (message.kind === "user") {
      const attachments = (message.attachments ?? []).map(attachmentOf);
      out.push({
        id: nextId(`u:${message.id}`),
        role: "user",
        kind: "text",
        content: message.text,
        meta: { native: true, ...(attachments.length ? { attachments } : {}) },
        ...(typeof message.at === "number" ? { created_at: new Date(message.at).toISOString() } : {}),
      });
      continue;
    }

    if (message.kind === "notice") {
      // Connection churn is machine state, not conversation content. The host
      // shows reachability through the thread's blocked/offline signals.
      if (isReconnectingNotice(message.code)) continue;
      out.push({
        id: nextId(`n:${message.id}`),
        role: "assistant",
        kind: isNeutralNotice(message.code) ? "notice" : "error",
        content: noticeText(tt, message),
        meta: { native: true, native_notice: message.code },
      });
      continue;
    }

    const finished =
      !opts.live || (Boolean(message.stop) && message.stop !== "stopping") || message.live !== true;
    const interrupted = INTERRUPTED.has(message.stop);
    let lastText = -1;
    let lastProcess = -1;
    let usage: { used: number; size: number } | null = null;

    for (const item of message.items) {
      const key = `${message.id}/${item.id}`;
      if (item.kind === "assistant") {
        if (!item.text) continue;
        lastText = out.length;
        out.push({
          id: nextId(`a:${key}`),
          role: "assistant",
          kind: "text",
          content: item.text,
          meta: { native: true },
        });
        continue;
      }
      if (item.kind === "thought") {
        if (!item.text.trim()) continue;
        step += 1;
        lastProcess = out.length;
        out.push({
          id: nextId(`t:${key}`),
          role: "assistant",
          kind: "analysis",
          content: item.text,
          meta: { native: true, step_index: step },
        });
        continue;
      }
      if (item.kind === "tool") {
        step += 1;
        lastProcess = out.length;
        const tool = item.tool;
        const title = tool.title.trim() || tt("执行步骤");
        out.push({
          id: nextId(`s:${key}`),
          role: "assistant",
          kind: "step",
          content: title,
          meta: {
            native: true,
            native_tool: true,
            step_index: step,
            tool_status: tool.status,
            tool_kind: tool.kind,
            tool_card: toolCardMeta(tool),
          },
        });
        continue;
      }
      if (item.kind === "plan") {
        lastProcess = out.length;
        out.push({
          id: nextId(`p:${key}`),
          role: "assistant",
          kind: "plan",
          content: "",
          meta: {
            native: true,
            plan_steps: item.entries.map((entry) => entry.content).filter((text) => text.trim()),
            plan_entries: item.entries,
          },
        });
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
        };
        const prompt = permissionPrompt(item, tt);
        out.push({
          id: nextId(`g:${key}`),
          role: "assistant",
          kind: "gate",
          content: prompt,
          meta: { native: true, gate_prompt: prompt, native_permission },
        });
        continue;
      }
      if (item.kind === "question") {
        const native_question: NativeQuestionMeta = {
          questionId: item.questionId,
          title: item.title,
          detail: item.detail,
          questions: item.questions,
          submitted: item.submitted,
        };
        const prompt = item.title.trim() || tt("需要你回答");
        out.push({
          id: nextId(`q:${key}`),
          role: "assistant",
          kind: "gate",
          content: prompt,
          meta: { native: true, gate_prompt: prompt, native_question },
        });
        continue;
      }
      if (item.kind === "usage") {
        if (item.size > 0) usage = { used: item.used, size: item.size };
        continue;
      }
    }

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
  return out;
}
