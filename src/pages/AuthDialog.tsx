"use client";

// ============================================================================
// @oceanleo/ui — 全家桶统一登录 UI（邮箱密码 / 中国手机号短信 / 微信扫码）
// ----------------------------------------------------------------------------
// 为什么在共享包里（附录 3 §3，2026-07-29）：此前 35 份分叉、七种命名散在 32 个站
// 仓里，其中 33 份只有邮箱密码，微信只有门户有，11 份还是死代码。本组件是门户
// `oceanleo/app/_components/auth-modal.tsx`（唯一支持三方式的那份）搬进共享包的
// 版本，全家桶从此只有这一套登录门。
//
// **不新写身份逻辑**：三种方式全部只调用 `src/lib/auth/client.ts` 已经导出的
// `signIn` / `normalizeCnPhone` / `sendPhoneOtp` / `verifyPhoneOtp` /
// `wechatLoginUrl`。会话 cookie 由 `cookieDomainFor()` 定在 `.oceanleo.com`，
// 所以在**任何**子站登录一次，全家桶都是登录态——这也是「每站都要能就地登录」
// 成立的前提（docs/architecture/oceanleo-cross-subdomain-sso.md §3.3「对称式」）。
//
// 三条产品红线：
//   1. **没有注册入口**。注册 2026-06-15 已由 DB 触发器硬关，被邀请的邮箱/手机号
//      直接首次登录即可（0022_signup_allow_invited.sql）。底部固定一行
//      「目前仅开放被邀请的账号登录。」
//   2. **微信回跳默认取当前页**，子站登录后回子站，绝不弹回门户。
//   3. **降级要可读**：SMS provider / 微信开放平台 key 是操作员后配的，未配时
//      上游给的是 `Unsupported phone provider` / 网关 501。直接把英文原文甩给
//      用户等于白屏，`authErrorCopy()` 把它们翻成「改用哪种方式」的人话。
//
// 依赖纪律：不 import `sonner`（共享包里它是 optional peer，32 个站不一定装）。
// 成功与失败一律内联渲染。
// ============================================================================

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from "react";
import {
  normalizeCnPhone,
  oceanleoConfigured,
  sendPhoneOtp,
  signIn,
  verifyPhoneOtp,
  wechatLoginUrl,
} from "../lib/auth/client";
import { ButtonSpinner, Modal } from "../ui";
import { useUI, type UITranslate } from "../i18n/ui/useUI";

export type AuthMethod = "email" | "phone" | "wechat";

/** 登录方式的固定顺序。调用方可用 `methods` 取子集，但顺序由这里定。 */
export const AUTH_METHODS: readonly AuthMethod[] = ["email", "phone", "wechat"];

/** 重新获取验证码的冷却秒数（与门户一致）。 */
const OTP_COOLDOWN_SECONDS = 60;

// ---------------------------------------------------------------------------
// 文案表：所有中文原文集中在这里，`tests/auth-dialog.test.mjs` 用它做 17 语守卫。
// 组件里的 tt() 字面量必须都出现在本表中（测试会按源码里的 tt("…") 反查）。
// ---------------------------------------------------------------------------

/** 上游原始错误 → 用户能照做的中文提示。值必须全部进 17 语词典。 */
const ERROR_COPY = {
  smsUnconfigured: "短信登录暂未开放：短信服务尚未配置，请改用邮箱登录。",
  wechatUnconfigured: "微信登录暂未开放：微信开放平台尚未配置，请改用邮箱或手机号登录。",
  network: "网络错误：无法连接到登录服务，请稍后重试。",
  badCredentials: "邮箱或密码不正确。",
  badOtp: "验证码不正确或已过期，请重新获取。",
  notInvited: "该账号尚未被邀请。目前仅开放被邀请的账号登录。",
  badPhone: "请输入有效的中国大陆手机号。",
  rateLimited: "操作过于频繁，请稍后再试。",
  generic: "登录失败，请稍后重试。",
} as const;

/** 本组件用到的全部中文文案（含 tt() 字面量与错误表）。17 语守卫的清单。 */
export const AUTH_DIALOG_COPY: readonly string[] = [
  "登录 OceanLeo",
  "关闭",
  "登录方式",
  "邮箱",
  "手机号",
  "微信",
  "密码",
  "至少 6 位",
  "登录",
  "处理中...",
  "登录成功",
  "中国大陆手机号",
  "验证码",
  "6 位验证码",
  "获取验证码",
  "验证并登录",
  "验证码已发送，请查收短信。",
  "重发",
  "重新发送（{seconds}s）",
  "使用微信扫码登录 OceanLeo。",
  "微信登录",
  "跳转中...",
  "一次登录，全家桶所有 AI 应用通用。",
  "目前仅开放被邀请的账号登录。",
  "登录服务尚未配置",
  "本站还没有接入 OceanLeo 登录服务，请联系管理员。",
  ...Object.values(ERROR_COPY),
];

// ---------------------------------------------------------------------------
// 纯函数（无 DOM 依赖，可直接单测）
// ---------------------------------------------------------------------------

/**
 * 微信登录成功后的回跳地址。
 *
 * 默认取**当前页**：这是「子站登录后回到子站」的全部实现——`wechatLoginUrl()`
 * 会把它塞进 `?redirect=`，网关回调后原样跳回。显式传 `explicit` 只在调用方
 * 想指定落点（如登录后直接进 `/account`）时用。
 *
 * 服务端渲染阶段没有 `window`，返回空串；`wechatLoginUrl()` 收到空串时自身也会
 * 回退到 `window.location.href`，所以两侧都不会拼出半截 URL。
 */
export function wechatRedirectTarget(explicit?: string, currentHref?: string): string {
  const fromArg = (explicit || "").trim();
  if (fromArg) return fromArg;
  if (typeof currentHref === "string") return currentHref;
  return typeof window !== "undefined" ? window.location.href : "";
}

const NETWORK_PATTERNS = [
  /网络错误/,
  /failed to fetch/i,
  /network\s*(error|request failed)/i,
  /load failed/i,
  /fetch failed/i,
];

/**
 * 「后端能力没配」的形态。短信走 Supabase（`Unsupported phone provider`），
 * 微信走我们网关（未配 appid 时返回 501，`wechatLoginUrl` 把它变成
 * 「微信登录暂未开放」或网关的 detail）。两边都要认出来。
 */
const UNCONFIGURED_PATTERNS = [
  /unsupported\s+phone\s+provider/i,
  /(sms|phone|otp|wechat|weixin)[^.]{0,40}(provider|service|login)[^.]{0,20}(not|isn't|is not)\s+(configured|enabled|supported|available)/i,
  /provider[^.]{0,20}(not enabled|is disabled|not configured|not supported)/i,
  /not implemented/i,
  /\b501\b/,
  /未配置|尚未配置|未开通|暂未开放|尚未开放|尚未接入/,
];

/** 注册已关（DB 触发器）时上游的各种说法。 */
const NOT_INVITED_PATTERNS = [
  /signups?\s+not\s+allowed/i,
  /signup\s+is\s+disabled/i,
  /database error saving new user/i,
  /not\s+invited/i,
  /未被邀请|注册已关闭|仅开放被邀请/,
];

const RATE_LIMIT_PATTERNS = [
  /rate\s*limit/i,
  /too many requests/i,
  /for security purposes/i,
  /over_email_send_rate_limit|over_sms_send_rate_limit/i,
  /过于频繁/,
];

const BAD_OTP_PATTERNS = [
  /token has expired or is invalid/i,
  /invalid[^.]{0,20}(otp|token|code)/i,
  /otp_expired/i,
  /验证码.*(错误|无效|过期)/,
];

const BAD_CREDENTIALS_PATTERNS = [
  /invalid login credentials/i,
  /invalid_credentials/i,
  /email not confirmed/i,
  /密码.*(错误|不正确)/,
];

const NOT_CONFIGURED_CLIENT = /supabase not configured/i;

function matchesAny(raw: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(raw));
}

/**
 * 把上游原始错误翻成用户能照做的中文。返回的是**中文原文**（词典 key），
 * 调用方 `tt()` 一下就得到当前语言的版本。
 *
 * 关键：`method` 参与判定。同一句 `Unsupported phone provider` 在手机号 tab 上
 * 该说「改用邮箱」，在微信 tab 上该说「改用邮箱或手机号」——只看错误串是分不出来的。
 */
export function authErrorCopy(method: AuthMethod, raw?: string): string {
  const text = (raw || "").trim();
  if (!text) return ERROR_COPY.generic;
  if (matchesAny(text, NETWORK_PATTERNS)) return ERROR_COPY.network;
  if (NOT_CONFIGURED_CLIENT.test(text) || matchesAny(text, UNCONFIGURED_PATTERNS)) {
    if (method === "wechat") return ERROR_COPY.wechatUnconfigured;
    if (method === "phone") return ERROR_COPY.smsUnconfigured;
    return ERROR_COPY.generic;
  }
  if (matchesAny(text, NOT_INVITED_PATTERNS)) return ERROR_COPY.notInvited;
  if (matchesAny(text, RATE_LIMIT_PATTERNS)) return ERROR_COPY.rateLimited;
  if (method === "phone" && matchesAny(text, BAD_OTP_PATTERNS)) return ERROR_COPY.badOtp;
  if (method === "email" && matchesAny(text, BAD_CREDENTIALS_PATTERNS)) {
    return ERROR_COPY.badCredentials;
  }
  // 认不出来的错误原样透出：至少告诉用户发生了什么，比吞掉强。
  return text;
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------

export interface AuthDialogProps {
  /** 关闭浮层（调用方持有开关状态）。 */
  onClose: () => void;
  /** 登录成功回调，在自动关闭之前触发。 */
  onSuccess?: () => void;
  /** 默认选中的登录方式。 */
  defaultMethod?: AuthMethod;
  /** 允许的登录方式子集，默认三种全开。 */
  methods?: readonly AuthMethod[];
  /** 微信回跳地址，默认当前页（见 `wechatRedirectTarget`）。 */
  wechatRedirect?: string;
  /** 标题，默认「登录 OceanLeo」。 */
  title?: string;
  /** 成功后是否自动关闭，默认 true。 */
  closeOnSuccess?: boolean;
}

export interface AuthPanelProps extends Omit<AuthDialogProps, "onClose"> {
  /** 内嵌使用时可不传：不传就不渲染右上角关闭键。 */
  onClose?: () => void;
  className?: string;
}

/** 全家桶统一登录浮层。带 Modal 外壳（遮罩 / Esc / 焦点陷阱由 `../ui` 提供）。 */
export function AuthDialog({ onClose, ...rest }: AuthDialogProps): ReactElement {
  const titleId = useId();
  return (
    <Modal onClose={onClose} className="max-w-md" labelledBy={titleId}>
      <AuthPanel {...rest} onClose={onClose} titleId={titleId} />
    </Modal>
  );
}

/**
 * 登录表单本体，不带 Modal 外壳。给需要**就地内嵌**登录的地方用：
 * `converter` / `aitools` 的页面内登录区、8 站 `/sign-in` 收敛后的落地页、
 * 埋在功能控制台里的登录位。
 */
export function AuthPanel({
  onClose,
  onSuccess,
  defaultMethod = "email",
  methods = AUTH_METHODS,
  wechatRedirect,
  title,
  closeOnSuccess = true,
  className = "",
  titleId: providedTitleId,
}: AuthPanelProps & { titleId?: string }): ReactElement {
  const tt = useUI();
  const generatedId = useId();
  const titleId = providedTitleId || generatedId;
  const available = AUTH_METHODS.filter((m) => methods.includes(m));
  const enabled = available.length > 0 ? available : AUTH_METHODS;
  const initial = enabled.includes(defaultMethod) ? defaultMethod : enabled[0];
  const [method, setMethod] = useState<AuthMethod>(initial);

  // 站点没配 Supabase：不渲染任何表单——渲染了也只会在提交时报
  // "Supabase not configured"，让用户白填一遍。
  const configured = oceanleoConfigured();

  const finish = useCallback(() => {
    onSuccess?.();
    if (closeOnSuccess) onClose?.();
  }, [onSuccess, closeOnSuccess, onClose]);

  return (
    <div data-auth-panel className={`p-6 ${className}`}>
      <div className="mb-5 flex items-center justify-between">
        <h2 id={titleId} className="text-[18px] font-semibold text-neutral-900">
          {title || tt("登录 OceanLeo")}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={tt("关闭")}
            data-auth-close
            className="rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        )}
      </div>

      {!configured ? (
        <div data-auth-unconfigured className="space-y-2 py-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-2xl">
            🔒
          </div>
          <p className="text-[14px] font-medium text-neutral-900">{tt("登录服务尚未配置")}</p>
          <p className="text-[13px] leading-relaxed text-neutral-500">
            {tt("本站还没有接入 OceanLeo 登录服务，请联系管理员。")}
          </p>
        </div>
      ) : (
        <>
          {enabled.length > 1 && (
            <div
              className="mb-5 flex rounded-xl bg-neutral-100 p-1"
              role="tablist"
              aria-label={tt("登录方式")}
              data-auth-active-method={method}
            >
              {enabled.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={method === id}
                  data-auth-method-tab={id}
                  onClick={() => setMethod(id)}
                  className={`flex-1 rounded-lg py-1.5 text-[13px] font-medium transition ${
                    method === id
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  {tt(methodLabel(id))}
                </button>
              ))}
            </div>
          )}

          {method === "email" && <EmailForm tt={tt} onDone={finish} />}
          {method === "phone" && <PhoneForm tt={tt} onDone={finish} />}
          {method === "wechat" && <WechatPanel tt={tt} redirect={wechatRedirect} />}

          <p className="mt-4 text-center text-[11px] leading-relaxed text-neutral-400">
            {tt("一次登录，全家桶所有 AI 应用通用。")}
          </p>
          {/* 注册已关闭（2026-06-15，DB 触发器）：这里**不放**任何注册入口。 */}
          <p
            data-auth-invite-only
            className="mt-1 text-center text-[11px] text-neutral-400"
          >
            {tt("目前仅开放被邀请的账号登录。")}
          </p>
        </>
      )}
    </div>
  );
}

function methodLabel(method: AuthMethod): string {
  if (method === "email") return "邮箱";
  if (method === "phone") return "手机号";
  return "微信";
}

const FIELD_CLASS =
  "w-full rounded-lg border border-neutral-200 px-3 py-2 text-[14px] outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";
const SUBMIT_CLASS =
  "w-full rounded-lg bg-neutral-900 py-2.5 text-[14px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:opacity-60";

function ErrorNote({ text }: { text: string }) {
  return (
    <div
      data-auth-error
      role="alert"
      className="v-fade-in rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700"
    >
      {text}
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div
      data-auth-notice
      role="status"
      className="v-fade-in rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700"
    >
      {text}
    </div>
  );
}

function EmailForm({ tt, onDone }: { tt: UITranslate; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn(email, password);
    setLoading(false);
    if (result.error) {
      setError(tt(authErrorCopy("email", result.error)));
      return;
    }
    setDone(true);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-auth-form="email">
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-neutral-700" htmlFor="oceanleo-auth-email">
          {tt("邮箱")}
        </label>
        <input
          id="oceanleo-auth-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={FIELD_CLASS}
          placeholder="your@email.com"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-neutral-700" htmlFor="oceanleo-auth-password">
          {tt("密码")}
        </label>
        <input
          id="oceanleo-auth-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className={FIELD_CLASS}
          placeholder={tt("至少 6 位")}
        />
      </div>
      {error && <ErrorNote text={error} />}
      {done && <Notice text={tt("登录成功")} />}
      <button type="submit" disabled={loading} data-auth-submit className={SUBMIT_CLASS}>
        {loading ? <ButtonSpinner label={tt("处理中...")} /> : tt("登录")}
      </button>
    </form>
  );
}

function PhoneForm({ tt, onDone }: { tt: UITranslate; onDone: () => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // 门户那份把 setInterval 留在闭包里，浮层关掉后仍在跑（卸载后 setState 警告）。
  // 这里把 timer 记在 ref 上并在卸载时清掉。
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startCooldown() {
    if (timerRef.current) clearInterval(timerRef.current);
    setCooldown(OTP_COOLDOWN_SECONDS);
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
    // 本地先判一次格式：省掉一次注定失败的往返，错误提示也更准。
    // 归一化本身仍由 client.ts 的 normalizeCnPhone 做，这里不另写一套规则。
    if (!normalizeCnPhone(phone)) {
      setError(tt(ERROR_COPY.badPhone));
      return;
    }
    setLoading(true);
    const r = await sendPhoneOtp(phone);
    setLoading(false);
    if (r.error) {
      setError(tt(authErrorCopy("phone", r.error)));
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
    const r = await verifyPhoneOtp(phone, code);
    setLoading(false);
    if (r.error) {
      setError(tt(authErrorCopy("phone", r.error)));
      return;
    }
    setNotice(tt("登录成功"));
    onDone();
  }

  return (
    <form
      data-auth-form="phone"
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
        <label className="mb-1.5 block text-[13px] font-medium text-neutral-700" htmlFor="oceanleo-auth-phone">
          {tt("手机号")}
        </label>
        <input
          id="oceanleo-auth-phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          className={FIELD_CLASS}
          placeholder={tt("中国大陆手机号")}
        />
      </div>
      {sent && (
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-neutral-700" htmlFor="oceanleo-auth-otp">
            {tt("验证码")}
          </label>
          <div className="flex gap-2">
            <input
              id="oceanleo-auth-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className={FIELD_CLASS}
              placeholder={tt("6 位验证码")}
            />
            <button
              type="button"
              data-auth-resend
              onClick={() => void send()}
              disabled={cooldown > 0 || loading}
              className="shrink-0 whitespace-nowrap rounded-lg border border-neutral-200 px-3 text-[13px] text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-50"
            >
              {cooldown > 0 ? tt("重新发送（{seconds}s）", { seconds: cooldown }) : tt("重发")}
            </button>
          </div>
        </div>
      )}
      {error && <ErrorNote text={error} />}
      {!error && notice && <Notice text={notice} />}
      <button type="submit" disabled={loading} data-auth-submit className={SUBMIT_CLASS}>
        {loading ? (
          <ButtonSpinner label={tt("处理中...")} />
        ) : sent ? (
          tt("验证并登录")
        ) : (
          tt("获取验证码")
        )}
      </button>
    </form>
  );
}

function WechatPanel({ tt, redirect }: { tt: UITranslate; redirect?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setError("");
    setLoading(true);
    // 回跳地址默认是**当前页**——这一行就是「子站登录后回子站」的全部。
    const r = await wechatLoginUrl(wechatRedirectTarget(redirect));
    if (r.url) {
      // 不清 loading：页面正在离开，闪一下 idle 态反而像失败。
      if (typeof window !== "undefined") window.location.href = r.url;
      return;
    }
    setLoading(false);
    setError(tt(authErrorCopy("wechat", r.error)));
  }

  return (
    <div className="space-y-4 text-center" data-auth-form="wechat">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#07c160]/10 text-3xl">
        💬
      </div>
      <p className="text-[13px] text-neutral-500">{tt("使用微信扫码登录 OceanLeo。")}</p>
      {error && (
        <div
          data-auth-error
          role="alert"
          className="v-fade-in rounded-lg bg-amber-50 px-3 py-2 text-left text-[13px] text-amber-700"
        >
          {error}
        </div>
      )}
      <button
        type="button"
        data-auth-submit
        onClick={() => void go()}
        disabled={loading}
        className="w-full rounded-lg bg-[#07c160] py-2.5 text-[14px] font-medium text-white transition hover:bg-[#06ad56] active:scale-[0.99] disabled:opacity-60"
      >
        {loading ? <ButtonSpinner label={tt("跳转中...")} /> : tt("微信登录")}
      </button>
    </div>
  );
}
