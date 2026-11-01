import type { AgentMessage } from "../../lib/agent";
import type { ComputerTaskSession } from "../../lib/computer-task-api";
import { applyDialog, initialDialogState } from "../cloud-computer/agent-dialog/reduce";
import { dialogToAgentMessages, type MapTranslate } from "./map-dialog";

export type NativeThreadSource = {
  session: Pick<ComputerTaskSession, "id" | "program" | "created_at">;
  messages: AgentMessage[];
};

export function mapNativeTranscript(
  session: Pick<ComputerTaskSession, "id" | "program" | "created_at" | "native_session_id">,
  frames: Record<string, unknown>[],
  tt?: MapTranslate,
): AgentMessage[] {
  const initial = initialDialogState();
  initial.program = session.program;
  initial.activeSession = session.native_session_id ?? "";
  const state = frames.reduce<ReturnType<typeof initialDialogState>>(
    (current, frame) => applyDialog(current, { type: "frame", frame }),
    initial,
  );
  const fallback = Date.parse(session.created_at || "");
  return dialogToAgentMessages(state.messages, { live: false, tt, engine: session.program ?? undefined }).map((message) =>
    message.created_at || !Number.isFinite(fallback) ? message : { ...message, created_at: new Date(fallback).toISOString() },
  );
}

function messageTime(message: AgentMessage, fallback: number): number {
  const value = message.created_at ? Date.parse(message.created_at) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

/** Merge every engine's mapped transcript into one stable, chronological stream. */
export function mergeNativeThreadMessages(sources: readonly NativeThreadSource[]): AgentMessage[] {
  const rows: { message: AgentMessage; time: number; source: number; order: number }[] = [];
  sources.forEach((source, sourceIndex) => {
    const fallback = Date.parse(source.session.created_at || "") || sourceIndex;
    source.messages.forEach((message, order) => rows.push({ message, time: messageTime(message, fallback), source: sourceIndex, order }));
  });
  rows.sort((a, b) => a.time - b.time || a.source - b.source || a.order - b.order);
  return rows.map(({ message }) => message);
}

