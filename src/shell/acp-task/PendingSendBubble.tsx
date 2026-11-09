"use client";

// The home's first message on its task view (contract §2.5): the user's bubble from the local
// copy, until the stream has the message's own row. Same bubble the transcript draws for a prompt.

import { AgentTranscriptBubble } from "../AgentTranscriptBubble";
import type { AgentAttachment, AgentMessage } from "../../lib/agent";
import { useUI } from "../../i18n/ui/useUI";
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
    ...(attachment.artifact_id ? { artifact_id: attachment.artifact_id } : {}),
    ...(attachment.revision_id ? { revision_id: attachment.revision_id } : {}),
  }));
  return { id: 0, role: "user", kind: "text", content: pending.text, ...(files.length ? { meta: { attachments: files } } : {}) } as AgentMessage;
}

/** `errorText`: what the create or the send threw, verbatim; empty when there is nothing to say here. */
export function PendingSendBubble({
  pending,
  errorText,
  onRetry,
  onOpenAttachment,
}: {
  pending: PendingSend;
  errorText: string;
  onRetry?: () => void;
  onOpenAttachment?: (attachment: AgentAttachment) => void | Promise<boolean>;
}) {
  const tt = useUI();
  const statusText = pending.status === "queued" ? tt("已排队") : pending.status === "failed" ? tt("发送失败") : tt("正在发送");
  return (
    <div className="space-y-1.5" data-acp-pending-send={pending.id} data-acp-pending-status={pending.status}>
      <AgentTranscriptBubble message={pendingMessage(pending)} onOpenAttachment={onOpenAttachment} />
      <div className={`flex items-center justify-end gap-2 px-1 text-[12px] ${pending.status === "failed" ? "text-rose-500" : "text-stone-400"}`}>
        <span data-acp-pending-state="">{statusText}</span>
        {errorText && <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]" role="alert" data-acp-pending-error="">{errorText}</span>}
        {pending.status === "failed" && onRetry && (
          <button
            type="button"
            data-acp-pending-retry={pending.id}
            onClick={onRetry}
            className="shrink-0 rounded-lg border border-stone-200 px-2 py-0.5 text-[12px] text-stone-600 hover:bg-stone-50"
          >
            {tt("重试")}
          </button>
        )}
      </div>
    </div>
  );
}
