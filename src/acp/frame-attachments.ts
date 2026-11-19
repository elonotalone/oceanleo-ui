import type { AgentAttachment } from "../lib/agent";
import { isTaskContentId, taskAttachmentRoute } from "../lib/task-content-path";
import type { AcpBlock } from "./messages";

type RecordValue = Record<string, unknown>;
const blockLocations = new WeakMap<object, { rowId: number; index: number }>();
const fileLocations = new WeakMap<object, number>();
const record = (value: unknown): value is RecordValue => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Same standard content order as the gateway's frame_blocks; never inspect raw tool JSON. */
export function frameContentBlocks(message: RecordValue): RecordValue[] {
  const params = message.params;
  if (!record(params)) return [];
  if (message.method === "session/prompt") return Array.isArray(params.prompt) ? params.prompt.filter(record) : [];
  if (message.method !== "session/update" || !record(params.update)) return [];
  const update = params.update;
  if (["agent_message_chunk", "agent_thought_chunk", "user_message_chunk"].includes(String(update.sessionUpdate))) {
    return record(update.content) ? [update.content] : [];
  }
  if (["tool_call", "tool_call_update"].includes(String(update.sessionUpdate)) && Array.isArray(update.content)) {
    return update.content.flatMap(part => record(part) && part.type === "content" && record(part.content) ? [part.content] : []);
  }
  return [];
}

/** Annotate only the parsed display copy, before reducer merges chunks or tool updates. */
export function locateFrameFiles(message: RecordValue, rowId: number): void {
  frameContentBlocks(message).forEach((block, index) => {
    if (["image", "audio", "resource", "resource_link"].includes(String(block.type))) blockLocations.set(block, { rowId, index });
  });
  const params = message.params;
  const update = record(params) && record(params.update) ? params.update : null;
  if (message.method === "session/update" && update && ["tool_call", "tool_call_update"].includes(String(update.sessionUpdate))) {
    if (Array.isArray(update.locations)) update.locations.filter(record).forEach(location => { fileLocations.set(location, rowId); });
  }
}

export function frameFileLocator(block: unknown): string | undefined {
  const locator = record(block) ? blockLocations.get(block) : undefined;
  return locator && Number.isSafeInteger(locator.rowId) && Number(locator.rowId) > 0 && Number.isSafeInteger(locator.index) && Number(locator.index) >= 0
    ? `oceanleo-frame-block://${locator.rowId}/${locator.index}` : undefined;
}

export function frameLocationRow(location: object): number | undefined {
  return fileLocations.get(location);
}

/** Scope both bubbles and nested tool cards through the existing private attachment reader. */
export function scopeFrameFiles(block: AcpBlock, taskId: string): AcpBlock {
  if (!isTaskContentId(taskId)) return block;
  const attachment = (value: AgentAttachment, rowId: number): AgentAttachment => {
    const locator = /^oceanleo-frame-block:\/\/([1-9][0-9]*)\/([0-9]+)$/.exec(value.url);
    const url = locator ? `/v1/tasks/${taskId}/frames/${locator[1]}/blocks/${locator[2]}`
      : taskAttachmentRoute({ taskId, kind: "frames", rowId, artifactId: value.artifact_id || "", revisionId: value.revision_id });
    return url ? { ...value, url } : value;
  };
  const card = (value: unknown, rowId: number): unknown => {
    if (!record(value)) return value;
    return { ...value,
      ...(Array.isArray(value.content) ? { content: value.content.map(part => record(part) && record(part.attachment)
        ? { ...part, attachment: attachment(part.attachment as unknown as AgentAttachment, rowId) } : part) } : {}),
      ...(Array.isArray(value.locations) ? { locations: value.locations.map(loc => record(loc) ? { ...loc, taskId } : loc) } : {}),
      ...(Array.isArray(value.children) ? { children: value.children.map(child => card(child, rowId)) } : {}),
    };
  };
  const message = (value: Extract<AcpBlock, { type: "bubble" }>["message"]) => value.meta ? { ...value, meta: { ...value.meta,
    ...(value.meta.attachments ? { attachments: value.meta.attachments.map(file => attachment(file, value.id)) } : {}),
    ...(value.meta.tool_card ? { tool_card: card(value.meta.tool_card, value.id) as RecordValue } : {}),
  } } : value;
  return block.type === "bubble" ? { ...block, message: message(block.message) }
    : block.type === "process" ? { ...block, messages: block.messages.map(message) } : block;
}
