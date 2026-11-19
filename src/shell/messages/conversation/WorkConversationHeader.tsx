"use client";

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { blockUser } from "../../../lib/im/people-api";
import type { ImConversationSummary } from "../../../lib/im/types";
import { openMessages } from "../host-state";
import { ProfileCard } from "../people/ProfileCard";
import { ReportDialog } from "../report/ReportDialog";

export function WorkConversationHeader({ conversation, onBlocked }: { conversation: ImConversationSummary; onBlocked?: () => void }) {
  const tt = useUI();
  const [busy, setBusy] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState("");
  if (!conversation.work || !conversation.peer) return null;
  const peer = conversation.peer;
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await work(); }
    catch (err) { setError(err instanceof Error ? err.message : "没成功，请稍后再试。"); }
    finally { setBusy(false); }
  }
  return <div className="border-b border-neutral-200/80 px-3 py-2 text-xs" data-work-conversation="">
    <p className="truncate text-neutral-500" data-work-label="">{conversation.work.label}</p>
    <div className="mt-1 flex gap-3">
      <button type="button" onClick={() => setProfileOpen(true)}>{tt("查看资料")}</button>
      <button type="button" disabled={busy} onClick={() => void act(async () => { await blockUser(peer.user_id); onBlocked?.(); })}>{tt("拉黑")}</button>
      <button type="button" onClick={() => setReporting(true)}>{tt("举报")}</button>
    </div>
    {error ? <p role="alert" className="mt-1 text-red-600">{tt(error)}</p> : null}
    {profileOpen ? <ProfileCard userId={peer.user_id} onOpenConversation={(conversationId) => openMessages({ conversationId })} onClose={() => setProfileOpen(false)} /> : null}
    {reporting ? <ReportDialog target={{ kind: "user", id: peer.user_id, label: peer.display_name }} conversationId={conversation.id} onClose={() => setReporting(false)} /> : null}
  </div>;
}
