"use client";

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { blockUser, findFollowing, followPerson, getMe, getProfile, listBlocks, openDm, peopleMessageError, setUserRemark, unblockUser, unfollowPerson, useLoader, visiblePersonName } from "../../../lib/im/people-api";
import { MessagePromptDialog, PRIMARY, QUIET } from "../MessageSettingsFrame";
import { PersonAvatar } from "../groups/GroupAvatar";
import { ReportDialog } from "../report/ReportDialog";
import { PeopleFailure } from "./PeopleDiscovery";

export interface ProfileCardProps {
  userId: string;
  conversationId?: string | null;
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
}

export function ProfileCard({ userId, onClose, onOpenConversation }: ProfileCardProps) {
  const tt = useUI();
  const profile = useLoader(() => getProfile(userId), [userId]);
  const me = useLoader(getMe, []);
  const blocks = useLoader(listBlocks, []);
  const following = useLoader(() => findFollowing(userId), [userId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reporting, setReporting] = useState(false);
  const [remark, setRemark] = useState<string | null>(null);
  const followedPerson = following.data;
  const p = profile.data ?? (followedPerson ? {
    user_id: followedPerson.user_id, display_name: followedPerson.name, avatar_url: followedPerson.avatar_url, remark: undefined,
  } : null);
  const blocked = !!blocks.data?.some(person => person.user_id === userId);
  const follows = !!following.data;
  const self = me.data?.user_id === userId;
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); } catch (e) { setError(e); } finally { setBusy(false); }
  }
  if (reporting) return <ReportDialog target={{ kind: "user", id: userId, label: p?.display_name }} onClose={() => setReporting(false)} />;
  return <MessagePromptDialog title={tt("查看资料")} onClose={onClose}>
    <div data-profile-card>
      {profile.loading ? <p role="status">{tt("加载中…")}</p> : profile.error ? <PeopleFailure error={profile.error} /> : p ? <div className="mb-3 flex items-center gap-3">
        <PersonAvatar name={visiblePersonName(p)} src={p.avatar_url} seed={userId} size={48} /><h3 className="text-[14px] font-semibold">{visiblePersonName(p)}</h3>
      </div> : <p className="text-[12px]">{tt("找不到这个人，或者你看不到他的资料。")}</p>}
      {!self && <>
        {following.error != null && <PeopleFailure error={following.error} />}
        {blocks.error != null && <PeopleFailure error={blocks.error} />}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={PRIMARY} data-action="follow" disabled={busy || blocked || blocks.loading || !!blocks.error || following.loading || !!following.error} onClick={() => void run(async () => {
            if (follows) await unfollowPerson(userId); else await followPerson(userId);
            following.reload(); window.dispatchEvent(new Event("im:following-changed"));
          })}>{tt(follows ? "已关注" : "关注")}</button>
          <button type="button" className={QUIET} data-action="dm" disabled={busy || blocked || blocks.loading || !!blocks.error} onClick={() => void run(async () => { const id = await openDm(userId); if (id) { onOpenConversation(id); onClose(); } })}>{tt("发消息")}</button>
          <button type="button" className={QUIET} data-action="block" disabled={busy || blocks.loading || !!blocks.error} onClick={() => void run(async () => { if (blocked) await unblockUser(userId); else await blockUser(userId); blocks.reload(); })}>{tt(blocked ? "取消拉黑" : "拉黑")}</button>
          <button type="button" className={QUIET} data-action="report" onClick={() => setReporting(true)}>{tt("举报")}</button>
        </div>
        {p && <form className="mt-3" onSubmit={e => { e.preventDefault(); void run(async () => { await setUserRemark(userId, (remark ?? p.remark ?? "").trim()); profile.reload(); }); }}>
          <label className="block text-[12px]">{tt("备注")}<input value={remark ?? p.remark ?? ""} maxLength={40} onChange={e => setRemark(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2" /></label>
          <button type="submit" disabled={busy} className={`${QUIET} mt-2`}>{tt("保存")}</button>
        </form>}
      </>}
      {error != null && <p role="alert" className="mt-2 text-[12px] text-red-600">{peopleMessageError(error, tt)}</p>}
    </div>
  </MessagePromptDialog>;
}
