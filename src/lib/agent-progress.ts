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
  messages: AgentMessage[];
  startIndex: number;
  endIndex: number;
}

export type AgentRenderItem =
  | AgentMessageRenderItem
  | AgentProgressRenderItem;

export interface AgentProgressAction {
  id: string;
  index: number;
  labels: string[];
  analysis: AgentMessage | null;
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


function progressMetaNumber(message: AgentMessage, key: string): number {
  const value = Number(message.meta?.[key] || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}


/** Pair analysis and tool rows without colliding legacy and indexed events. */
export function buildAgentProgressActions(
  messages: AgentMessage[],
): AgentProgressAction[] {
  const actions = new Map<string, AgentProgressAction>();
  let legacyIndex = 0;
  let lastAnalysisKey = "";

  const ensure = (key: string): AgentProgressAction => {
    const existing = actions.get(key);
    if (existing) return existing;
    const created: AgentProgressAction = {
      id: `action-${key}`,
      index: actions.size + 1,
      labels: [],
      analysis: null,
    };
    actions.set(key, created);
    return created;
  };

  for (const message of messages) {
    if (message.kind === "plan" || message.meta?.plan === true) continue;
    const explicit = progressMetaNumber(message, "step_index");
    if (message.kind === "analysis" || message.meta?.interim === true) {
      const key = explicit ? `step-${explicit}` : `legacy-${++legacyIndex}`;
      const action = ensure(key);
      action.analysis = message;
      lastAnalysisKey = key;
      continue;
    }
    if (message.kind === "step") {
      const key =
        (explicit ? `step-${explicit}` : "") ||
        lastAnalysisKey ||
        `legacy-${++legacyIndex}`;
      const action = ensure(key);
      const label = (message.content || "").replace(/^▶\s*/, "").trim();
      if (label && !action.labels.includes(label)) action.labels.push(label);
      lastAnalysisKey = "";
    }
  }
  return [...actions.values()];
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


/**
 * Aggregate all process messages in one user turn into one progress card.
 *
 * Artifacts and final answers keep their original relative order. The card is
 * inserted where the first process event occurred, so a task never degenerates
 * into many disconnected Thought/code bubbles when artifacts arrive mid-run.
 */
export function buildAgentRenderItems(
  messages: AgentMessage[],
): AgentRenderItem[] {
  const items: AgentRenderItem[] = [];
  let segmentStart = 0;

  while (segmentStart < messages.length) {
    let segmentEnd = segmentStart + 1;
    while (
      segmentEnd < messages.length &&
      messages[segmentEnd].role !== "user"
    ) {
      segmentEnd += 1;
    }

    const progressIndexes: number[] = [];
    for (let index = segmentStart; index < segmentEnd; index += 1) {
      if (isAgentProgressMessage(messages[index])) progressIndexes.push(index);
    }
    const progressSet = new Set(progressIndexes);
    const firstProgress = progressIndexes[0] ?? -1;

    for (let index = segmentStart; index < segmentEnd; index += 1) {
      const message = messages[index];
      // Trusted workspace actions are machine-to-UI transport. They must never
      // appear as an empty or JSON-shaped chat bubble.
      if (message.kind === "ui_action") continue;
      if (index === firstProgress) {
        const progressMessages = progressIndexes.map(
          (progressIndex) => messages[progressIndex],
        );
        items.push({
          type: "progress",
          key: `progress-${message.id}-${segmentStart}`,
          messages: progressMessages,
          startIndex: firstProgress,
          endIndex: progressIndexes[progressIndexes.length - 1],
        });
      }
      if (progressSet.has(index)) continue;
      items.push({
        type: "message",
        key: `message-${message.id}-${index}`,
        message,
        index,
      });
    }
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
