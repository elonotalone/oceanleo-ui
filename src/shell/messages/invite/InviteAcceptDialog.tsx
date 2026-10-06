"use client";

// 打开邀请链接后的确认：谁邀请你、进哪个群、群里多少人；接受后成为联系人 / 进群 / 申请入群。
// 没登录：先引导登录，登录后停在同一个地址（URL 里的 ?im_invite= 不变）。

import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { Modal } from "../../../ui";
import { AuthDialog } from "../../../pages/AuthDialog";
import { accessToken } from "../../../lib/auth/client";
import {
  acceptInvite,
  getInvitePreview,
  inviteOutcomeOf,
  reasonOf,
  type InviteOutcome,
} from "../../../lib/im/people-api";
import type { ImInvitePreview } from "../../../lib/im/types";
import { GroupAvatar, PersonAvatar } from "../groups/GroupAvatar";

export interface InviteAcceptDialogProps {
  code: string;
  onClose: () => void;
  onDone: (result: { conversationId: string | null }) => void;
}

type Stage =
  | { name: "loading" }
  | { name: "login" }
  | { name: "preview"; preview: ImInvitePreview }
  | { name: "result"; outcome: InviteOutcome; conversationId: string | null };

function statusOf(e: unknown): number {
  return (e as { status?: number } | null)?.status ?? 0;
}

export function InviteAcceptDialog({ code, onClose, onDone }: InviteAcceptDialogProps) {
  const tt = useUI();
  const [stage, setStage] = useState<Stage>({ name: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setStage({ name: "loading" });
    (async () => {
      let token: string | null = null;
      try {
        token = await accessToken();
      } catch {
        token = null;
      }
      if (!alive) return;
      if (!token) {
        setStage({ name: "login" });
        return;
      }
      try {
        const preview = await getInvitePreview(code);
        if (!alive) return;
        setStage(preview.expired ? { name: "result", outcome: "gone", conversationId: null } : { name: "preview", preview });
      } catch (e) {
        if (!alive) return;
        if (statusOf(e) === 401) setStage({ name: "login" });
        else setStage({ name: "result", outcome: inviteOutcomeOf({ error: e }), conversationId: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, attempt]);

  async function accept(preview: ImInvitePreview) {
    setBusy(true);
    setNote(null);
    try {
      const result = await acceptInvite(code, message);
      const outcome = inviteOutcomeOf({ result });
      const conversationId = result.conversation_id ?? preview.conversation?.id ?? null;
      if (outcome === "joined") onDone({ conversationId });
      else if (outcome === "contact") onDone({ conversationId: null });
      else setStage({ name: "result", outcome, conversationId });
    } catch (e) {
      const outcome = inviteOutcomeOf({ error: e });
      if (outcome === "pending") setStage({ name: "result", outcome, conversationId: null });
      else if ((e as { code?: string })?.code === "gone" || statusOf(e) === 410) setStage({ name: "result", outcome: "gone", conversationId: null });
      else setNote(reasonOf(e, tt("没成功，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  }

  if (stage.name === "login") {
    return <AuthDialog onClose={onClose} onSuccess={() => setAttempt((n) => n + 1)} />;
  }

  return (
    <Modal onClose={onClose} className="max-w-sm" labelledBy="im-invite-accept-title">
      <div className="p-5" data-invite-accept data-stage={stage.name}>
        {stage.name === "loading" && <p className="py-8 text-center text-[13px] text-neutral-400">{tt("加载中…")}</p>}

        {stage.name === "preview" && <PreviewBody
          preview={stage.preview}
          message={message}
          setMessage={setMessage}
          busy={busy}
          note={note}
          onAccept={() => accept(stage.preview)}
          onClose={onClose}
          onOpenGroup={() => onDone({ conversationId: stage.preview.conversation?.id ?? null })}
        />}

        {stage.name === "result" && (
          <div data-invite-result={stage.outcome}>
            <h3 id="im-invite-accept-title" className="text-[15px] font-semibold text-neutral-900">
              {stage.outcome === "gone" ? tt("链接已失效") : tt("已申请")}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">
              {stage.outcome === "gone"
                ? tt("这个邀请链接已经过期、被撤销，或者群已解散。请让对方重新发一个。")
                : tt("已申请，等群管理员同意。同意后你会收到通知。")}
            </p>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onClose} data-action="close" className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white">
                {tt("好")}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function PreviewBody({
  preview,
  message,
  setMessage,
  busy,
  note,
  onAccept,
  onClose,
  onOpenGroup,
}: {
  preview: ImInvitePreview;
  message: string;
  setMessage: (v: string) => void;
  busy: boolean;
  note: string | null;
  onAccept: () => void;
  onClose: () => void;
  onOpenGroup: () => void;
}) {
  const tt = useUI();
  const isGroup = preview.kind === "group" && preview.conversation;
  const already = preview.already;
  return (
    <div>
      <div className="flex items-center gap-3">
        {isGroup ? (
          <GroupAvatar name={preview.conversation!.title} src={preview.conversation!.avatar_url} seed={preview.conversation!.id} size={48} />
        ) : (
          <PersonAvatar name={preview.inviter.display_name} src={preview.inviter.avatar_url} seed={preview.inviter.user_id} size={48} />
        )}
        <div className="min-w-0">
          <h3 id="im-invite-accept-title" className="truncate text-[15px] font-semibold text-neutral-900">
            {isGroup ? preview.conversation!.title : preview.inviter.display_name}
          </h3>
          <p className="text-[12px] text-neutral-500">
            {isGroup
              ? tt("{name} 邀请你加入 · {n} 人", { name: preview.inviter.display_name, n: preview.conversation!.member_count })
              : tt("邀请你成为联系人")}
          </p>
        </div>
      </div>

      {already === "contact" && <p className="mt-3 text-[13px] text-neutral-600" data-already="contact">{tt("你们已经是联系人了。")}</p>}
      {already === "member" && <p className="mt-3 text-[13px] text-neutral-600" data-already="member">{tt("你已经在这个群里了。")}</p>}
      {already === "pending" && <p className="mt-3 text-[13px] text-neutral-600" data-already="pending">{tt("已申请，等群管理员同意。")}</p>}
      {!already && preview.requires_approval && (
        <>
          <p className="mt-3 text-[12px] text-neutral-500">{tt("进群需要管理员同意。可以留一句话告诉管理员你是谁。")}</p>
          <input
            value={message}
            maxLength={200}
            onChange={(e) => setMessage(e.target.value)}
            aria-label={tt("给管理员留言")}
            placeholder={tt("给管理员留言（选填）")}
            className="mt-2 w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
          />
        </>
      )}
      {note && <p role="alert" className="mt-3 text-[12px] text-red-600">{note}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] text-neutral-500 hover:bg-neutral-50">
          {tt("取消")}
        </button>
        {already === "member" ? (
          <button type="button" onClick={onOpenGroup} data-action="open-group" className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white">
            {tt("打开群聊")}
          </button>
        ) : already ? (
          <button type="button" onClick={onClose} data-action="close" className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white">
            {tt("好")}
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={onAccept} data-action="accept" className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50">
            {isGroup ? (preview.requires_approval ? tt("申请加入") : tt("加入群聊")) : tt("接受邀请")}
          </button>
        )}
      </div>
    </div>
  );
}
