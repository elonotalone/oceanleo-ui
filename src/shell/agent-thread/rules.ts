import type { AgentMessage } from "../../lib/agent";
import { sameAgentMessages } from "../../lib/agent-progress";

export function resolveTaskStatus(input: {
  serverStatus: string;
  taskId: string;
  stoppedTaskId: string;
}): string {
  const { serverStatus, taskId, stoppedTaskId } = input;
  return stoppedTaskId && stoppedTaskId === taskId && serverStatus === "running"
    ? "stopped"
    : serverStatus;
}

export function agentMessagesChanged(current: AgentMessage[], incoming: AgentMessage[]): boolean {
  return !sameAgentMessages(current, incoming);
}

export function agentMessageFingerprint(messages: AgentMessage[] = []): string {
  return JSON.stringify(messages.map((message) => [
    message.id, message.role, message.kind, message.content, message.created_at, message.meta || null,
  ]));
}

export function threadPresentation(
  messages: AgentMessage[],
  status: string,
  options: { busy?: boolean; taskId?: string; stoppedTaskId?: string; activeProgress?: boolean } = {},
) {
  const effectiveStatus = resolveTaskStatus({
    serverStatus: status,
    taskId: options.taskId || "",
    stoppedTaskId: options.stoppedTaskId || "",
  });
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  const reply = messages.slice(lastUserIndex + 1).findLast((message) =>
    message.role === "assistant" && message.meta?.interim !== true &&
    !["plan", "step", "analysis"].includes(message.kind),
  );
  const visible = Boolean(reply && (reply.kind !== "text" && reply.kind !== "" || reply.content?.trim()));
  const stopped = effectiveStatus === "stopped" || reply?.meta?.stopped === true ||
    Boolean(options.stoppedTaskId && options.stoppedTaskId === options.taskId);
  const complete = Boolean(reply && visible && !reply.meta?.streaming && !reply.meta?.stopped &&
    (reply.meta?.done || reply.meta?.final));
  const working = (effectiveStatus === "running" || Boolean(options.busy)) && !stopped && !complete;
  const thinking = working && !options.activeProgress && !(visible && reply?.meta?.streaming === true);
  const suggestions = effectiveStatus === "done" && complete && !stopped && Array.isArray(reply?.meta?.suggestions)
    ? (reply.meta.suggestions as unknown[]).filter((item): item is string =>
        typeof item === "string" && Boolean(item.trim())).slice(0, 3)
    : [];
  return { complete, working, thinking, stopped, suggestions, effectiveStatus };
}
