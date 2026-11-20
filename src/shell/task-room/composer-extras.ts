// What a task's conversation adds to the people composer (task rooms wave 2026-11-20, TU1):
// an "Ask an agent" button next to send, and agent rows in the @ list that open the summon
// dialog instead of sending. The composer itself (owned by TU3) renders them; see
// signals/TU1-needs.md for the exact behaviour.
import type { ReactNode } from "react";

export interface ComposerExtraMention {
  key: string;
  /** Already translated, or data (a sub task title). */
  label: string;
  hint?: string;
  /** Called instead of inserting a mention; the typed "@query" is removed. */
  onPick: () => void;
}

export interface ComposerExtras {
  /** Rendered immediately before the send button. */
  sendAccessory?: ReactNode;
  extraMentions?: ComposerExtraMention[];
}

/** Rows whose label contains the typed query (case-insensitive); an empty query keeps all. */
export function filterExtraMentions(rows: readonly ComposerExtraMention[], query: string): ComposerExtraMention[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...rows];
  return rows.filter((row) => row.label.toLowerCase().includes(needle));
}
