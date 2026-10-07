"use client";

import { useId, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { Modal } from "../../../ui";
import {
  completeEmailChange,
  requestEmailChange,
  verifyEmailChange,
} from "../../../lib/auth/account-identity";
import { identityCallResult, isUsableEmail } from "./account-home-model";

const RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--pchrome-accent,var(--awb-accent,var(--accent,#7c3aed)))]/45";

export type ChangeEmailDialogProps = {
  currentEmail: string;
  onClose: () => void;
  onChanged?: (newEmail: string) => void;
};

export function ChangeEmailDialog({ currentEmail, onClose, onChanged }: ChangeEmailDialogProps) {
  const tt = useUI();
  const titleId = useId();
  const codeId = useId();
  const emailId = useId();
  const [step, setStep] = useState<"verify" | "new-email">("verify");
  const [code, setCode] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [nonce, setNonce] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      const result = identityCallResult(await requestEmailChange());
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.nonce) setNonce(result.nonce);
    } finally {
      setBusy(false);
    }
  }

  async function goNext() {
    if (step === "verify") {
      const trimmed = code.trim();
      if (!trimmed) return;
      setError(null);
      setBusy(true);
      try {
        const result = identityCallResult(await verifyEmailChange(trimmed));
        if (result.error) {
          setError(result.error);
          return;
        }
        setNonce(result.nonce ?? nonce ?? trimmed);
        setStep("new-email");
      } finally {
        setBusy(false);
      }
      return;
    }
    const email = newEmail.trim();
    if (!isUsableEmail(email)) {
      setError(tt("输入新的邮箱地址"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = identityCallResult(await completeEmailChange(email, nonce));
      if (result.error) {
        setError(result.error);
        return;
      }
      onChanged?.(email);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const nextDisabled = busy || (step === "verify" ? !code.trim() : !newEmail.trim());

  return (
    <Modal onClose={onClose} className="max-w-md" labelledBy={titleId}>
      <div className="p-6" data-change-email-dialog="" data-change-email-step={step}>
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-[16px] font-semibold text-neutral-900">
            {tt("更改邮箱地址")}
          </h2>
          <button
            type="button"
            aria-label={tt("关闭")}
            onClick={onClose}
            className={`rounded-lg p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 ${RING}`}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
          {tt("为了账户安全，请先完成两步验证。")}
        </p>
        <div className="mt-4 border-t border-neutral-200 pt-4">
          {step === "verify" ? (
            <>
              <h3 className="text-[14px] font-semibold text-neutral-900">{tt("验证身份")}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">
                {tt("验证你的身份后才能继续。点击发送，验证码会发到 {email}", {
                  email: currentEmail || "—",
                })}
              </p>
              <div className="mt-3 flex overflow-hidden rounded-lg border border-neutral-200">
                <input
                  id={codeId}
                  data-change-email-code=""
                  type="text"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={tt("输入验证码")}
                  className={`min-w-0 flex-1 bg-white px-3 py-2 text-[13px] text-neutral-900 placeholder:text-neutral-400 ${RING}`}
                />
                <button
                  type="button"
                  data-change-email-send=""
                  onClick={() => void sendCode()}
                  disabled={busy}
                  className={`shrink-0 border-l border-neutral-200 px-4 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60 ${RING}`}
                >
                  {busy ? tt("加载中…") : tt("发送")}
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-[14px] font-semibold text-neutral-900">{tt("新邮箱地址")}</h3>
              <input
                id={emailId}
                data-change-email-new=""
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder={tt("输入新的邮箱地址")}
                className={`mt-3 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-900 placeholder:text-neutral-400 ${RING}`}
              />
            </>
          )}
          {error ? (
            <p role="alert" data-change-email-error="" className="mt-2 text-[13px] text-red-600">
              {tt(error)}
            </p>
          ) : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg border border-neutral-200 bg-white px-3.5 py-1.5 text-[13px] font-medium text-neutral-700 hover:bg-neutral-50 ${RING}`}
          >
            {tt("取消")}
          </button>
          <button
            type="button"
            data-change-email-next=""
            disabled={nextDisabled}
            onClick={() => void goNext()}
            className={`rounded-lg bg-neutral-700 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-white ${RING}`}
          >
            {tt("下一步")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ChangeEmailDialog;
