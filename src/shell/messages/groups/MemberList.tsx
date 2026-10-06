"use client";

// 成员列表：角色、「外部」标记、在线状态；按我的角色显示 设管理员 / 转让 / 移出（契约 §9.4）。

import { useMemo, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { ConfirmDialog } from "../../../ui";
import { memberActionsFor, removeMember, setMemberRole } from "../../../lib/im/groups-api";
import { reasonOf } from "../../../lib/im/people-api";
import type { ImConversationDetail, ImMember, ImRole } from "../../../lib/im/types";
import { usePresence } from "../realtime/hooks";
import { PersonAvatar, PresenceDot } from "./GroupAvatar";

export interface MemberListProps {
  detail: ImConversationDetail;
  myUserId: string | null;
  onOpenProfile: (userId: string) => void;
  /** 成员或角色有变化后，让上层重新拉详情 */
  onChanged: () => void;
}

const ROLE_COPY: Record<ImRole, string> = { owner: "群主", admin: "管理员", member: "" };
const ROLE_ORDER: Record<ImRole, number> = { owner: 0, admin: 1, member: 2 };
const PAGE = 50;

type Pending = { kind: "transfer" | "remove"; member: ImMember } | null;

export function MemberList({ detail, myUserId, onOpenProfile, onChanged }: MemberListProps) {
  const tt = useUI();
  const [showAll, setShowAll] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const members = useMemo(
    () =>
      detail.members
        .slice()
        .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.profile.display_name.localeCompare(b.profile.display_name)),
    [detail.members],
  );
  const shown = showAll ? members : members.slice(0, PAGE);
  const ids = useMemo(() => shown.map((m) => m.user_id), [shown]);
  const presence = usePresence(ids);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setNote(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      // 后端拒绝时直接显示后端给的原因
      setNote(reasonOf(e, tt("没成功，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  }

  const small = "rounded px-1.5 py-0.5 text-[11px] hover:bg-neutral-100 disabled:opacity-50";

  return (
    <div data-member-list>
      {detail.leo_enabled && detail.kind !== "dm" && (
        <div className="flex items-center gap-3 px-3 py-1.5" data-leo-row>
          <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-[12px] font-semibold text-violet-700">
            L
          </span>
          <span className="text-[13px] text-neutral-700">{tt("leo（AI）")}</span>
        </div>
      )}
      <ul>
        {shown.map((m) => {
          const actions = memberActionsFor(detail, m, myUserId);
          const state = presence[m.user_id] ?? "offline";
          const roleText = ROLE_COPY[m.role];
          return (
            <li key={m.user_id} data-member={m.user_id} data-role={m.role} className="flex items-center gap-2 px-3 py-1.5 hover:bg-neutral-50">
              <button type="button" onClick={() => onOpenProfile(m.user_id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <PersonAvatar name={m.profile.display_name} src={m.profile.avatar_url} seed={m.user_id} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] text-neutral-900">{m.profile.display_name}</span>
                    {m.user_id === myUserId && <span className="text-[11px] text-neutral-400">{tt("我")}</span>}
                    {roleText && (
                      <span data-role-badge className="rounded bg-neutral-100 px-1.5 text-[10px] leading-4 text-neutral-600">
                        {tt(roleText)}
                      </span>
                    )}
                    {m.external && (
                      <span data-external-badge className="rounded bg-amber-50 px-1.5 text-[10px] leading-4 text-amber-700">
                        {tt("外部")}
                      </span>
                    )}
                  </span>
                  <span data-presence={state} className="flex items-center gap-1 text-[11px] text-neutral-400">
                    <PresenceDot presence={state} />
                    {state === "online" ? tt("在线") : state === "away" ? tt("离开") : tt("离线")}
                  </span>
                </span>
              </button>
              {actions.canSetAdmin && (
                <button type="button" disabled={busy} data-action="set-admin" className={`${small} text-neutral-600`} onClick={() => run(() => setMemberRole(detail.id, m.user_id, "admin"))}>
                  {tt("设为管理员")}
                </button>
              )}
              {actions.canRevokeAdmin && (
                <button type="button" disabled={busy} data-action="revoke-admin" className={`${small} text-neutral-600`} onClick={() => run(() => setMemberRole(detail.id, m.user_id, "member"))}>
                  {tt("取消管理员")}
                </button>
              )}
              {actions.canTransfer && (
                <button type="button" disabled={busy} data-action="transfer" className={`${small} text-neutral-600`} onClick={() => setPending({ kind: "transfer", member: m })}>
                  {tt("转让群主")}
                </button>
              )}
              {actions.canRemove && (
                <button type="button" disabled={busy} data-action="remove" className={`${small} text-red-600`} onClick={() => setPending({ kind: "remove", member: m })}>
                  {tt("移出")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {members.length > shown.length && (
        <button type="button" onClick={() => setShowAll(true)} className="px-3 py-2 text-[12px] text-neutral-500 hover:text-neutral-800">
          {tt("显示全部 {n} 人", { n: members.length })}
        </button>
      )}
      {note && (
        <p role="alert" data-member-note className="px-3 py-2 text-[12px] text-red-600">
          {note}
        </p>
      )}
      {pending && (
        <ConfirmDialog
          title={pending.kind === "transfer" ? "转让群主" : "移出成员"}
          body={
            pending.kind === "transfer"
              ? "转让后你变成管理员，对方成为群主。确定吗？"
              : "对方会被移出这个群，看不到之后的消息。确定吗？"
          }
          confirmLabel={pending.kind === "transfer" ? "转让" : "移出"}
          danger={pending.kind === "remove"}
          onCancel={() => setPending(null)}
          onConfirm={async () => {
            const p = pending;
            setPending(null);
            await run(() =>
              p.kind === "transfer" ? setMemberRole(detail.id, p.member.user_id, "owner") : removeMember(detail.id, p.member.user_id),
            );
          }}
        />
      )}
    </div>
  );
}
