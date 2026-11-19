import type { AgentRenderItem } from "../../lib/agent-progress";
import type { AcpBlock } from "../../acp/messages";
import type { TranscriptItem } from "./TranscriptStream";

export function cloudTranscriptItems(items: readonly AgentRenderItem[]): TranscriptItem<AgentRenderItem>[] {
  return items.map((value) => ({ key: value.key,
    messageId: String(value.type === "message" ? value.message.id : value.messages[0]?.id ?? value.key), value }));
}
export function acpTranscriptItems(blocks: readonly AcpBlock[]): TranscriptItem<AcpBlock>[] {
  return blocks.map((value) => {
    const rowId = value.type === "bubble" ? value.message.id
      : value.type === "raw-request" ? value.request.rowId : value.messages[0]?.id;
    return { key: value.key, messageId: value.key, rowId, value };
  });
}
