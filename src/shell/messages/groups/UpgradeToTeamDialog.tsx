"use client";

// 把群升级成 Team（owner）：起一个 Team 名字，其余成员收到 Team 邀请；没加入 Team 的人之后显示「外部」。
// 成员邀请此后沿用 Team 现有的流程，不在这里另起一套。

import { useState } from "react";
import { portalHref } from "../../../contracts/domain-family";
import { useUI } from "../../../i18n/ui/useUI";
import { Modal } from "../../../ui";
import { upgradeToTeam } from "../../../lib/im/groups-api";
import { reasonOf } from "../../../lib/im/people-api";

export interface UpgradeToTeamDialogProps {
  conversationId: string;
  defaultName?: string;
  onClose: () => void;
  onDone: (result: { orgId: string }) => void;
}

export function UpgradeToTeamDialog({ conversationId, defaultName = "", onClose, onDone }: UpgradeToTeamDialogProps) {
  const tt = useUI();
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setNote(null);
    try {
      const r = await upgradeToTeam(conversationId, name);
      setOrgId(r.org_id);
    } catch (e) {
      setNote(reasonOf(e, tt("没成功，请稍后再试。")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-sm" labelledBy="im-upgrade-title">
      <div className="p-5" data-upgrade-team>
        <h3 id="im-upgrade-title" className="text-[15px] font-semibold text-neutral-900">
          {tt("升级成 Team")}
        </h3>
        {orgId ? (
          <>
            <p className="mt-2 text-[13px] leading-relaxed text-neutral-600" data-upgrade-result>
              {tt("已升级成 Team。群里的其他人会收到 Team 邀请；之后要加人，请到 Team 页面邀请。")}
            </p>
            <a
              href={portalHref(`/org?org=${encodeURIComponent(orgId)}`)}
              target="_blank"
              rel="noopener noreferrer"
              data-action="open-team-page"
              className="mt-2 inline-flex min-h-11 items-center text-[13px] text-sky-700 underline underline-offset-2 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              {tt("打开 Team 页面")}
            </a>
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={() => onDone({ orgId })} data-action="done" className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white">
                {tt("好")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">
              {tt("升级后，这个群变成 Team 群，成员跟 Team 成员自动同步。群里的其他人会收到 Team 邀请；没加入 Team 的人会显示「外部」。")}
            </p>
            <input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              data-field="team-name"
              aria-label={tt("Team 名称")}
              placeholder={tt("Team 名称")}
              className="mt-3 w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
            />
            {note && (
              <p role="alert" className="mt-2 text-[12px] text-red-600">
                {note}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] text-neutral-500 hover:bg-neutral-50">
                {tt("取消")}
              </button>
              <button type="button" disabled={busy || !name.trim()} onClick={submit} data-action="upgrade" className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white disabled:opacity-50">
                {tt("升级")}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
