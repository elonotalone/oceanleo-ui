import {
  applyDialog, initialDialogState, dialogToAgentMessages,
  mergeSavedAndLive, mergeTranscriptPages, mapNativeTranscript,
  mergeNativeThreadMessages, idleStop, stopMachine,
  type AgentDialogMessage, type NativeAgentMessage, type NativeTranscriptSession,
} from "@oceanleo/ui/native-agent-core";
// @ts-expect-error Browser controller contracts belong to the web facade only.
import type { AgentDialogController } from "@oceanleo/ui/native-agent-core";

const state = applyDialog(initialDialogState(), { type: "frame", frame: { t: "status" } });
const rows: AgentDialogMessage[] = mergeTranscriptPages([], state.messages);
const mapped: NativeAgentMessage[] = dialogToAgentMessages(mergeSavedAndLive([], rows).messages, { live: false });
const session: NativeTranscriptSession = {
  id: "cts_native", program: "codex", created_at: "2026-11-03T00:00:00Z", native_session_id: "native",
};
mergeNativeThreadMessages([{ session, messages: [...mapped, ...mapNativeTranscript(session, [])] }]);
stopMachine(idleStop(), { type: "begin", stopId: "st_native", session: "native" });

// Console is supplied by both RN and Node; no DOM ambient types are needed.
declare global {
  const console: { debug: (...values: unknown[]) => void };
}
