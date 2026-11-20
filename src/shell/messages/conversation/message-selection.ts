// Select mode of a conversation (session / sites wave 2026-11-21, contract §1 "Forward / Copy"): which messages can
// be selected, the "Select all" cap, and the plain-text record Copy puts on the clipboard. Pure, so tests read it.
import type { ImMessage } from "../../../lib/im/types";
import { plainTextOf } from "./message-format";

/** A real, visible message: sent (seq > 0), not a system line, not recalled or hidden. */
export function isSelectableMessage(message: ImMessage): boolean {
  if (message.seq <= 0) return false;
  if (message.kind === "system" || message.sender_kind === "system") return false;
  if (message.recalled_at) return false;
  return message.hidden_reason !== "moderation" && message.hidden_reason !== "blocked";
}

export function selectableIds(messages: readonly ImMessage[]): string[] {
  return messages.filter(isSelectableMessage).map((message) => message.id);
}

/** Selected ids that are loaded, oldest first (the order Forward and Copy use). */
export function orderedSelection(messages: readonly ImMessage[], selected: ReadonlySet<string>): ImMessage[] {
  return messages.filter((message) => selected.has(message.id) && isSelectableMessage(message)).sort((a, b) => a.seq - b.seq);
}

/** Every loaded selectable message is selected and there is no older page left to add. */
export function everythingSelected(messages: readonly ImMessage[], selected: ReadonlySet<string>, hasMoreBefore: boolean): boolean {
  const ids = selectableIds(messages);
  if (ids.length === 0 || hasMoreBefore) return false;
  return ids.every((id) => selected.has(id));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `YYYY-MM-DD HH:MM` in the reader's time zone (the bundle line format of contract §2.3). */
export function recordTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function duration(ms: number | undefined): string {
  const seconds = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;
}

/** One message as one record line: `[Name] YYYY-MM-DD HH:MM: text (image: a.png) (file: b.pdf) (voice 0:12)`. */
export function recordLine(message: ImMessage, name: string): string {
  const parts: string[] = [];
  const text = plainTextOf(message.body ?? "").replace(/\s+/g, " ").trim();
  const card = message.card as { type?: string; title?: string; source_title?: string; count?: number } | null;
  if (text && !(card && (card.type === "task" || card.type === "quote"))) parts.push(text);
  for (const attachment of message.attachments ?? []) {
    if (attachment.kind === "voice") parts.push(`(voice ${duration(attachment.duration_ms)})`);
    else parts.push(`(${attachment.kind === "image" ? "image" : "file"}: ${attachment.name})`);
  }
  if (card?.type === "task") parts.push(`(task: ${card.title ?? ""})`);
  else if (card?.type === "quote") parts.push(`(quote: ${card.count ?? 0} messages from ${card.source_title ?? card.title ?? ""})`);
  else if (card?.title) parts.push(`(${card.type ?? "card"}: ${card.title})`);
  if (message.kind === "voice" && message.transcript?.text) parts.push(message.transcript.text.trim());
  return `[${name}] ${recordTime(message.created_at)}: ${parts.join(" ")}`.trimEnd();
}

/** The clipboard text for Copy: one line per selected message, oldest first. */
export function selectionText(messages: readonly ImMessage[], nameOf: (message: ImMessage) => string): string {
  return messages.map((message) => recordLine(message, nameOf(message))).join("\n");
}
