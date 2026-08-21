"use client";

// ============================================================================
// @oceanleo/ui — 「设置新密码」落地页（用户从找回密码的邮件链接点进来）
// ----------------------------------------------------------------------------
// 这一页在 2026-08-21 之前不存在，所以整条找回密码的路是断的：`AuthDialog` 没有
// 入口，`client.ts` 没有 `resetPasswordForEmail`，也没有任何页面能接住邮件链接。
// 忘了密码的用户永久进不来。
//
// 落点路径由 `client.ts` 的 `PASSWORD_RESET_PATH` 定死（`/account/reset-password`），
// 两边共用同一个常量——发信时写进 `redirectTo` 的和这一页挂载的必须是同一个字符串。
//
// 会话怎么来的：Supabase 的恢复链接会带上 `?code=`（PKCE）或
// `#access_token=…&type=recovery`（隐式），`createBrowserClient` 在浏览器里自己
// 把它换成会话。所以这一页**不自己解析 token**，只等会话到位。
// 等不到就要分清两种情况，别用一句含糊的失败把人打发走：
//   - 地址栏里根本没有恢复参数 → 这页是被直接打开的，说清楚要从邮件里进；
//   - 有参数但换不到会话 → 链接过期或已经用过了，让他回登录页再要一条。
// ============================================================================

import { useEffect, useState, type FormEvent } from "react";
import { accessToken, updatePassword } from "../lib/auth/client";
import { oceanleoConfigured, loginUnavailableNotice } from "../lib/auth";
import { ButtonSpinner } from "../ui";
import { useUI } from "../i18n/ui/useUI";

/**
 * 这个地址里带没带恢复链接的参数。纯函数，可直接单测。
 *
 * 认四种形态：PKCE 的 `?code=`、邮件模板的 `?token_hash=`、隐式流的
 * `#access_token=`、以及带 `type=recovery` 的任意一种。
 */
export function hasRecoveryParams(href: string): boolean {
  const url = (href || "").trim();
  if (!url) return false;
  const query = url.slice(url.indexOf("?") + 1);
  const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
  const parts = `${url.includes("?") ? query : ""}&${hash}`;
  return /(^|[&?#])(code|token_hash|access_token)=/.test(parts) || /type=recovery/.test(parts);
}

export interface PasswordResetPageProps {
  /** 改完之后去哪。默认回当前站的账户页。 */
  onDone?: () => void;
  /** 「返回登录」点了去哪。不传就回站点根目录。 */
  onBackToSignIn?: () => void;
  /** 仅为可测：不传就取 `window.location.href`。 */
  currentHref?: string;
}

type Phase = "checking" | "ready" | "no-link" | "expired" | "saved";

export function PasswordResetPage({
  onDone,
  onBackToSignIn,
  currentHref,
}: PasswordResetPageProps) {
  const tt = useUI();
  const configured = oceanleoConfigured();
  const [phase, setPhase] = useState<Phase>(configured ? "checking" : "no-link");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!configured) return;
    let alive = true;
    const href =
      currentHref ?? (typeof window !== "undefined" ? window.location.href : "");
    accessToken().then((token) => {
      if (!alive) return;
      if (token) setPhase("ready");
      else setPhase(hasRecoveryParams(href) ? "expired" : "no-link");
    });
    return () => {
      alive = false;
    };
  }, [configured, currentHref]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError(tt("密码至少 6 位。"));
      return;
    }
    if (password !== again) {
      setError(tt("两次输入的密码不一样。"));
      return;
    }
    setLoading(true);
    const result = await updatePassword(password);
    setLoading(false);
    if (result.error) {
      setError(tt(result.error));
      return;
    }
    setPhase("saved");
  }

  const backButton = (
    <button
      type="button"
      data-reset-back
      onClick={() => {
        if (onBackToSignIn) onBackToSignIn();
        else if (typeof window !== "undefined") window.location.href = "/";
      }}
      className="mt-5 w-full rounded-xl border border-neutral-200 py-2.5 text-[13px] text-neutral-600 transition hover:bg-neutral-50 active:scale-[0.99]"
    >
      {tt("返回登录")}
    </button>
  );

  function Shell({ children }: { children: React.ReactNode }) {
    return (
      <div className="px-8 py-6" data-reset-page={phase}>
        <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">
          {tt("设置新密码")}
        </h1>
        <div className="v-fade-up mx-auto mt-10 max-w-sm">{children}</div>
      </div>
    );
  }

  if (!configured) {
    const notice = loginUnavailableNotice();
    return (
      <Shell>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center text-amber-800">
          <p className="text-[14px] font-medium">{tt(notice?.title || "登录服务尚未配置")}</p>
          {notice?.detail && <p className="mt-1.5 text-[13px]">{tt(notice.detail)}</p>}
        </div>
      </Shell>
    );
  }

  if (phase === "checking") {
    return (
      <Shell>
        <p className="text-center text-[13px] text-neutral-500">{tt("加载中…")}</p>
      </Shell>
    );
  }

  if (phase === "no-link" || phase === "expired") {
    return (
      <Shell>
        <div
          data-reset-blocked={phase}
          className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-[13px] leading-relaxed text-amber-800"
        >
          {phase === "no-link"
            ? tt("这个页面要从邮件里的链接打开才有用。")
            : tt("这条重置链接已经失效了，回登录页重新发一条。")}
        </div>
        {backButton}
      </Shell>
    );
  }

  if (phase === "saved") {
    return (
      <Shell>
        <div
          data-reset-saved
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center"
        >
          <p className="text-[14px] font-medium text-emerald-800">{tt("新密码已经生效")}</p>
          <p className="mt-2 text-left text-[13px] leading-relaxed text-emerald-700">
            {tt("其它设备上的登录不会自动退出。担心的话，登录后去账号安全里退出所有设备。")}
          </p>
        </div>
        <button
          type="button"
          data-reset-done
          onClick={() => {
            if (onDone) onDone();
            else if (typeof window !== "undefined") window.location.href = "/account";
          }}
          className="mt-5 w-full rounded-xl bg-neutral-900 py-2.5 text-[14px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99]"
        >
          {tt("账户")}
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={handleSubmit} className="space-y-4" data-reset-form>
        <p className="text-[13px] leading-relaxed text-neutral-500">
          {tt("这条链接只能用一次。设好之后请用新密码重新登录。")}
        </p>
        <div>
          <label
            className="mb-1.5 block text-[13px] font-medium text-neutral-700"
            htmlFor="oceanleo-reset-password"
          >
            {tt("新密码")}
          </label>
          <input
            id="oceanleo-reset-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[14px] outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            placeholder={tt("至少 6 位")}
          />
        </div>
        <div>
          <label
            className="mb-1.5 block text-[13px] font-medium text-neutral-700"
            htmlFor="oceanleo-reset-password-again"
          >
            {tt("再输一遍")}
          </label>
          <input
            id="oceanleo-reset-password-again"
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            required
            minLength={6}
            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[14px] outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            placeholder={tt("至少 6 位")}
          />
        </div>
        {error && (
          <div
            data-reset-error
            role="alert"
            className="v-fade-in rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700"
          >
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          data-reset-submit
          className="w-full rounded-lg bg-neutral-900 py-2.5 text-[14px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:opacity-60"
        >
          {loading ? <ButtonSpinner label={tt("处理中...")} /> : tt("保存新密码")}
        </button>
      </form>
    </Shell>
  );
}
