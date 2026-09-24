import type { AgentMessage } from "../../lib/agent";

function sameMeta(a: AgentMessage["meta"], b: AgentMessage["meta"]): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function sameAgentRow(a: AgentMessage, b: AgentMessage): boolean {
  return (
    a === b ||
    (a.id === b.id &&
      a.role === b.role &&
      a.kind === b.kind &&
      a.content === b.content &&
      a.created_at === b.created_at &&
      sameMeta(a.meta, b.meta))
  );
}

/**
 * 以 `incoming` 为准（顺序、条数都听它的），内容没变的行沿用 `current` 里那个对象；
 * 一行都没变就返回 `current` 本身，React 因此不会重渲。本地乐观插入的行不在
 * `incoming` 里，自然被服务端那条替掉。
 */
export function mergeAgentMessages(
  current: AgentMessage[],
  incoming: AgentMessage[],
): AgentMessage[] {
  if (current === incoming) return current;
  const byId = new Map<number, AgentMessage>();
  for (const message of current) byId.set(message.id, message);
  let reused = incoming.length === current.length;
  const next = incoming.map((message, index) => {
    const previous = byId.get(message.id);
    const kept = previous && sameAgentRow(previous, message) ? previous : message;
    if (kept !== current[index]) reused = false;
    return kept;
  });
  return reused ? current : next;
}

/**
 * 增量响应：id ≤ `afterId` 的行服务端承诺不再变，原样保留；其后的行以 `delta` 为准
 * （还在长的行、刚写的行都在里面，`delta` 里没有的就是服务端已经没有了）。
 */
export function applyAgentDelta(
  current: AgentMessage[],
  delta: AgentMessage[],
  afterId: number,
): AgentMessage[] {
  const head = current.filter((message) => message.id <= afterId);
  const tail = delta.filter((message) => message.id > afterId);
  return mergeAgentMessages(current, [...head, ...tail]);
}

/** 网关支持按游标只取新行时，任务详情里会带 `next_after_id`。 */
export function readNextAfterId(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as { next_after_id?: unknown }).next_after_id;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
