// 「分享」 on a computer task (UX wave 2026-11-07, unit SH): the words a user can pick are the bubbles the transcript
// shows for them — their prompts and the program's text replies. Thoughts, tool steps, plans, approvals, notices and
// a sub-agent's words are not picked. Pure: the same view always gives the same items.
//
// Each picked message names the stored frame rows it is made of (`acp_frames` ids, ascending): a prompt is its client
// `session/prompt` row, a reply is every `agent_message_chunk` row of it. The share link is built from those rows on
// the server, so nothing typed on the page can end up in a link.

import type { AgentMessage } from "../lib/agent";
import { viewBlocks, type AcpLabels } from "./messages";
import type { AcpItem, AcpView } from "./types";

export type AcpShareItems = {
  /** The pickable messages in transcript order: the same objects the transcript's text bubbles render. */
  messages: AgentMessage[];
  /** Message id (its first row id) → the frame row ids it is made of. */
  rowIds: ReadonlyMap<number, readonly number[]>;
};

// Text bubbles print none of these; the notices that would are not pickable.
const NO_LABELS: AcpLabels = {
  gap: () => "",
  oversize: () => "",
  exit: () => "",
  stopReason: () => "",
  cancelled: "",
  permissionPrompt: "",
};

export function acpShareItems(view: AcpView): AcpShareItems {
  const rowIds = new Map<number, readonly number[]>();
  const words = (items: readonly AcpItem[]) => {
    for (const item of items) if (item.type === "message" && !item.scope && item.rowIds.length) rowIds.set(item.rowIds[0], item.rowIds);
  };
  words(view.preamble);
  for (const turn of view.turns) {
    rowIds.set(turn.rowId, [turn.rowId]);
    words(turn.items);
  }
  // A turn's error and stop notices reuse the prompt's row id; only `text` bubbles are words.
  const messages = viewBlocks(view, NO_LABELS).flatMap((block) =>
    block.type === "bubble" && block.message.kind === "text" && rowIds.has(block.message.id) ? [block.message] : [],
  );
  return { messages, rowIds };
}
