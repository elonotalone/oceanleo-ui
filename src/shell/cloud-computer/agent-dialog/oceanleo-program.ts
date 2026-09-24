import { nextPollCadence, type PollCadenceInput } from "../../agent-thread/cadence";
import { agentMessageFingerprint } from "../../agent-thread/rules";
// Shell 对话框里 OceanLeo agent 程序（合同 I6）的纯函数半区：
// 把 agent 任务的消息流映射成对话框消息，以及轮询节奏。不碰网络、不碰 React，
// 方便逐条钉单测。控制器（useAgentDialogController）负责调用与时机。

import type { AgentMessage, TaskDetail } from "../../../lib/agent";
import type { AgentDialogMessage, PlanEntry, TurnItem } from "./types";

/** 步骤 / 错误行的兜底标题。控制器用 tt() 译好后传进来；测试直接用中文默认。 */
export type OceanleoMapLabels = { step?: string; error?: string };

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `oc-${prefix}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function firstLine(text: string): string {
  const line = (text || "").split("\n").find((row) => row.trim() !== "") ?? "";
  return line.trim().slice(0, 120);
}

/** 产物消息 → 一行标题 + 裸 URL；MessageList 会把 URL 渲染成真链接。 */
function artifactText(message: AgentMessage): string {
  const artifact = message.meta?.artifact;
  const title = (artifact?.title || "").trim();
  const url = (artifact?.url || "").trim();
  if (title && url) return `${title}\n${url}`;
  return title || url || (message.content || "").trim();
}

function planEntries(raw: unknown): PlanEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const content = typeof row.content === "string" ? row.content : "";
    if (!content.trim()) continue;
    out.push({
      content,
      priority: row.priority === "high" || row.priority === "low" ? row.priority : "medium",
      status:
        row.status === "in_progress" || row.status === "completed" ? row.status : "pending",
    });
  }
  return out;
}

/** 一条 assistant 消息 → 对话框 turn 里的一项；不适合进 turn 的返回 null（如 ui_action）。 */
function mapAssistantItem(message: AgentMessage, labels: OceanleoMapLabels): TurnItem | null {
  const kind = message.kind || "text";
  const content = (message.content || "").trim();
  if (kind === "ui_action") return null;
  // 工具步骤折叠为一行：标题取首行，全文收进可展开的卡片。
  if (kind === "step") {
    return {
      kind: "tool",
      id: nextId("step"),
      tool: {
        id: `step-${message.id}`,
        kind: "other",
        title: firstLine(content) || labels.step || "步骤",
        status: "completed",
        content: content ? [{ type: "content", text: message.content }] : [],
        locations: [],
      },
    };
  }
  if (kind === "error") {
    return {
      kind: "tool",
      id: nextId("err"),
      tool: {
        id: `error-${message.id}`,
        kind: "other",
        title: firstLine(content) || labels.error || "出错",
        status: "failed",
        content: content ? [{ type: "content", text: message.content }] : [],
        locations: [],
      },
    };
  }
  if (kind === "plan") {
    const entries = planEntries(message.meta?.plan);
    if (entries.length > 0) return { kind: "plan", id: nextId("plan"), entries };
    // 服务端的 plan 正文是 markdown 文本，没有结构就按普通正文走，不猜。
    return content ? { kind: "assistant", id: nextId("a"), text: message.content } : null;
  }
  if (kind === "artifact" || message.meta?.artifact) {
    const text = artifactText(message);
    return text ? { kind: "assistant", id: nextId("a"), text } : null;
  }
  // text / report / 未知 kind：有正文就当正文，空的不占行。
  return content ? { kind: "assistant", id: nextId("a"), text: message.content } : null;
}

/**
 * 任务详情 → 对话框消息列表（升序）。user 一条一消息；相邻 assistant 消息
 * 收进同一个 turn。任务不在 running 时最后一个 turn 带上 stop（= 任务状态），
 * 列表据此不再显示「还在跑」。
 */
export function mapTaskMessages(
  detail: Pick<TaskDetail, "task" | "messages">,
  labels: OceanleoMapLabels = {},
): AgentDialogMessage[] {
  const out: AgentDialogMessage[] = [];
  let open: Extract<AgentDialogMessage, { kind: "turn" }> | null = null;
  const closeTurn = () => {
    if (open) out.push(open);
    open = null;
  };
  for (const message of detail.messages ?? []) {
    if (message.role === "user") {
      // 空 user 消息（如只带附件的一行）不占行，也不该切断正在收的 turn。
      const text = (message.content || "").trim();
      if (!text) continue;
      closeTurn();
      out.push({ kind: "user", id: nextId("u"), text: message.content });
      continue;
    }
    const item = mapAssistantItem(message, labels);
    if (!item) continue;
    if (!open) open = { kind: "turn", id: nextId("t"), acpSession: "", stop: "", items: [] };
    open.items.push(item);
  }
  closeTurn();
  const status = typeof detail.task?.status === "string" ? detail.task.status : "";
  if (status && status !== "running") {
    for (let index = out.length - 1; index >= 0; index -= 1) {
      const message = out[index];
      if (message.kind === "turn") {
        out[index] = { ...message, stop: status };
        break;
      }
    }
  }
  return out;
}

/** Detect both new rows and content growth inside an existing streamed row. */
export function oceanMessageFingerprint(messages: AgentMessage[] = []): string {
  return agentMessageFingerprint(messages);
}

export type OceanleoPollInput = PollCadenceInput;
export const nextOceanleoPoll = nextPollCadence;
