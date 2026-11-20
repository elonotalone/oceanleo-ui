"use client";

// Forward chat messages (session/sites wave 2026-11-21, contract §2.3). CONTRACT STUB written by the wave
// parent: unit UT replaces the bodies and keeps every exported name and signature; unit UC renders
// <ForwardPicker/> as the second page of the conversation's Forward / Copy menu; unit US opens the right
// panel on `oceanleo:open-task-panel`.
import type { ReactElement } from "react";

/** What `POST /v1/im/conversations/{id}/bundles` answers. */
export interface ChatBundle {
  id: string;
  /** Name of the source chat or session. */
  title: string;
  messages: number;
  chars: number;
  /** inline: `text` is the whole record. file: `text` is an overview plus the newest lines, `attachment` the full record. */
  mode: "inline" | "file";
  text: string;
  /** Same object shape the task composer keeps for a private Library upload (mode "file" only). */
  attachment?: Record<string, unknown> | null;
}

export type ForwardTaskTarget = { kind: "new-task" } | { kind: "task"; taskId: string; title: string };

export interface ForwardPickerProps {
  source: { conversationId: string; title: string };
  /** Selected message ids, oldest first. */
  messageIds: readonly string[];
  /** Called after the messages were handed over (task panel opened, or quote card posted). */
  onDone: () => void;
  onCancel: () => void;
}

export const OPEN_TASK_PANEL_EVENT = "oceanleo:open-task-panel";
/** detail of OPEN_TASK_PANEL_EVENT: open the right panel on this task, or on a new task draft when taskId is absent. */
export interface OpenTaskPanelDetail { taskId?: string; title?: string }

const pending = new Map<string, ChatBundle[]>();
const key = (target: ForwardTaskTarget) => (target.kind === "task" ? target.taskId : "new-task");

/** The picker stores the bundle; the task composer for that target takes it when it mounts or on the event. */
export function setPendingForward(target: ForwardTaskTarget, bundle: ChatBundle): void {
  pending.set(key(target), [...(pending.get(key(target)) ?? []), bundle]);
}

export function takePendingForward(target: ForwardTaskTarget): ChatBundle[] {
  const found = pending.get(key(target)) ?? [];
  pending.delete(key(target));
  return found;
}

export function openTaskPanel(detail: OpenTaskPanelDetail): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_TASK_PANEL_EVENT, { detail }));
}

/** `<chat-record …>` block a bundle becomes inside the message text (contract §2.3). */
export function chatRecordBlock(bundle: ChatBundle): string {
  const attr = (value: string) => value.replace(/["<>\n]/g, " ").trim();
  const file = bundle.mode === "file" ? ` file="1"` : "";
  return `<chat-record title="${attr(bundle.title)}" messages="${bundle.messages}"${file}>\n${bundle.text.trim()}\n</chat-record>`;
}

export function ForwardPicker(_props: ForwardPickerProps): ReactElement | null {
  return null;
}
