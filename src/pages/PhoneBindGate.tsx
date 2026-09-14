"use client";

// ============================================================================
// @oceanleo/ui — 国内版绑手机（当前账号，不是登录 OTP）
// ----------------------------------------------------------------------------
// 只在 `currentDomainFamily() === "cn"` 出现。.com 这一支零可见改动。
// 绑号走已登录会话上的换号接口（见 lib/auth/client 的 requestPhoneChange /
// verifyPhoneChange）。禁止改成登录短信：那会登成另一个账号。
// ============================================================================

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  AUTH_STATE_EVENT,
  PHONE_REQUIRED_EVENT,
  cnPhoneIsBound,
  getAuthPhoneUser,
  normalizeCnPhone,
  requestPhoneChange,
  verifyPhoneChange,
} from "../lib/auth/client";
import { currentDomainFamily } from "../contracts/domain-family";
import { ButtonSpinner } from "../ui";
import { useUI, type UITranslate } from "../i18n/ui/useUI";

/** 与 `AuthDialog` 的 `OTP_COOLDOWN_SECONDS` 同为 60。 */
export const PHONE_BIND_OTP_COOLDOWN_SECONDS = 60;

const FIELD =
  "w-full rounded-lg border border-neutral-200 px-3 py-2 text-[14px] outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus:border-sky-500 focus:ring-2 focus:ring-sky-100";
const PRIMARY =
  "rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-800 active:scale-[0.99] disabled:opacity-60";

function ErrorNote({ text }: { text: string }) {
  return (
    <div
      role="alert"
      data-phone-bind-error
      className="v-fade-in rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700"
    >
      {text}
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div
      role="status"
      data-phone-bind-notice
      className="v-fade-in rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700"
    >
      {text}
    </div>
  );
}

export interface PhoneBindFormProps {
  tt: UITranslate;
  /** 换绑第一轮：当前号码锁死，只发验证码。 */
  lockedPhone?: string;
  submitLabel: string;
  successNotice?: string;
  onSuccess?: () => void;
}

/** 填号 → 收短信 → 6 位数。Gate 与账号安全页共用这一块。 */
export function PhoneBindForm({
  tt,
  lockedPhone,
  submitLabel,
  successNotice,
  onSuccess,
}: PhoneBindFormProps) {
  const [phone, setPhone] = useState(lockedPhone || "");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setPhone(lockedPhone || "");
    setSent(false);
    setCode("");
    setError("");
    setNotice("");
  }, [lockedPhone]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startCooldown() {
    if (timerRef.current) clearInterval(timerRef.current);
    setCooldown(PHONE_BIND_OTP_COOLDOWN_SECONDS);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  async function send() {
    setError("");
    setNotice("");
    if (!normalizeCnPhone(phone)) {
      setError(tt("请输入有效的中国大陆手机号。"));
      return;
    }
    setLoading(true);
    const result = await requestPhoneChange(phone);
    setLoading(false);
    if (result.error) {
      setError(tt(result.error));
      return;
    }
    setSent(true);
    setNotice(tt("验证码已发送，请查收短信。"));
    startCooldown();
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await verifyPhoneChange(phone, code);
    setLoading(false);
    if (result.error) {
      setError(tt(result.error));
      return;
    }
    setNotice(successNotice ? tt(successNotice) : tt("手机号已经绑到当前账号。"));
    onSuccess?.();
  }

  return (
    <form
      data-phone-bind-form
      className="space-y-4"
      onSubmit={
        sent
          ? verify
          : (e) => {
              e.preventDefault();
              void send();
            }
      }
    >
      <div>
        <label
          className="mb-1.5 block text-[13px] font-medium text-neutral-700"
          htmlFor="oceanleo-phone-bind-number"
        >
          {tt("手机号")}
        </label>
        <input
          id="oceanleo-phone-bind-number"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          readOnly={Boolean(lockedPhone)}
          className={FIELD}
          placeholder={tt("中国大陆手机号")}
        />
      </div>
      {sent && (
        <div>
          <label
            className="mb-1.5 block text-[13px] font-medium text-neutral-700"
            htmlFor="oceanleo-phone-bind-otp"
          >
            {tt("验证码")}
          </label>
          <div className="flex gap-2">
            <input
              id="oceanleo-phone-bind-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className={FIELD}
              placeholder={tt("6 位验证码")}
            />
            <button
              type="button"
              data-phone-bind-resend
              onClick={() => void send()}
              disabled={cooldown > 0 || loading}
              className="shrink-0 whitespace-nowrap rounded-lg border border-neutral-200 px-3 text-[13px] text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 disabled:opacity-50"
            >
              {cooldown > 0
                ? tt("重新发送（{seconds}s）", { seconds: cooldown })
                : tt("重发")}
            </button>
          </div>
        </div>
      )}
      {error && <ErrorNote text={error} />}
      {!error && notice && <Notice text={notice} />}
      <button type="submit" disabled={loading} data-phone-bind-submit className={PRIMARY}>
        {loading ? (
          <ButtonSpinner label={tt("处理中...")} />
        ) : sent ? (
          submitLabel
        ) : (
          tt("获取验证码")
        )}
      </button>
    </form>
  );
}

/**
 * 全家桶外壳上的强制绑卡。未绑不能关掉。`.com` 直接不渲染。
 */
export function PhoneBindGate() {
  const tt = useUI();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const forcedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (currentDomainFamily() !== "cn") {
      setOpen(false);
      return;
    }
    const { user } = await getAuthPhoneUser();
    if (!user) {
      if (!forcedRef.current) setOpen(false);
      return;
    }
    setOpen(!cnPhoneIsBound(user) || forcedRef.current);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (currentDomainFamily() !== "cn") return;
    void refresh();
    function onAuth() {
      void refresh();
    }
    function onRequired() {
      if (currentDomainFamily() !== "cn") return;
      forcedRef.current = true;
      setOpen(true);
    }
    window.addEventListener(AUTH_STATE_EVENT, onAuth);
    window.addEventListener(PHONE_REQUIRED_EVENT, onRequired);
    return () => {
      window.removeEventListener(AUTH_STATE_EVENT, onAuth);
      window.removeEventListener(PHONE_REQUIRED_EVENT, onRequired);
    };
  }, [refresh]);

  if (currentDomainFamily() !== "cn" || !open || !mounted) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4"
      data-phone-bind-gate
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl outline-none"
      >
        <h2 id={titleId} className="text-[17px] font-semibold text-neutral-900">
          {tt("绑定手机号")}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
          {tt("国内版需要把一个已验证的中国大陆手机号绑在当前账号上，才能继续使用。")}
        </p>
        <div className="mt-5">
          <PhoneBindForm
            tt={tt}
            submitLabel={tt("验证并绑定")}
            onSuccess={() => {
              forcedRef.current = false;
              setOpen(false);
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
