"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { ConfirmDialog } from "../../../ui";
import { signOutEverywhere } from "../../../lib/auth";
import { deleteOceanLeoAccount, updateAvatar, updateDisplayName } from "../../../lib/auth/account-identity";
import { formatMoney } from "../../../lib/money";
import { writeClipboardText } from "../../../shell/share/share-clipboard";
import { ChangeEmailDialog } from "./ChangeEmailDialog";
import {
  avatarInitial,
  emailForChangeDialog,
  fileToAvatarDataUrl,
  identityCallResult,
  sessionContactDisplay,
  trimmedDisplayName,
  type AccountHomeProfile,
  type AccountHomeProps,
} from "./account-home-model";

export type { AccountHomeProfile, AccountHomeProps } from "./account-home-model";

const RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45";
const QUIET_BTN =
  `rounded-lg border border-neutral-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-neutral-800 transition hover:bg-neutral-50 ${RING}`;
const ROW = "flex items-start justify-between gap-4 py-3";

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none">
      <path
        d="M4 16.5 15.8 4.7a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L7.5 20H4v-3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M13.6 6.9 17.1 10.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" data-account-sign-out-icon="">
      <path
        d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M10 12h11M16 7l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AccountHome({
  profile,
  credits,
  currency,
  onOpenSignInMethods,
  onOpenDevices,
  onOpenTopup,
  onSignedOut,
  onProfileChange,
  onDeleteAccount,
}: AccountHomeProps) {
  const tt = useUI();
  const nameId = useId();
  const [name, setName] = useState(profile.displayName);
  const committedName = useRef(profile.displayName);
  const [copied, setCopied] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(profile.displayName);
    committedName.current = profile.displayName;
  }, [profile.displayName]);

  const contactText = sessionContactDisplay(profile.sessionContact);
  const changeEmail = emailForChangeDialog(profile.sessionContact);
  const balanceText =
    credits == null || Number.isNaN(Number(credits)) ? tt("加载中…") : formatMoney(credits, currency);

  function emitProfile(next: AccountHomeProfile) {
    onProfileChange?.(next);
  }

  function onNameInput(value: string) {
    setName(value);
    setNameError(null);
    emitProfile({ ...profile, displayName: value });
  }

  async function commitName() {
    const next = trimmedDisplayName(name);
    if (next === committedName.current) {
      if (name !== next) setName(next);
      return;
    }
    const result = identityCallResult(await updateDisplayName(next));
    if (result.error) {
      setName(committedName.current);
      emitProfile({ ...profile, displayName: committedName.current });
      setNameError(result.error);
      return;
    }
    committedName.current = next;
    setName(next);
    emitProfile({ ...profile, displayName: next });
  }

  async function handleLogout() {
    await signOutEverywhere();
    onSignedOut?.();
  }

  async function handleDelete() {
    setConfirmDelete(false);
    if (onDeleteAccount) {
      await onDeleteAccount();
      return;
    }
    const result = await deleteOceanLeoAccount();
    if (result.error) {
      setDeleteNotice(true);
      return;
    }
    await signOutEverywhere();
    onSignedOut?.();
  }

  async function onAvatarFile(file: File | undefined) {
    if (!file) return;
    setAvatarError(null);
    const prepared = await fileToAvatarDataUrl(file);
    if (prepared.error || !prepared.url) {
      setAvatarError(prepared.error || "请选择图片文件（JPG / PNG）。");
      return;
    }
    const result = identityCallResult(await updateAvatar(prepared.url));
    if (result.error) {
      setAvatarError(result.error);
      return;
    }
    emitProfile({ ...profile, displayName: name, avatarUrl: prepared.url });
  }

  async function copyUserId() {
    const ok = await writeClipboardText(profile.userId);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div data-settings-pane="account" className="space-y-1">
      {confirmLogout ? (
        <ConfirmDialog
          title={tt("退出登录")}
          body={tt("退出后需要重新登录才能使用。这将退出全部 OceanLeo 站点。")}
          confirmLabel={tt("退出登录")}
          danger
          onConfirm={handleLogout}
          onCancel={() => setConfirmLogout(false)}
        />
      ) : null}
      {confirmDelete ? (
        <ConfirmDialog
          title={tt("确认删除账户")}
          body={`${tt("这将删除你的账户和全部数据。")} ${tt("删除后无法恢复。未用完的余额按退款政策处理。")}`}
          confirmLabel={tt("删除账户")}
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
      {emailOpen ? (
        <ChangeEmailDialog
          currentEmail={changeEmail}
          onClose={() => setEmailOpen(false)}
          onChanged={(email) => {
            emitProfile({
              ...profile,
              sessionContact: { kind: "email", value: email, provider: "email" },
            });
          }}
        />
      ) : null}

      <div className="flex items-center gap-4 pb-4">
        <button
          type="button"
          data-account-avatar=""
          aria-label={tt("上传头像")}
          onClick={() => avatarFileRef.current?.click()}
          className={`group relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-[22px] font-medium text-white ${RING}`}
          style={{ backgroundColor: "#c2185b" }}
        >
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            avatarInitial({ ...profile, displayName: name })
          )}
          <span
            data-account-avatar-edit=""
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-white opacity-0 transition-opacity duration-[var(--leo-dur-2)] group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <PencilIcon />
          </span>
        </button>
        <input
          ref={avatarFileRef}
          type="file"
          accept="image/*"
          hidden
          data-account-avatar-file=""
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void onAvatarFile(file);
          }}
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={nameId} className="block text-[12px] text-neutral-500">
            {tt("全名")}
          </label>
          <input
            id={nameId}
            data-account-full-name=""
            type="text"
            value={name}
            onChange={(event) => onNameInput(event.target.value)}
            onBlur={() => void commitName()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            className={`mt-1 w-full max-w-xs rounded-lg bg-neutral-100 px-3 py-2 text-[14px] text-neutral-900 ${RING}`}
          />
          {nameError ? (
            <p role="alert" className="mt-1 text-[12px] text-red-600">
              {tt(nameError)}
            </p>
          ) : null}
          {avatarError ? (
            <p role="alert" data-account-avatar-error="" className="mt-1 text-[12px] text-red-600">
              {tt(avatarError)}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          data-account-sign-out=""
          aria-label={tt("退出登录")}
          onClick={() => setConfirmLogout(true)}
          className={`ml-auto shrink-0 rounded-xl bg-neutral-100 p-2.5 text-neutral-600 transition hover:bg-neutral-200 ${RING}`}
        >
          <SignOutIcon />
        </button>
      </div>

      <div className="pt-2">
        <div className={ROW}>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-neutral-900">{tt("余额")}</p>
            <p data-account-balance="" className="mt-0.5 text-[13px] tabular-nums text-neutral-500">
              {balanceText}
            </p>
          </div>
          <button
            type="button"
            data-account-topup=""
            onClick={() => onOpenTopup?.()}
            className={QUIET_BTN}
          >
            {tt("充值")}
          </button>
        </div>
        <div className={ROW}>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-neutral-900">{tt("邮箱")}</p>
            <p data-account-email="" className="mt-0.5 truncate text-[13px] text-neutral-500">
              {contactText}
            </p>
          </div>
          <button
            type="button"
            data-account-email-change=""
            onClick={() => setEmailOpen(true)}
            className={QUIET_BTN}
          >
            {tt("更改")}
          </button>
        </div>
        <div className={ROW}>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-neutral-900">{tt("用户 ID")}</p>
            <p data-account-user-id="" className="mt-0.5 truncate text-[13px] text-neutral-500">
              {profile.userId}
            </p>
          </div>
          <button type="button" data-account-copy-user-id="" onClick={() => void copyUserId()} className={QUIET_BTN}>
            {copied ? tt("已复制。") : tt("复制")}
          </button>
        </div>
      </div>

      <div className="pt-2">
        <div className={ROW}>
          <div className="min-w-0 pr-4">
            <p className="text-[13px] font-medium text-neutral-900">{tt("登录方式")}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
              {tt("管理用于登录 OceanLeo 的第三方账号。")}
            </p>
          </div>
          <button
            type="button"
            data-account-open-sign-in-methods=""
            onClick={() => onOpenSignInMethods?.()}
            className={QUIET_BTN}
          >
            {tt("管理")}
          </button>
        </div>
        <div className={ROW}>
          <div className="min-w-0 pr-4">
            <p className="text-[13px] font-medium text-neutral-900">{tt("已连接的设备")}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
              {tt("查看并管理已登录 OceanLeo 的设备。")}
            </p>
          </div>
          <button
            type="button"
            data-account-open-devices=""
            onClick={() => onOpenDevices?.()}
            className={QUIET_BTN}
          >
            {tt("管理")}
          </button>
        </div>
        <div className={`${ROW} items-center`}>
          <div className="min-w-0 pr-4">
            <p className="text-[13px] font-medium text-neutral-900">{tt("删除账户")}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-400">
              {tt("这将删除你的账户和全部数据。")}
            </p>
            {deleteNotice ? (
              <p role="status" data-account-delete-notice="" className="mt-2 text-[12px] text-neutral-600">
                {tt("请写信到 support@oceanleo.com 申请注销。")}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            data-account-delete=""
            onClick={() => setConfirmDelete(true)}
            className={`shrink-0 rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-red-500 hover:bg-red-50 ${RING}`}
          >
            {tt("删除账户")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AccountHome;
