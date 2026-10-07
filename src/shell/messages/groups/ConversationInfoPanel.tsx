"use client";

// 会话信息：群资料、成员与角色、加人、入群申请、邀请链接、我的通知设置、退出 / 解散 / 升级成 Team / 举报。
// 哪些按钮出现由 conversationCaps（契约 §9.3 / §9.4）按我的角色决定；后端拒绝时显示后端给的原因。

import { useMemo, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { portalHref } from "../../../contracts/domain-family";
import { ConfirmDialog } from "../../../ui";
import { ImCloseIcon } from "../messages-surface";
import { listMyOrgs } from "../../../lib/org-api";
import {
  MUTE_CHOICES,
  NOTIFY_CHOICES,
  addMembers,
  conversationCaps,
  dissolveConversation,
  getConversationDetail,
  isTeamAdminOf,
  mutedUntilFromHours,
  patchMySettings,
  removeMember,
} from "../../../lib/im/groups-api";
import { getMe, reasonOf, useLoader } from "../../../lib/im/people-api";
import type { ImConversationDetail, ImNotifyLevel } from "../../../lib/im/types";
import { useImEvent } from "../realtime/hooks";
import { ReportDialog } from "../report/ReportDialog";
import { InviteLinkDialog } from "../people/InviteLinkDialog";
import { MemberPicker } from "../people/MemberPicker";
import { ProfileCard } from "../people/ProfileCard";
import { GroupAvatar } from "./GroupAvatar";
import { GroupSettingsForm } from "./GroupSettingsForm";
import { JoinRequestsList } from "./JoinRequestsList";
import { MemberList } from "./MemberList";
import { TeamInviteDialog } from "./TeamInviteDialog";
import { UpgradeToTeamDialog } from "./UpgradeToTeamDialog";

export interface ConversationInfoPanelProps {
  conversationId: string;
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
}

const sectionTitle = "px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-neutral-400";
const pillBtn =
  "inline-flex min-h-11 items-center rounded-lg border border-neutral-200 px-3 text-[12px] text-neutral-700 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400";
const linkBtn =
  "inline-flex min-h-11 items-center text-[12px] text-neutral-800 underline underline-offset-2 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400";
const rowBtn = "w-full px-3 py-2 text-left text-[13px] hover:bg-neutral-50 disabled:opacity-50";

export function ConversationInfoPanel({ conversationId, onClose, onOpenConversation }: ConversationInfoPanelProps) {
  const tt = useUI();
  const detailLoader = useLoader(() => getConversationDetail(conversationId), [conversationId]);
  const me = useLoader(getMe, []);
  useImEvent("member.changed", (e) => {
    if (e.conversation_id === conversationId) detailLoader.reload();
  });
  useImEvent("conversation.updated", (e) => {
    if (e.conversation.id === conversationId) detailLoader.reload();
  });

  const [profileId, setProfileId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [addNote, setAddNote] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [teamInviteOpen, setTeamInviteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirm, setConfirm] = useState<"leave" | "dissolve" | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const detail: ImConversationDetail | null = detailLoader.data;
  const myUserId = me.data?.user_id ?? null;
  const caps = useMemo(() => (detail ? conversationCaps(detail) : null), [detail]);
  const existingIds = useMemo(() => (detail?.members ?? []).map((m) => m.user_id), [detail]);
  // Team 群：我在这个 Team 里是不是 owner / admin（决定直接邀请同事，还是请管理员邀请）。
  const teamOrgId = detail?.kind === "team" ? (detail.org_id ?? null) : null;
  const myOrgs = useLoader(() => (teamOrgId ? listMyOrgs() : Promise.resolve(null)), [teamOrgId]);

  if (!detail || !caps) {
    return (
      <aside className="flex h-full min-h-0 flex-col" data-info-panel data-state="loading">
        <PanelHeader title={tt("会话信息")} onClose={onClose} closeLabel={tt("关闭")} />
        <p className="px-3 py-8 text-center text-[13px] text-neutral-400">
          {detailLoader.error ? reasonOf(detailLoader.error, tt("加载失败，请稍后再试。")) : tt("加载中…")}
        </p>
      </aside>
    );
  }

  const isDm = detail.kind === "dm";
  const peer = detail.peer;
  const title = isDm ? (peer?.display_name ?? detail.title) : detail.title;

  async function run(action: () => Promise<void>, after?: () => void) {
    setBusy(true);
    setNote(null);
    try {
      await action();
      after?.();
    } catch (e) {
      setNote(reasonOf(e, tt("没成功，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  }

  const reload = () => detailLoader.reload();

  async function submitAdd() {
    setBusy(true);
    setAddNote(null);
    try {
      const r = await addMembers(conversationId, picked);
      const parts = [tt("已加入 {n} 人", { n: r.added.length })];
      if (r.pending.length) parts.push(tt("{n} 人等待同意", { n: r.pending.length }));
      if (r.refused.length) parts.push(tt("{n} 人没能加入", { n: r.refused.length }));
      setAddNote(parts.join("，"));
      setPicked([]);
      reload();
    } catch (e) {
      setAddNote(reasonOf(e, tt("没成功，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  }

  const muteValue = detail.muted ? -1 : 0;

  return (
    <aside className="flex h-full min-h-0 flex-col" data-info-panel data-state="ready" data-kind={detail.kind} data-my-role={detail.my_role ?? "none"}>
      <PanelHeader title={tt("会话信息")} onClose={onClose} closeLabel={tt("关闭")} />
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <div className="flex items-center gap-3 px-3 py-3">
          <GroupAvatar
            name={title}
            src={isDm ? (peer?.avatar_url ?? null) : detail.avatar_url}
            members={isDm ? undefined : detail.avatar_members}
            seed={detail.id}
            size={56}
          />
          <div className="min-w-0">
            <h3 className="truncate text-[16px] font-semibold text-neutral-900" data-info-title>
              {title}
            </h3>
            {!isDm && (
              <p className="text-[12px] text-neutral-500" data-info-count>
                {tt("{n} 位成员", { n: detail.member_count })}
              </p>
            )}
            {detail.dissolved && <p className="text-[12px] text-red-600">{tt("群已解散")}</p>}
          </div>
        </div>

        {isDm && peer && (
          <button type="button" onClick={() => setProfileId(peer.user_id)} data-action="open-peer" className={`${rowBtn} text-neutral-700`}>
            {tt("查看对方资料")}
          </button>
        )}

        {caps.isGroupLike && (
          <>
            <h4 className={sectionTitle}>{tt("群资料")}</h4>
            <GroupSettingsForm detail={detail} canEdit={caps.canEditSettings} onSaved={reload} />

            <h4 className={sectionTitle}>{tt("成员")}</h4>
            <MemberList detail={detail} myUserId={myUserId} onOpenProfile={setProfileId} onChanged={reload} />
            {caps.canAddMembers && (
              <div className="px-3 pt-2">
                {adding ? (
                  <div data-add-members>
                    <MemberPicker selected={picked} onChange={setPicked} existingIds={existingIds} />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button type="button" onClick={() => { setAdding(false); setPicked([]); }} className="rounded-lg px-3 py-1.5 text-[12px] text-neutral-500 hover:bg-neutral-50">
                        {tt("取消")}
                      </button>
                      <button type="button" disabled={busy || picked.length === 0} onClick={submitAdd} data-action="confirm-add" className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50">
                        {tt("拉进群")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setAdding(true)} data-action="add-members" className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50">
                    {tt("加成员")}
                  </button>
                )}
                {addNote && (
                  <p role="status" data-add-note className="mt-2 text-[12px] text-neutral-600">
                    {addNote}
                  </p>
                )}
              </div>
            )}
            {!caps.isManual && (
              <div className="px-3 pt-2" data-synced-box>
                <p className="text-[11px] text-neutral-400" data-synced-hint>
                  {detail.kind === "team" ? tt("成员跟 Team 自动同步。") : tt("成员跟项目自动同步。")}
                </p>
                {!detail.dissolved && detail.my_role !== null && detail.kind === "team" && teamOrgId && isTeamAdminOf(myOrgs.data, teamOrgId) && (
                  <button type="button" onClick={() => setTeamInviteOpen(true)} data-action="invite-team" className={`${pillBtn} mt-1`}>
                    {tt("邀请同事加入 Team")}
                  </button>
                )}
                {!detail.dissolved && detail.my_role !== null && detail.kind === "team" && !myOrgs.loading && !isTeamAdminOf(myOrgs.data, teamOrgId) && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-2" data-team-invite-hint>
                    <span className="text-[12px] text-neutral-600">{tt("请 Team 管理员邀请")}</span>
                    <a
                      href={portalHref(teamOrgId ? `/org?org=${encodeURIComponent(teamOrgId)}` : "/org")}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-action="open-team-page"
                      className={linkBtn}
                    >
                      {tt("打开 Team 页面")}
                    </a>
                  </div>
                )}
                {!detail.dissolved && detail.my_role !== null && detail.kind === "project" && (
                  <a
                    href={portalHref(detail.project_id ? `/projects/${encodeURIComponent(detail.project_id)}` : "/projects")}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-action="open-project"
                    className={`${linkBtn} mt-1`}
                  >
                    {tt("打开项目")}
                  </a>
                )}
              </div>
            )}

            {caps.canApproveJoins && (detail.pending_join_requests > 0 || detail.join_approval) && (
              <>
                <h4 className={sectionTitle}>{tt("入群申请")}</h4>
                <JoinRequestsList conversationId={detail.id} onChanged={reload} />
              </>
            )}

            {caps.canManageInviteLinks && (
              <>
                <h4 className={sectionTitle}>{tt("邀请链接")}</h4>
                <button type="button" onClick={() => setInviteOpen(true)} data-action="invite-link" className={`${rowBtn} text-neutral-700`}>
                  {tt("管理群邀请链接")}
                </button>
              </>
            )}
          </>
        )}

        {!detail.dissolved && (
          <>
            <h4 className={sectionTitle}>{tt("我的设置")}</h4>
            <div className="flex flex-col gap-3 px-3 py-1 text-[12px] text-neutral-600">
              <label className="flex items-center justify-between gap-3">
                {tt("通知")}
                <select
                  data-field="notify"
                  defaultValue={detail.notify_level}
                  disabled={busy}
                  className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[12px] text-neutral-800"
                  onChange={(e) => run(() => patchMySettings(detail.id, { notify_level: e.target.value as ImNotifyLevel }))}
                >
                  {NOTIFY_CHOICES.map((c) => (
                    <option key={c.level} value={c.level}>
                      {tt(c.label)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between gap-3">
                {tt("免打扰")}
                <select
                  data-field="mute"
                  defaultValue={muteValue}
                  disabled={busy}
                  className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[12px] text-neutral-800"
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    const choice = MUTE_CHOICES[idx];
                    if (choice) void run(() => patchMySettings(detail.id, { muted_until: mutedUntilFromHours(choice.hours) }));
                  }}
                >
                  {detail.muted && (
                    <option value={-1} disabled>
                      {tt("当前已免打扰")}
                    </option>
                  )}
                  {MUTE_CHOICES.map((c, i) => (
                    <option key={c.label} value={i}>
                      {tt(c.label)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {caps.canHide && (
              <button
                type="button"
                disabled={busy}
                data-action="hide"
                className={`${rowBtn} mt-2 text-neutral-700`}
                onClick={() => run(() => patchMySettings(detail.id, { hidden: true }), onClose)}
              >
                {tt("隐藏会话")}
              </button>
            )}
          </>
        )}

        <div className="mt-4 border-t border-neutral-100 pt-2">
          {caps.canUpgradeToTeam && (
            <button type="button" onClick={() => setUpgradeOpen(true)} data-action="upgrade-team" className={`${rowBtn} text-neutral-700`}>
              {tt("升级成 Team")}
            </button>
          )}
          {caps.canReport && (
            <button type="button" onClick={() => setReportOpen(true)} data-action="report" className={`${rowBtn} text-red-600`}>
              {tt("举报这个群")}
            </button>
          )}
          {caps.leaveNeedsTransfer && (
            <p className="px-3 py-2 text-[11px] text-neutral-400" data-leave-hint>
              {tt("你是群主。先把群主转让给别人，才能退出。")}
            </p>
          )}
          {caps.canLeave && (
            <button type="button" onClick={() => setConfirm("leave")} data-action="leave" className={`${rowBtn} text-red-600`}>
              {tt("退出群聊")}
            </button>
          )}
          {caps.canDissolve && (
            <button type="button" onClick={() => setConfirm("dissolve")} data-action="dissolve" className={`${rowBtn} text-red-600`}>
              {tt("解散群聊")}
            </button>
          )}
        </div>

        {note && (
          <p role="alert" data-info-note className="px-3 pt-2 text-[12px] text-red-600">
            {note}
          </p>
        )}
      </div>

      {profileId && (
        <ProfileCard
          userId={profileId}
          conversationId={detail.id}
          onClose={() => setProfileId(null)}
          onOpenConversation={(id) => {
            setProfileId(null);
            onOpenConversation(id);
          }}
        />
      )}
      {inviteOpen && <InviteLinkDialog conversationId={detail.id} onClose={() => setInviteOpen(false)} />}
      {upgradeOpen && (
        <UpgradeToTeamDialog
          conversationId={detail.id}
          defaultName={detail.title}
          onClose={() => setUpgradeOpen(false)}
          onDone={() => {
            setUpgradeOpen(false);
            reload();
          }}
        />
      )}
      {teamInviteOpen && teamOrgId && <TeamInviteDialog orgId={teamOrgId} teamName={detail.title} onClose={() => setTeamInviteOpen(false)} />}
      {reportOpen && <ReportDialog target={{ kind: "conversation", id: detail.id, label: detail.title }} onClose={() => setReportOpen(false)} />}
      {confirm === "leave" && (
        <ConfirmDialog
          title="退出群聊"
          body="退出后你不会再收到这个群的消息。确定吗？"
          confirmLabel="退出"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setConfirm(null);
            if (!myUserId) return;
            await run(() => removeMember(detail.id, myUserId), onClose);
          }}
        />
      )}
      {confirm === "dissolve" && (
        <ConfirmDialog
          title="解散群聊"
          body="解散后所有成员都不能再发消息，历史记录只读保留。这一步不能撤销。"
          confirmLabel="解散"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setConfirm(null);
            await run(() => dissolveConversation(detail.id), onClose);
          }}
        />
      )}
    </aside>
  );
}

function PanelHeader({ title, onClose, closeLabel }: { title: string; onClose: () => void; closeLabel: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2.5">
      <h2 className="flex-1 text-[14px] font-semibold text-neutral-900">{title}</h2>
      <button type="button" onClick={onClose} aria-label={closeLabel} data-action="close-panel" data-im-chrome-btn>
        <ImCloseIcon />
      </button>
    </div>
  );
}
