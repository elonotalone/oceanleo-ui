"use client";

import { useState } from "react";
import { signOutEverywhere } from "../../../lib/auth";
import { ConfirmDialog } from "../../../ui";
import { useUI } from "../../../i18n/ui/useUI";
import { AccountSecurityPage } from "../../AccountSecurityPage";

export function AccountSection({
  email,
  onSignedOut,
}: {
  email: string | null;
  onSignedOut?: () => void;
}) {
  const tt = useUI();
  const [confirmLogout, setConfirmLogout] = useState(false);

  async function handleLogout() {
    await signOutEverywhere();
    if (onSignedOut) onSignedOut();
    else if (typeof window !== "undefined") window.location.reload();
  }

  return (
    <div data-settings-pane="account" className="space-y-6">
      {confirmLogout && (
        <ConfirmDialog
          title={tt("退出登录")}
          body={tt("退出后需要重新登录才能使用。这将退出全部 OceanLeo 站点。")}
          confirmLabel={tt("退出登录")}
          danger
          onConfirm={handleLogout}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
      <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-[13px] text-neutral-700">{tt("邮箱")}</span>
          <span className="text-[13px] text-neutral-900">{email || "—"}</span>
        </div>
      </div>
      <AccountSecurityPage embedded onSignedOutAll={onSignedOut} />
      <button
        type="button"
        onClick={() => setConfirmLogout(true)}
        className="w-full rounded-xl border border-neutral-200 py-2.5 text-[13px] text-red-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:border-red-200 hover:bg-red-50 active:scale-[0.99]"
      >
        {tt("退出登录")}
      </button>
    </div>
  );
}
