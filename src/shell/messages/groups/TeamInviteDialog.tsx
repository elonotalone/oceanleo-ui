"use client";

// Team 群里直接邀请同事加入 Team（Team 管理员用）：生成 Team 邀请链接 + 二维码 + 一键复制。
// 链接用 org-api 的 createInvite；服务端没给完整 https 地址时按门户的 /join 页自己拼
// （不用 inviteUrlFor：它在子站上会拼出子站自己的地址，而 /join 在门户上）。

import { useState } from "react";
import { currentDomainProfile, portalHref } from "../../../contracts/domain-family";
import { useUI } from "../../../i18n/ui/useUI";
import { createInvite } from "../../../lib/org-api";
import { copyText } from "../../../lib/im/people-api";
import { Modal } from "../../../ui";
import { InviteQrCode } from "../people/InviteQrCode";

export interface TeamInviteDialogProps {
  orgId: string;
  teamName?: string;
  onClose: () => void;
}

/** 服务端给了完整 https 地址就用它，否则按门户 /join 页拼一条绝对地址。 */
export function teamInviteUrlOf(url: string, code: string): string {
  if (/^https:\/\//i.test(url)) return url;
  if (!code) return "";
  const href = portalHref(`/join?code=${encodeURIComponent(code)}`);
  if (/^https:\/\//i.test(href)) return href;
  const origin = typeof window !== "undefined" ? window.location.origin : currentDomainProfile().portalOrigin;
  return `${origin}${href}`;
}

/** 接口报错 → 给人看的话（403 / 404 / 429 单独说，其余用兜底）。 */
export function teamInviteErrorText(error: unknown, tt: (zh: string) => string): string {
  const status = (error as { status?: unknown } | null | undefined)?.status;
  if (status === 403) return tt("你不是这个 Team 的管理员，不能邀请同事。");
  if (status === 404) return tt("找不到这个 Team，请刷新页面后再试。");
  if (status === 429) return tt("操作太频繁了，请稍后再试。");
  return tt("没成功，请稍后再试。");
}

export function TeamInviteDialog({ orgId, teamName = "", onClose }: TeamInviteDialogProps) {
  const tt = useUI();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  async function copy(url: string) {
    const ok = await copyText(url);
    setCopied(ok);
    setNote({ text: ok ? tt("链接已复制，发给同事就行。") : tt("请手动复制上面的链接。"), error: false });
  }

  async function generate() {
    setBusy(true);
    setNote(null);
    setCopied(false);
    try {
      const r = await createInvite(orgId);
      const url = teamInviteUrlOf(r.url, r.code);
      if (!url) throw new Error("empty invite");
      setLink({ url, expiresAt: r.expiresAt });
      await copy(url);
    } catch (e) {
      setLink(null);
      setNote({ text: teamInviteErrorText(e, tt), error: true });
    } finally {
      setBusy(false);
    }
  }

  const expires = link?.expiresAt && !Number.isNaN(new Date(link.expiresAt).getTime()) ? new Date(link.expiresAt).toLocaleString() : "";

  return (
    <Modal onClose={onClose} className="max-w-md" labelledBy="im-team-invite-title">
      <div className="p-5" data-team-invite-dialog>
        <h3 id="im-team-invite-title" className="text-[15px] font-semibold text-neutral-900">
          {tt("邀请同事加入 Team")}
        </h3>
        {teamName && <p className="mt-0.5 truncate text-[12px] text-neutral-500">{teamName}</p>}
        <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">{tt("把链接发给同事。对方点开、登录后就能加入这个 Team。")}</p>

        <button
          type="button"
          disabled={busy}
          onClick={generate}
          data-action="generate-team-invite"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-neutral-900 px-3 text-[13px] font-medium text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
        >
          {link ? tt("重新生成链接") : tt("生成并复制链接")}
        </button>

        {note && (
          <p role={note.error ? "alert" : "status"} data-team-invite-note className={`mt-2 text-[12px] ${note.error ? "text-red-600" : "text-neutral-600"}`}>
            {note.text}
          </p>
        )}

        {link && (
          <div className="mt-4" data-team-invite-result>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={link.url}
                aria-label={tt("邀请链接")}
                data-team-invite-url
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 truncate rounded border border-neutral-100 bg-neutral-50 px-2 py-1 text-[12px] text-neutral-700"
              />
              <button
                type="button"
                onClick={() => copy(link.url)}
                data-action="copy-team-invite"
                className="inline-flex min-h-11 items-center rounded-lg border border-neutral-200 px-3 text-[12px] text-neutral-700 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
              >
                {copied ? tt("已复制") : tt("复制")}
              </button>
            </div>
            {expires && <p className="mt-1 text-[11px] text-neutral-400">{tt("有效期至 {date}", { date: expires })}</p>}
            <div className="mt-3" data-team-invite-qr>
              <InviteQrCode url={link.url} fileLabel={tt("邀请二维码-加入 Team")} />
            </div>
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
