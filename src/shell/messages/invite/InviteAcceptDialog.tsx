"use client";

import { PRIMARY, QUIET, MessagePromptDialog as Modal } from "../MessageSettingsFrame";

// 群邀请保留加入/审批；个人链接打开可关注与发消息的资料卡。
// 没登录：先引导登录，登录后停在同一个地址（URL 里的 ?im_invite= 不变）。

import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { AuthDialog } from "../../../pages/AuthDialog";
import { accessToken } from "../../../lib/auth/client";
import {
  acceptInvite,
  getInvitePreview,
  inviteOutcomeOf,
  peopleMessageError,
  type InviteOutcome,
} from "../../../lib/im/people-api";
import type { ImInvitePreview } from "../../../lib/im/types";
import { ProfileCard } from "../people/ProfileCard";
import { GroupAvatar } from "../groups/GroupAvatar";

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
      else setStage({ name: "result", outcome, conversationId });
    } catch (e) {
      const outcome = inviteOutcomeOf({ error: e });
      if (outcome === "pending") setStage({ name: "result", outcome, conversationId: null });
      else if ((e as { code?: string })?.code === "gone" || statusOf(e) === 410) setStage({ name: "result", outcome: "gone", conversationId: null });
      else setNote(peopleMessageError(e, tt));
    } finally {
      setBusy(false);
    }
  }

  if (stage.name === "login") {
    return <AuthDialog onClose={onClose} onSuccess={() => setAttempt((n) => n + 1)} />;
  }

  if (stage.name === "preview" && stage.preview.kind === "contact") {
    return <ProfileCard userId={stage.preview.inviter.user_id} onClose={onClose} onOpenConversation={(id) => onDone({ conversationId: id })} />;
  }

  const dialogTitle = stage.name === "preview"
    ? stage.preview.kind === "group" ? stage.preview.conversation!.title : stage.preview.inviter.display_name
    : stage.name === "result" ? stage.outcome === "gone" ? tt("链接已失效") : tt("已申请") : tt("邀请链接");

  return (
    <Modal onClose={onClose} title={dialogTitle} labelledBy="im-invite-accept-title">
      <div data-invite-accept data-stage={stage.name}>
        {stage.name === "loading" && <p className="py-8 text-center text-[13px] text-stone-400">{tt("加载中…")}</p>}

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

            <p className="mt-2 text-[13px] leading-relaxed text-stone-600">
              {stage.outcome === "gone"
                ? tt("这个邀请链接已经过期、被撤销，或者群已解散。请让对方重新发一个。")
                : tt("已申请，等群管理员同意。同意后你会收到通知。")}
            </p>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onClose} data-action="close" className={PRIMARY}>
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
  const already = preview.already;
  return (
    <div>
      <div className="flex items-center gap-3">
        <GroupAvatar name={preview.conversation!.title} src={preview.conversation!.avatar_url} seed={preview.conversation!.id} size={48} />
        <div className="min-w-0">

          <p className="text-[12px] text-stone-500">
            {tt("{name} 邀请你加入 · {n} 人", { name: preview.inviter.display_name, n: preview.conversation!.member_count })}
          </p>
        </div>
      </div>

      {already === "member" && <p className="mt-3 text-[13px] text-stone-600" data-already="member">{tt("你已经在这个群里了。")}</p>}
      {already === "pending" && <p className="mt-3 text-[13px] text-stone-600" data-already="pending">{tt("已申请，等群管理员同意。")}</p>}
      {!already && preview.requires_approval && (
        <>
          <p className="mt-3 text-[12px] text-stone-500">{tt("进群需要管理员同意。可以留一句话告诉管理员你是谁。")}</p>
          <input
            value={message}
            maxLength={200}
            onChange={(e) => setMessage(e.target.value)}
            aria-label={tt("给管理员留言")}
            placeholder={tt("给管理员留言（选填）")}
            className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
          />
        </>
      )}
      {note && <p role="alert" className="mt-3 text-[12px] text-red-600">{note}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={QUIET}>
          {tt("取消")}
        </button>
        {already === "member" ? (
          <button type="button" onClick={onOpenGroup} data-action="open-group" className={PRIMARY}>
            {tt("打开群聊")}
          </button>
        ) : already ? (
          <button type="button" onClick={onClose} data-action="close" className={PRIMARY}>
            {tt("好")}
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={onAccept} data-action="accept" className={PRIMARY}>
            {preview.requires_approval ? tt("申请加入") : tt("加入群聊")}
          </button>
        )}
      </div>
    </div>
  );
}
