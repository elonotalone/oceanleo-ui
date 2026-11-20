// Pure rules of the two cards a session shows (session / sites wave 2026-11-21, contract §1 / §2.2).
// No React, no network.
import type { ImMessage, ImQuoteItem } from "../../lib/im/types";

export interface TaskCardData {
  taskId: string;
  /** The title the card was posted with (data). */
  title: string;
}

/** `card = {type:"task", child_kind:"agent_task", child_id, title}`; anything else → null. */
export function taskCardOf(message: Pick<ImMessage, "card">): TaskCardData | null {
  const card = message.card;
  if (!card || card.type !== "task") return null;
  const taskId = typeof card.child_id === "string" ? card.child_id.trim() : "";
  if (!taskId) return null;
  return { taskId, title: typeof card.title === "string" ? card.title : "" };
}

export interface QuoteCardData {
  sourceTitle: string;
  count: number;
  /** The snapshot, oldest first. */
  items: ImQuoteItem[];
}

function quoteItem(value: unknown): ImQuoteItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const text = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : "");
  const fileName = text("file_name");
  return {
    sender_name: text("sender_name"),
    sent_at: text("sent_at"),
    kind: text("kind") || "text",
    text: text("text"),
    ...(fileName ? { file_name: fileName } : {}),
  };
}

/** `card = {type:"quote", source_title, count, items}`; anything else → null. Never trusts `count` over the items. */
export function quoteCardOf(message: Pick<ImMessage, "card">): QuoteCardData | null {
  const card = message.card;
  if (!card || card.type !== "quote") return null;
  const items = (Array.isArray(card.items) ? card.items : []).map(quoteItem).filter((item): item is ImQuoteItem => Boolean(item));
  const declared = typeof card.count === "number" && Number.isFinite(card.count) && card.count > 0 ? Math.floor(card.count) : 0;
  return {
    sourceTitle: typeof card.source_title === "string" ? card.source_title : "",
    count: declared || items.length,
    items,
  };
}

/** The text a quoted line shows on one line (newlines folded); an attachment-only line shows its file name. */
export function quoteLineText(item: ImQuoteItem): string {
  const text = item.text.replace(/\s+/g, " ").trim();
  return text || item.file_name || "";
}

/** What the card itself previews: the first two quoted lines. */
export function quotePreview(card: QuoteCardData, lines = 2): ImQuoteItem[] {
  return card.items.slice(0, lines);
}

/** What a reader may do with a task card: still asking, open it, or only read its title. */
export type TaskCardAccess = "checking" | "allowed" | "denied" | "unknown";

/** Task activity → the word on the card (null = no word: unknown or not read yet). */
export type TaskCardStatus = "working" | "waiting" | "idle";

export function taskCardStatus(activity: { activity_state?: unknown } | null | undefined): TaskCardStatus | null {
  switch (activity?.activity_state) {
    case "working":
      return "working";
    case "waiting_user":
      return "waiting";
    case "idle":
      return "idle";
    default:
      return null;
  }
}

const PROGRAM_NAMES: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  hermes: "Hermes",
  oceanleo: "OceanLeo",
};

export function programName(program: unknown): string {
  if (typeof program !== "string" || !program) return "";
  return PROGRAM_NAMES[program] ?? program;
}
