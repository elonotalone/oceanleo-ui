"use client";

import { useUI } from "../../../i18n/ui/useUI";
import { conversationDisplayTitle } from "../../../lib/im/people-api";
import type { ImConversationSummary } from "../../../lib/im/types";
import { MessageSettingsDialog, MESSAGE_SETTINGS_ROW, QUIET } from "../MessageSettingsFrame";

export function ForwardMessagesDialog({ targets, error, busy, onForward, onClose }: {
  targets: ImConversationSummary[];
  error: string | null;
  busy: boolean;
  onForward: (conversationId: string) => void;
  onClose: () => void;
}) {
  const tt = useUI();
  return <MessageSettingsDialog title={tt("转发到会话")} onClose={onClose}>
    {error ? <p role="alert" className="mb-2 text-sm text-red-600">{tt(error)}</p> : null}
    {!targets.length && !error ? <p className="py-4 text-center text-sm text-neutral-500">{tt("正在加载会话…")}</p> : null}
    <div className="space-y-2">
      {targets.map((target) => <button key={target.id} type="button" disabled={busy} className={`${MESSAGE_SETTINGS_ROW} w-full text-left text-sm hover:bg-neutral-50 disabled:opacity-50`} onClick={() => onForward(target.id)}>{conversationDisplayTitle(target)}</button>)}
    </div>
    <div className="mt-4 flex justify-end"><button type="button" className={QUIET} onClick={onClose}>{tt("取消")}</button></div>
  </MessageSettingsDialog>;
}
