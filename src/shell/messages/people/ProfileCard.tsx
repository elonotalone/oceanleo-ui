"use client";

// 点头像弹出的资料卡：他是谁、和我什么关系、在线状态；私聊 / 加联系人 / 拉黑 / 举报。

import { useMemo, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { Modal } from "../../../ui";
import { getConversationDetail } from "../../../lib/im/groups-api";
import {
  blockUser,
  errorCodeOf,
  getMe,
  getProfile,
  listBlocks,
  openDm,
  reasonOf,
  sendContactRequest,
  unblockUser,
  useLoader,
} from "../../../lib/im/people-api";
import type { ImRelation } from "../../../lib/im/types";
import { PersonAvatar, PresenceDot } from "../groups/GroupAvatar";
import { usePresence } from "../realtime/hooks";
import { ReportDialog } from "../report/ReportDialog";

export interface ProfileCardProps {
  userId: string;
  conversationId?: string | null;
  onClose: () => void;
  onOpenConversation: (conversationId: string) => void;
}

const RELATION_COPY: Record<ImRelation, string> = {
  self: "这是你自己",
  contact: "联系人",
  teammate: "同 Team",
  project: "同项目",
  member: "同群成员",
  none: "还不是联系人",
};

const PRESENCE_COPY = { online: "在线", away: "离开", offline: "离线" } as const;

export function ProfileCard({ userId, conversationId, onClose, onOpenConversation }: ProfileCardProps) {
  const tt = useUI();
  const profile = useLoader(() => getProfile(userId), [userId]);
  const me = useLoader(getMe, []);
  const blocks = useLoader(listBlocks, []);
  const detail = useLoader(
    () => (conversationId ? getConversationDetail(conversationId) : Promise.resolve(null)),
    [conversationId],
  );
  const presenceIds = useMemo(() => [userId], [userId]);
  const presence = usePresence(presenceIds)[userId] ?? "offline";
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [needContact, setNeedContact] = useState(false);
  const [requested, setRequested] = useState(false);
  const [reporting, setReporting] = useState(false);

  const p = profile.data;
  const isSelf = !!me.data && me.data.user_id === userId;
  const relation: ImRelation = isSelf ? "self" : (p?.relation ?? "none");
  const member = detail.data?.members.find((m) => m.user_id === userId) ?? null;
  const blocked = !!blocks.data?.some((b) => b.user_id === userId);
  const canRequestDirectly = relation === "member" || relation === "teammate" || relation === "project" || !!conversationId;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setNote(null);
    try {
      await action();
    } catch (e) {
      setNote(reasonOf(e, tt("没成功，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  }

  function startDm() {
    return run(async () => {
      try {
        const id = await openDm(userId);
        if (id) {
          onOpenConversation(id);
          onClose();
        }
      } catch (e) {
        if (errorCodeOf(e) === "need_contact") {
          setNeedContact(true);
          return;
        }
        throw e;
      }
    });
  }

  function addContact() {
    return run(async () => {
      await sendContactRequest(userId);
      setRequested(true);
      setNote(tt("已发出联系人请求，等对方同意。"));
    });
  }

  function toggleBlock() {
    return run(async () => {
      if (blocked) await unblockUser(userId);
      else await blockUser(userId);
      blocks.reload();
    });
  }

  if (reporting) {
    return <ReportDialog target={{ kind: "user", id: userId, label: p?.display_name }} onClose={() => setReporting(false)} />;
  }

  const name = p?.display_name ?? "";
  const isContact = relation === "contact";

  return (
    <Modal onClose={onClose} className="max-w-sm" labelledBy="im-profile-title">
      <div className="p-5" data-profile-card>
        {profile.loading && !p ? (
          <p className="py-8 text-center text-[13px] text-neutral-400">{tt("加载中…")}</p>
        ) : !p ? (
          <p className="py-8 text-center text-[13px] text-neutral-500">{tt("找不到这个人，或者你看不到他的资料。")}</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <PersonAvatar name={name} src={p.avatar_url} seed={p.user_id} size={56} />
              <div className="min-w-0">
                <h3 id="im-profile-title" className="truncate text-[16px] font-semibold text-neutral-900">
                  {name}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-neutral-500">
                  <span className="inline-flex items-center gap-1" data-profile-presence={presence}>
                    <PresenceDot presence={presence} />
                    {tt(PRESENCE_COPY[presence])}
                  </span>
                  {member?.external && (
                    <span data-external-badge className="text-[11px] text-neutral-400">
                      {tt("外部")}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[13px] text-neutral-600" data-profile-relation={relation}>
              {tt("和你的关系")}：{tt(RELATION_COPY[relation])}
            </p>

            {needContact && !isSelf && (
              <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-[12px] text-neutral-600" data-need-contact>
                <p>{tt("先加联系人，才能私聊。")}</p>
                {canRequestDirectly ? (
                  <button
                    type="button"
                    disabled={busy || requested}
                    onClick={addContact}
                    data-action="send-request"
                    className="mt-2 rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
                  >
                    {requested ? tt("已发出请求") : tt("发联系人请求")}
                  </button>
                ) : (
                  <p className="mt-1 text-neutral-500">{tt("你们还没有共同的群。请让对方把联系人邀请链接发给你。")}</p>
                )}
              </div>
            )}

            {note && (
              <p role="status" className="mt-3 text-[12px] text-neutral-600" data-profile-note>
                {note}
              </p>
            )}

            {!isSelf && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={startDm}
                  data-action="dm"
                  className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
                >
                  {tt("私聊")}
                </button>
                {!isContact && canRequestDirectly && !requested && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={addContact}
                    data-action="add-contact"
                    className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-[13px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {tt("加联系人")}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={toggleBlock}
                  data-action="block"
                  className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-[13px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  {blocked ? tt("取消拉黑") : tt("拉黑")}
                </button>
                <button
                  type="button"
                  onClick={() => setReporting(true)}
                  data-action="report"
                  className="rounded-lg border border-neutral-200 px-3.5 py-1.5 text-[13px] text-red-600 hover:bg-red-50"
                >
                  {tt("举报")}
                </button>
              </div>
            )}
            {!isSelf && !isContact && !canRequestDirectly && !needContact && (
              <p className="mt-3 text-[11px] text-neutral-400" data-invite-hint>
                {tt("想加他为联系人？请让他把联系人邀请链接发给你。")}
              </p>
            )}
          </>
        )}
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] text-neutral-500 hover:bg-neutral-50">
            {tt("关闭")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
