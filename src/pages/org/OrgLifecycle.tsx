"use client";

import { useState } from "react";
import { dissolveOrg, leaveOrg, removeOrgMember, transferOrgOwnership, orgApiCode, orgErrorCopy, type OrgMemberRow, type OrgRole } from "../../lib/org-api";
import { useUI } from "../../i18n/ui/useUI";

type Action = { kind: "remove"; member: OrgMemberRow } | { kind: "transfer"; member: OrgMemberRow } | { kind: "leave" } | { kind: "dissolve" };
export function OrgLifecycle({ orgId, name, role, members = [], onChanged }: {
  orgId: string; name: string; role: OrgRole; members?: OrgMemberRow[]; onChanged: () => void | Promise<void>;
}) {
  const tt = useUI();
  const [action, setAction] = useState<Action | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const button = "rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px]";
  function open(next: Action) { setAction(next); setConfirmName(""); setError(""); }
  async function submit() {
    if (!action || busy || (action.kind === "dissolve" && confirmName !== name)) return;
    setBusy(true); setError("");
    try {
      if (action.kind === "remove") await removeOrgMember(orgId, action.member.userId);
      else if (action.kind === "transfer") await transferOrgOwnership(orgId, action.member.userId);
      else if (action.kind === "leave") await leaveOrg(orgId);
      else await dissolveOrg(orgId, confirmName);
      setAction(null);
      await onChanged();
    } catch (e) { setError(orgErrorCopy(orgApiCode(e), tt)); }
    finally { setBusy(false); }
  }
  return <div className="mt-3 space-y-2" data-org-lifecycle={orgId}>
    {role !== "owner" && <button className={button} type="button" data-org-leave="1" onClick={() => open({ kind: "leave" })}>{tt("退出团队")}</button>}
    {(role === "owner" || role === "admin") && members.filter((m) => m.role !== "owner").map((member) => <div className="flex flex-wrap items-center gap-2 text-[12px]" key={member.userId}>
      <span>{member.email || member.userId}</span>
      <button type="button" className={button} data-org-remove={member.userId} onClick={() => open({ kind: "remove", member })}>{tt("移除成员")}</button>
      {role === "owner" && <button type="button" className={button} data-org-transfer-owner={member.userId} onClick={() => open({ kind: "transfer", member })}>{tt("转让负责人")}</button>}
    </div>)}
    {role === "owner" && <button type="button" className={button} data-org-dissolve="1" onClick={() => open({ kind: "dissolve" })}>{tt("解散团队")}</button>}
    {action && <form role="dialog" aria-label={tt("确认操作")} className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <p className="text-[13px]">{action.kind === "dissolve" ? tt("解散后，全部余额退回你的个人钱包，所有成员会被移除，邀请链接不再有效。请输入团队名「{name}」确认。", { name })
        : action.kind === "leave" ? tt("确认退出「{name}」？", { name })
        : action.kind === "remove" ? tt("确认将「{name}」移出团队？", { name: action.member.email || action.member.userId })
        : tt("确认将负责人转给「{name}」？你将成为管理员。", { name: action.member.email || action.member.userId })}</p>
      {action.kind === "dissolve" && <input aria-label={tt("团队名")} data-org-confirm-name="1" value={confirmName} disabled={busy} onChange={(e) => setConfirmName(e.target.value)} className="rounded-lg border border-neutral-200 px-3 py-2" />}
      <div className="flex gap-2">
        <button type="submit" className={button} data-org-action-confirm="1" disabled={busy || (action.kind === "dissolve" && confirmName !== name)}>{tt("确认操作")}</button>
        <button type="button" className={button} disabled={busy} onClick={() => setAction(null)}>{tt("取消")}</button>
      </div>
      {error && <p className="text-[12px] text-rose-700" role="status">{error}</p>}
    </form>}
  </div>;
}
