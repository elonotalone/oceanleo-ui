"use client";

// The home's first message on its task view (contract §2.5): the user's bubble from the local
// copy, until the stream has the message's own row. Same bubble the transcript draws for a prompt.

import { AgentTranscriptBubble } from "../AgentTranscriptBubble";
import type { AgentAttachment, AgentMessage } from "../../lib/agent";
import { knownComputer, lastKnownComputer } from "../../lib/computer-task-api";
import type { ConversationTarget, NativeProgram } from "../native-thread/types";
import type { PendingAttachment } from "../useAttachments";
import type { PendingSend } from "./pending-send";

/** The program's chat on that computer: the task view's dock and composer address it before the task exists. */
export function pendingConversation(pending: PendingSend | null): Extract<ConversationTarget, { kind: "native" }> | undefined {
  if (!pending) return undefined;
  const computer = knownComputer(pending.computerId) ?? lastKnownComputer(pending.computerId);
  return {
    kind: "native",
    view: "chat",
    computerId: pending.computerId,
    computerName: computer?.name || pending.computerId,
    program: pending.program as NativeProgram,
  };
}

/** The message's files as composer tiles again (a failed send hands them back to the user). */
export function pendingAttachmentTiles(attachments: readonly AgentAttachment[]): PendingAttachment[] {
  return attachments.map((attachment, index) => ({
    id: attachment.artifact_id ? `${attachment.artifact_id}:${attachment.revision_id || ""}` : `pending-${index}`,
    name: attachment.name || "",
    ...(attachment.mime ? { mime: attachment.mime } : {}),
    uploading: false,
    attachment,
    ...(attachment.artifact_id ? { artifactId: attachment.artifact_id } : {}),
    ...(attachment.revision_id ? { revisionId: attachment.revision_id } : {}),
  }));
}

function pendingMessage(pending: PendingSend): AgentMessage {
  const files: AgentAttachment[] = pending.attachments.map((attachment) => ({
    url: "",
    name: attachment.name,
    ...(attachment.mime ? { mime: attachment.mime } : {}),
    ...(attachment.media_type ? { media_type: attachment.media_type } : {}),
  }));
  return { id: 0, role: "user", kind: "text", content: pending.text, ...(files.length ? { meta: { attachments: files } } : {}) } as AgentMessage;
}

/** `errorText`: what the create or the send threw, verbatim; empty when there is nothing to say here. */
export function PendingSendBubble({ pending, errorText }: { pending: PendingSend; errorText: string }) {
  return (
    <div className="space-y-1.5" data-acp-pending-send={pending.id}>
      <AgentTranscriptBubble message={pendingMessage(pending)} />
      {errorText && (
        <p className="whitespace-pre-wrap break-words px-1 text-right text-[13px] text-rose-500 [overflow-wrap:anywhere]" role="alert" data-acp-pending-error="">
          {errorText}
        </p>
      )}
    </div>
  );
}
