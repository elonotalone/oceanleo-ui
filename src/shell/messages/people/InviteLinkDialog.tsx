"use client";

// 生成邀请链接：联系人邀请（发给任何人，对方点开登录后成为联系人），或某个群的邀请链接（可要求审批）。
// 可设有效期与次数、复制、撤销已有链接。

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { Modal, Switch } from "../../../ui";
import {
  INVITE_EXPIRY_CHOICES,
  INVITE_USES_CHOICES,
  copyText,
  createInviteLink,
  listInviteLinks,
  reasonOf,
  revokeInviteLink,
  useLoader,
} from "../../../lib/im/people-api";
import type { ImInviteLink } from "../../../lib/im/types";
import { InviteQrCode } from "./InviteQrCode";

export interface InviteLinkDialogProps {
  onClose: () => void;
  /** 给了就是「群邀请链接」，否则是「联系人邀请链接」 */
  conversationId?: string | null;
}

const field = "rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[13px] text-neutral-800";

export function InviteLinkDialog({ onClose, conversationId = null }: InviteLinkDialogProps) {
  const tt = useUI();
  const kind: "contact" | "group" = conversationId ? "group" : "contact";
  const links = useLoader(() => listInviteLinks(conversationId), [conversationId]);
  const [expiryIdx, setExpiryIdx] = useState(2);
  const [usesIdx, setUsesIdx] = useState(3);
  const [needApproval, setNeedApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [qrFor, setQrFor] = useState<string | null>(null);

  const mine = (links.data ?? []).filter((l) => l.kind === kind && !isDead(l));

  async function generate() {
    setBusy(true);
    setNote(null);
    try {
      const link = await createInviteLink({
        kind,
        conversation_id: conversationId,
        requires_approval: kind === "group" ? needApproval : false,
        max_uses: INVITE_USES_CHOICES[usesIdx]?.uses ?? null,
        expires_in_hours: INVITE_EXPIRY_CHOICES[expiryIdx]?.hours ?? null,
      });
      await copy(link.url);
      setQrFor(link.code);
      links.reload();
    } catch (e) {
      setNote(reasonOf(e, tt("没成功，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    const ok = await copyText(url);
    setCopied(url);
    setNote(ok ? tt("链接已复制，发给对方就行。") : tt("请手动复制上面的链接。"));
  }

  async function revoke(link: ImInviteLink) {
    setNote(null);
    try {
      await revokeInviteLink(link.code);
      links.reload();
    } catch (e) {
      setNote(reasonOf(e, tt("没成功，请稍后再试。")));
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-md" labelledBy="im-invite-title">
      <div className="p-5" data-invite-link-dialog data-kind={kind}>
        <h3 id="im-invite-title" className="text-[15px] font-semibold text-neutral-900">
          {kind === "group" ? tt("群邀请链接") : tt("添加联系人")}
        </h3>
        <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">
          {kind === "group"
            ? tt("拿到链接的人点开、登录后就能进群。")
            : tt("把链接或二维码发给对方（微信、邮件都行）。对方打开并登录后，你们就成为联系人。")}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 text-[12px] text-neutral-600">
          <label className="flex flex-col gap-1">
            {tt("有效期")}
            <select className={field} value={expiryIdx} onChange={(e) => setExpiryIdx(Number(e.target.value))} data-field="expiry">
              {INVITE_EXPIRY_CHOICES.map((c, i) => (
                <option key={c.label} value={i}>
                  {tt(c.label)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            {tt("可用次数")}
            <select className={field} value={usesIdx} onChange={(e) => setUsesIdx(Number(e.target.value))} data-field="uses">
              {INVITE_USES_CHOICES.map((c, i) => (
                <option key={c.label} value={i}>
                  {tt(c.label)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {kind === "group" && (
          <div className="mt-3 flex items-center justify-between text-[13px] text-neutral-700">
            <span>{tt("通过链接进群需要管理员同意")}</span>
            <Switch checked={needApproval} onChange={setNeedApproval} label={tt("通过链接进群需要管理员同意")} />
          </div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={generate}
          data-action="generate"
          className="mt-4 w-full rounded-lg bg-neutral-900 px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50"
        >
          {tt("生成并复制链接")}
        </button>
        {note && (
          <p role="status" className="mt-2 text-[12px] text-neutral-600" data-invite-note>
            {note}
          </p>
        )}

        {mine.length > 0 && (
          <div className="mt-4" data-invite-existing>
            <h4 className="text-[12px] font-medium text-neutral-500">{tt("已有的链接")}</h4>
            <ul className="mt-1 max-h-48 divide-y divide-neutral-100 overflow-y-auto">
              {mine.map((l) => (
                <li key={l.code} data-invite-code={l.code} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <input
                      readOnly
                      value={l.url}
                      aria-label={tt("邀请链接")}
                      onFocus={(e) => e.currentTarget.select()}
                      className="w-full truncate rounded border border-neutral-100 bg-neutral-50 px-2 py-1 text-[12px] text-neutral-700"
                    />
                    <p className="mt-0.5 text-[11px] text-neutral-400">{describe(l, tt)}</p>
                    {qrFor === l.code && (
                      <div className="mt-2" data-invite-qr-slot={l.code}>
                        <InviteQrCode url={l.url} fileLabel={kind === "group" ? tt("邀请二维码-加入群聊") : tt("邀请二维码-加联系人")} />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setQrFor(qrFor === l.code ? null : l.code)}
                    aria-expanded={qrFor === l.code}
                    data-action="toggle-qr"
                    className="rounded-lg border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50"
                  >
                    {qrFor === l.code ? tt("隐藏二维码") : tt("显示二维码")}
                  </button>
                  <button type="button" onClick={() => copy(l.url)} data-action="copy" className="rounded-lg border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50">
                    {copied === l.url ? tt("已复制") : tt("复制")}
                  </button>
                  <button type="button" onClick={() => revoke(l)} data-action="revoke" className="rounded-lg px-2 py-1 text-[12px] text-red-600 hover:bg-red-50">
                    {tt("撤销")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
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

function isDead(l: ImInviteLink): boolean {
  if (l.expires_at && new Date(l.expires_at).getTime() <= Date.now()) return true;
  if (l.max_uses !== null && l.uses >= l.max_uses) return true;
  return false;
}

function describe(l: ImInviteLink, tt: (zh: string, vars?: Record<string, string | number>) => string): string {
  const uses = l.max_uses === null ? tt("已用 {n} 次", { n: l.uses }) : tt("已用 {n}/{max} 次", { n: l.uses, max: l.max_uses });
  const when = l.expires_at ? tt("到期 {date}", { date: new Date(l.expires_at).toLocaleString() }) : tt("永不过期");
  return `${uses} · ${when}${l.requires_approval ? ` · ${tt("需审批")}` : ""}`;
}
