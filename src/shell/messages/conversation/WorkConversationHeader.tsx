"use client";

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { blockUser } from "../../../lib/im/people-api";
import type { ImConversationSummary } from "../../../lib/im/types";
import { openMessages } from "../host-state";
import { ProfileCard } from "../people/ProfileCard";
import { ReportDialog } from "../report/ReportDialog";

const TEXT_BUTTON =
  "shrink-0 rounded-lg px-2 py-1 text-[12px] font-medium text-stone-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-stone-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";

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
    catch { setError(tt("没成功，请稍后再试。")); }
    finally { setBusy(false); }
  }
  // The task page's text buttons (AgentChat header): rounded-lg, 12 px, stone.
  return <div className="flex shrink-0 flex-wrap items-center gap-1 px-3 pb-2 text-[12px]" data-work-conversation="">
    <p className="min-w-0 flex-1 truncate px-1 text-stone-500" data-work-label="">{conversation.work.label}</p>
    <button type="button" className={TEXT_BUTTON} onClick={() => setProfileOpen(true)}>{tt("查看资料")}</button>
    <button type="button" className={TEXT_BUTTON} disabled={busy} onClick={() => void act(async () => { await blockUser(peer.user_id); onBlocked?.(); })}>{tt("拉黑")}</button>
    <button type="button" className={TEXT_BUTTON} onClick={() => setReporting(true)}>{tt("举报")}</button>
    {error ? <p role="alert" className="w-full px-1 text-rose-600">{error}</p> : null}
    {profileOpen ? <ProfileCard userId={peer.user_id} onOpenConversation={(conversationId) => openMessages({ conversationId })} onClose={() => setProfileOpen(false)} /> : null}
    {reporting ? <ReportDialog target={{ kind: "user", id: peer.user_id, label: peer.display_name }} conversationId={conversation.id} onClose={() => setReporting(false)} /> : null}
  </div>;
}
