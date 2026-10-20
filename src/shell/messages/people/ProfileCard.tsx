"use client";

// 点头像弹出的资料卡：他是谁、和我什么关系、在线状态；私聊 / 加联系人 / 拉黑 / 举报。

import { useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { ConfirmDialog } from "../../../ui";
import { getConversationDetail } from "../../../lib/im/groups-api";
import {
  blockUser,
  errorCodeOf,
  getMe,
  getProfile,
  listBlocks,
  openDm,
  reasonOf,
  removeContact,
  starContact,
  sendContactRequest,
  setUserRemark,
  unblockUser,
  useLoader,
  visiblePersonName,
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
  const [deleting, setDeleting] = useState(false);
  const [remark, setRemark] = useState("");
  const [editingRemark, setEditingRemark] = useState(false);
  const [more, setMore] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);

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

  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    setMounted(true);
    return () => restoreFocusRef.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!mounted) return;
    dialogRef.current?.querySelector<HTMLElement>("button, input")?.focus();
  }, [mounted]);

  useEffect(() => {
    setRemark(p?.remark ?? "");
    setEditingRemark(false);
  }, [p?.user_id, p?.remark]);

  useEffect(() => {
    if (!more) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMore(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setMore(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [more]);

  if (reporting) {
    return <ReportDialog target={{ kind: "user", id: userId, label: p?.display_name }} onClose={() => setReporting(false)} />;
  }

  if (deleting) {
    return <ConfirmDialog title={tt("删除联系人")} body={tt("删除后，你们将不再是联系人。")}
      confirmLabel={tt("删除")} danger onCancel={() => setDeleting(false)} onConfirm={async () => {
        await run(async () => { await removeContact(userId); profile.reload(); setMore(false); });
        setDeleting(false);
      }} />;
  }

  const name = p ? visiblePersonName(p) : "";
  const isContact = relation === "contact";

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black/25" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="im-profile-title" tabIndex={-1} onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); onClose(); return; }
        if (event.key !== "Tab") return;
        const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])];
        if (!focusable.length) { event.preventDefault(); return; }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }} className="fixed right-4 top-4 bottom-auto h-fit max-h-[calc(100dvh-2rem)] w-[min(360px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xl outline-none max-sm:bottom-0 max-sm:right-0 max-sm:top-auto max-sm:h-fit max-sm:max-h-[85dvh] max-sm:w-full max-sm:rounded-b-none" data-profile-card>
        {profile.loading && !p ? (
          <p className="py-8 text-center text-[13px] text-neutral-400">{tt("加载中…")}</p>
        ) : !p ? (
          <p className="py-8 text-center text-[13px] text-neutral-500">{tt("找不到这个人，或者你看不到他的资料。")}</p>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <PersonAvatar name={name} src={p.avatar_url} seed={p.user_id} size={52} />
              <div className="min-w-0 flex-1 pt-0.5">
                <h3 id="im-profile-title" className="truncate text-[17px] font-semibold leading-6 text-neutral-900">
                  {name}
                  {p.contact_starred && <span data-friend-star className="ml-2 text-amber-500" aria-label={tt("星标朋友")}>★</span>}
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
              {!isSelf && <div className="flex shrink-0 items-center gap-1" ref={menuRef}>
                <button type="button" aria-label={tt("关闭")} title={tt("关闭")} onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700">×</button>
                <div className="relative">
                  <button type="button" aria-haspopup="menu" aria-expanded={more} aria-label={tt("更多")} onClick={() => setMore(!more)} className="rounded-lg px-2 py-1.5 text-[20px] leading-none text-neutral-500 hover:bg-neutral-100">···</button>
                  {more && <div role="menu" aria-label={tt("更多")} className="absolute right-0 top-full z-20 mt-1 flex min-w-[168px] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-xl">
                    {isContact && <>
                      <button type="button" role="menuitem" disabled={busy} data-action="star-contact" onClick={() => { setMore(false); void run(async () => { await starContact(userId, !p.contact_starred); profile.reload(); }); }} className="rounded-lg px-3 py-2 text-left text-[13px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">{tt(p.contact_starred ? "取消星标朋友" : "设为星标朋友")}</button>
                      <button type="button" role="menuitem" disabled={busy} data-action="delete-contact" onClick={() => { setMore(false); setDeleting(true); }} className="rounded-lg px-3 py-2 text-left text-[13px] text-red-600 hover:bg-red-50 disabled:opacity-50">{tt("删除联系人")}</button>
                    </>}
                    <button type="button" role="menuitem" disabled={busy} onClick={() => { setMore(false); void toggleBlock(); }} data-action="block" className="rounded-lg px-3 py-2 text-left text-[13px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">{blocked ? tt("取消拉黑") : tt("拉黑")}</button>
                    <button type="button" role="menuitem" onClick={() => { setMore(false); setReporting(true); }} data-action="report" className="rounded-lg px-3 py-2 text-left text-[13px] text-red-600 hover:bg-red-50">{tt("举报")}</button>
                  </div>}
                </div>
              </div>}
            </div>
            {!isSelf && isContact && (
              <div className="mt-2 flex items-center gap-3 border-t border-neutral-100 py-2 text-[13px] text-neutral-500">
                <span className="w-12 shrink-0">{tt("备注")}</span>
                {editingRemark ? <input
                    value={remark}
                    maxLength={40}
                    data-field="user-remark"
                    autoFocus
                    disabled={busy}
                    onChange={(e) => setRemark(e.target.value)}
                    onKeyDown={(event) => { if (event.key === "Escape") { setRemark(p.remark ?? ""); setEditingRemark(false); } if (event.key === "Enter") event.currentTarget.blur(); }}
                    onBlur={() => {
                      setEditingRemark(false);
                      if ((remark.trim() || "") === (p.remark || "")) return;
                      void run(async () => {
                        const next = await setUserRemark(userId, remark.trim());
                        setRemark(next.remark);
                        profile.reload();
                      });
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-[14px] text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
                  /> : <button type="button" data-action="edit-remark" disabled={busy} onClick={() => setEditingRemark(true)} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[14px] text-neutral-900 hover:bg-neutral-50">
                    <span className="min-w-0 flex-1 truncate">{remark || "—"}</span><span aria-hidden className="text-neutral-400">✎</span>
                  </button>}
              </div>
            )}

            {isContact && <dl data-friend-info className="border-t border-neutral-100 py-2 text-[12px] text-neutral-500">
              {p.mutual_group_count != null && <div className="flex gap-3 py-1"><dt className="w-12 shrink-0">{tt("共同群聊")}</dt><dd className="text-neutral-800">{p.mutual_group_count}</dd></div>}
              {p.contact_source && <div className="flex gap-3 py-1"><dt className="w-12 shrink-0">{tt("来源")}</dt><dd className="text-neutral-800">{tt(({ request: "联系人请求", invite: "邀请链接", team: "同 Team", project: "同项目" } as Record<string, string>)[p.contact_source] ?? p.contact_source)}</dd></div>}
              {p.contact_created_at && <div className="flex gap-3 py-1"><dt className="w-12 shrink-0">{tt("添加时间")}</dt><dd className="text-neutral-800">{new Date(p.contact_created_at).toLocaleDateString()}</dd></div>}
            </dl>}

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
              <div className="mt-2 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
                {isContact ? <button
                  type="button"
                  disabled={busy}
                  onClick={startDm}
                  data-action="dm"
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:opacity-85 disabled:opacity-50"
                >
                  {tt("私聊")}
                </button> : !requested && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { if (canRequestDirectly) void addContact(); else setNeedContact(true); }}
                    data-action="add-contact"
                    className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:opacity-85 disabled:opacity-50"
                  >
                    {tt("添加到通讯录")}
                  </button>
                )}
              </div>
            )}
            {!isSelf && !isContact && !canRequestDirectly && !needContact && (
              <p className="mt-3 text-[11px] text-neutral-400" data-invite-hint>
                {tt("想加他为联系人？请让他把联系人邀请链接发给你。")}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
