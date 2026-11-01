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
  // Untimed rows (replies, steps) are placed by the merge, after the timed row before them.
  return dialogToAgentMessages(state.messages, { live: false, tt, engine: session.program ?? undefined });
}


/** Merge every engine's mapped transcript into one stable, chronological stream. */
export function mergeNativeThreadMessages(sources: readonly NativeThreadSource[]): AgentMessage[] {
  const rows: { message: AgentMessage; time: number; source: number; order: number }[] = [];
  sources.forEach((source, sourceIndex) => {
    // Only user prompts carry a time in saved transcripts: a reply or step takes the time
    // of the row before it in its own session, so it stays right after its prompt.
    let time = Date.parse(source.session.created_at || "") || sourceIndex;
    source.messages.forEach((message, order) => {
      const own = message.created_at ? Date.parse(message.created_at) : NaN;
      if (Number.isFinite(own)) time = own;
      rows.push({ message, time, source: sourceIndex, order });
    });
  });
  rows.sort((a, b) => a.time - b.time || a.source - b.source || a.order - b.order);
  return rows.map(({ message }) => message);
}

