"use client";

// ============================================================================
// @oceanleo/ui — 全家桶统一登录 UI
// 国内默认：邮箱 / 中国手机号短信 / 微信扫码
// 国外默认：邮箱 / Google / Microsoft / Apple
// 六种方式都在 AUTH_METHODS 里；调用方可传 methods 取子集。
// ----------------------------------------------------------------------------
// 为什么在共享包里（附录 3 §3，2026-07-29）：此前 35 份分叉、七种命名散在 32 个站
// 仓里，其中 33 份只有邮箱密码，微信只有门户有，11 份还是死代码。本组件是门户
// `oceanleo/app/_components/auth-modal.tsx`（唯一支持三方式的那份）搬进共享包的
// 版本，全家桶从此只有这一套登录门。
//
// **不新写身份逻辑**：三种方式全部只调用 `src/lib/auth/client.ts` 已经导出的
// `signIn` / `normalizeCnPhone` / `sendPhoneOtp` / `verifyPhoneOtp` /
// `wechatLoginUrl` / `startOauthSignIn`。会话 cookie 由 `cookieDomainFor()` 定在 `.oceanleo.com`，
// 所以在**任何**子站登录一次，全家桶都是登录态——这也是「每站都要能就地登录」
// 成立的前提（docs/architecture/oceanleo-cross-subdomain-sso.md §3.3「对称式」）。
//
// 三条产品红线：
//   1. **登录和注册都在这一扇门**。第一屏不先选登录还是注册：标题已是
//      「登录或注册」，下面是 Google / Microsoft / Apple，或只填邮箱再继续。密码在下一步。
//      已有账号走 `signIn()`，没有的账号用同一组邮箱密码走 `signUp()`。
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
  challengeAndVerify,
  currentAal,
  listMfaFactors,
  needsMfaChallenge,
  normalizeCnPhone,
  oceanleoConfigured,
  sendPasswordReset,
  sendPhoneOtp,
  signIn,
  signUp,
  verifyPhoneOtp,
  startOauthSignIn,
  wechatLoginUrl,
  type OauthProvider,
} from "../lib/auth/client";
import { loginUnavailableNotice } from "../lib/auth/config";
import { currentDomainFamily, type DomainFamily } from "../contracts/domain-family";
import { ButtonSpinner, Modal } from "../ui";
import { useUI, type UITranslate } from "../i18n/ui/useUI";
import {
  CAPTCHA_FAILED_MESSAGE,
  CAPTCHA_LOAD_FAILED_MESSAGE,
  CAPTCHA_VERIFYING_MESSAGE,
  clearCaptchaToken,
  isCaptchaConfigured,
  mountCheckboxCaptcha,
} from "../lib/auth/captcha";

export type AuthMethod = "email" | "phone" | "wechat" | "google" | "microsoft" | "apple";

/** 全部登录方式的固定顺序。调用方可用 `methods` 取子集，但顺序由这里定。 */
export const AUTH_METHODS: readonly AuthMethod[] = [
  "email",
  "phone",
  "wechat",
  "google",
  "microsoft",
  "apple",
];

export const AUTH_METHODS_CN: readonly AuthMethod[] = ["email", "phone", "wechat"];
export const AUTH_METHODS_INTL: readonly AuthMethod[] = ["email", "google", "microsoft", "apple"];

/** 按域名家族选默认门面。境内不露 Google/Microsoft/Apple，国外不露微信/手机号。邮箱两边都留。 */
export function authMethodsForFamily(family: DomainFamily | undefined): readonly AuthMethod[] {
  return family === "cn" ? AUTH_METHODS_CN : AUTH_METHODS_INTL;
}

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
  googleUnconfigured: "Google 登录暂未开放：还没有配置，请改用邮箱登录。",
  microsoftUnconfigured: "Microsoft 登录暂未开放：还没有配置，请改用邮箱登录。",
  appleUnconfigured: "Apple 登录暂未开放：还没有配置，请改用邮箱登录。",
  network: "网络错误：无法连接到登录服务，请稍后重试。",
  badCredentials: "邮箱或密码不正确。",
  badOtp: "验证码不正确或已过期，请重新获取。",
  notInvited: "该账号尚未被邀请。目前仅开放被邀请的账号登录。",
  badPhone: "请输入有效的中国大陆手机号。",
  rateLimited: "操作过于频繁，请稍后再试。",
  generic: "登录失败，请稍后重试。",
  captchaFailed: CAPTCHA_FAILED_MESSAGE,
  captchaLoadFailed: CAPTCHA_LOAD_FAILED_MESSAGE,
} as const;

/** 本组件用到的全部中文文案（含 tt() 字面量与错误表）。17 语守卫的清单。 */
export const AUTH_DIALOG_COPY: readonly string[] = [
  "登录 OceanLeo",
  "登录或注册",
  "开始使用 OceanLeo",
  "继续",
  "输入你的邮箱地址",
  "关闭",
  "登录方式",
  "邮箱",
  "手机号",
  "微信",
  "Google",
  "Microsoft",
  "Apple",
  "使用 Google 继续",
  "使用 Microsoft 继续",
  "使用 Apple 继续",
  "密码",
  "至少 6 位",
  "登录",
  "注册",
  "或",
  "处理中...",
  "登录成功",
  "注册成功",
  "请查收验证邮件后再登录。",
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
  "境内版还没有开放注册和登录",
  "现在可以照常浏览公开内容；开放注册要等备案与审核走完，开放时会在首页说明。",
  // W4（2026-08-21）：忘了密码的自救入口 + 开了两步验证之后的第二屏。
  "忘记密码？",
  "找回密码",
  "输入你注册时用的邮箱，我们发一条重置链接过去。",
  "发送重置链接",
  "重置邮件已经发出去了",
  "邮件可能要几分钟才到，也可能被归进垃圾邮件。没收到就过一会儿再发一次——目前每小时最多发 2 封。",
  "返回登录",
  "请先填写邮箱地址。",
  "再验一步",
  "这个账号开了两步验证。打开验证器 App，输入它现在显示的 6 位码。",
  "6 位数字",
  "验证码不对，或者已经过了它 30 秒的有效期。",
  "两步验证现在开不了，稍后再试。",
  CAPTCHA_VERIFYING_MESSAGE,
  "继续即表示你同意我们的{terms}，并已阅读{privacy}。",
  "服务条款",
  "隐私政策",
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
  /(sms|phone|otp|wechat|weixin|google|apple|microsoft|azure)[^.]{0,40}(provider|service|login)[^.]{0,20}(not|isn't|is not)\s+(configured|enabled|supported|available)/i,
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

const CAPTCHA_PATTERNS = [
  /captcha/i,
  /安全验证没有通过/,
  /安全验证组件加载失败/,
];

const NOT_CONFIGURED_CLIENT = /supabase not configured|登录服务尚未配置/i;

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
  if (matchesAny(text, CAPTCHA_PATTERNS)) {
    if (/load|script|组件加载失败/i.test(text)) return ERROR_COPY.captchaLoadFailed;
    return ERROR_COPY.captchaFailed;
  }
  if (matchesAny(text, NETWORK_PATTERNS)) return ERROR_COPY.network;
  if (NOT_CONFIGURED_CLIENT.test(text) || matchesAny(text, UNCONFIGURED_PATTERNS)) {
    if (method === "wechat") return ERROR_COPY.wechatUnconfigured;
    if (method === "phone") return ERROR_COPY.smsUnconfigured;
    if (method === "google") return ERROR_COPY.googleUnconfigured;
    if (method === "microsoft") return ERROR_COPY.microsoftUnconfigured;
    if (method === "apple") return ERROR_COPY.appleUnconfigured;
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

/** 6 位码这一屏的上游报错。认不出来的照旧原样透出（吞掉才是白屏）。 */
const BAD_TOTP_PATTERNS = [
  /invalid\s+totp/i,
  /invalid[^.]{0,20}(one[-\s]?time|mfa|totp)[^.]{0,20}(code|password)/i,
  /mfa_verification_failed/i,
  /token has expired or is invalid/i,
  /验证码不对|验证码.*(错误|无效|过期)/,
];

export function totpErrorCopy(raw?: string): string {
  const text = (raw || "").trim();
  if (!text) return "验证码不对，或者已经过了它 30 秒的有效期。";
  if (matchesAny(text, NETWORK_PATTERNS)) return ERROR_COPY.network;
  if (matchesAny(text, RATE_LIMIT_PATTERNS)) return ERROR_COPY.rateLimited;
  if (NOT_CONFIGURED_CLIENT.test(text)) return "两步验证现在开不了，稍后再试。";
  if (matchesAny(text, BAD_TOTP_PATTERNS)) return "验证码不对，或者已经过了它 30 秒的有效期。";
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
  /** 标题，默认「登录或注册」。 */
  title?: string;
  /** 成功后是否自动关闭，默认 true。 */
  closeOnSuccess?: boolean;
}

export interface AuthPanelProps extends Omit<AuthDialogProps, "onClose"> {
  /** 内嵌使用时可不传：不传就不渲染右上角关闭键。 */
  onClose?: () => void;
  className?: string;
  /**
   * 标题元素的 id，供外层浮层的 `aria-labelledby` 指过来。`AuthDialog` 自己会传，
   * 内嵌方只有在自带浮层外壳时才需要传；不传则内部 `useId()` 自生成。
   */
  titleId?: string;
}

/** 登录列宽。必须写进 style，不能靠 Tailwind 任意值——预览站的 CSS 扫不到就会把整列拉满。 */
export const AUTH_COLUMN_PX = 360;

export const AUTH_TERMS_HREF = "/terms";
export const AUTH_PRIVACY_HREF = "/privacy";

const SUBMIT_IDLE_STYLE = { backgroundColor: "#8c8c8c" };
const SUBMIT_READY_STYLE = { backgroundColor: "#171717" };

/** 全家桶统一登录浮层。带 Modal 外壳（遮罩 / Esc / 焦点陷阱由 `../ui` 提供）。 */
export function AuthDialog({ onClose, ...rest }: AuthDialogProps): ReactElement {
  const titleId = useId();
  return (
    <Modal onClose={onClose} className="w-full max-w-lg" labelledBy={titleId}>
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
  methods,
  wechatRedirect,
  title,
  closeOnSuccess = true,
  className = "",
  titleId: providedTitleId,
}: AuthPanelProps): ReactElement {
  const tt = useUI();
  const generatedId = useId();
  const titleId = providedTitleId || generatedId;
  const requested = methods ?? authMethodsForFamily(currentDomainFamily());
  const available = AUTH_METHODS.filter((m) => requested.includes(m));
  const enabled = available.length > 0 ? available : AUTH_METHODS;
  const initial = enabled.includes(defaultMethod) ? defaultMethod : enabled[0];
  const [method, setMethod] = useState<AuthMethod>(initial);
  const [emailStep, setEmailStep] = useState<"identify" | "password">("identify");
  const oauthMethods = enabled.filter(isOauthMethod);
  const formMethods = enabled.filter(isFormMethod);
  const showOauthStack = oauthMethods.length > 0 && emailStep === "identify";
  const showFormTabs = formMethods.length > 1;
  const activeForm = formMethods.includes(method as FormMethod) ? (method as FormMethod) : formMethods[0];

  /**
   * 这道门现在有三种画面：
   *   `credentials` 输密码 / 验证码 / 扫码（原来的全部）
   *   `forgot`      忘了密码，填邮箱要一条重置链接
   *   `mfa`         密码已经过了，但这个账号开了两步验证，还差 6 位码
   *
   * `mfa` 这一屏由 `needsMfaChallenge()` 决定出不出现，**不是**由「有没有因子」
   * 决定：注册到一半的 unverified 因子不该把人拦在门外，取不到等级时一律放行。
   * 这一屏拦错的代价是把开了 2FA 的人锁在外面，所以宁可不拦。
   */
  const [view, setView] = useState<"credentials" | "forgot" | "mfa">("credentials");

  // 站点没接登录服务：不渲染任何表单。否则提交后只会得到「登录服务尚未配置」，
  // 让用户白填一遍。境内未接上时走 loginUnavailableNotice，不提内部服务名。
  const configured = oceanleoConfigured();

  const finish = useCallback(() => {
    onSuccess?.();
    if (closeOnSuccess) onClose?.();
  }, [onSuccess, closeOnSuccess, onClose]);

  /** 凭据这一关过了之后走这里：该补第二步就补，否则直接算登录成功。 */
  const afterCredentials = useCallback(async () => {
    if (needsMfaChallenge(await currentAal())) {
      setView("mfa");
      return;
    }
    finish();
  }, [finish]);

  return (
    <div
      data-auth-panel
      data-auth-column=""
      className={className}
      style={{ maxWidth: AUTH_COLUMN_PX, width: "100%", marginInline: "auto" }}
    >
      <div className="relative mb-8 text-center">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={tt("关闭")}
            data-auth-close
            className="absolute right-0 top-0 rounded p-1 text-neutral-400 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        )}
        <h2
          id={titleId}
          className="font-semibold tracking-tight text-neutral-900"
          style={{ fontSize: 28, lineHeight: 1.2 }}
        >
          {title || tt("登录或注册")}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
          {tt("开始使用 OceanLeo")}
        </p>
      </div>

      {!configured ? (
        <div data-auth-unconfigured className="space-y-2 py-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-2xl">
            🔒
          </div>
          <p className="text-[14px] font-medium text-neutral-900">
            {tt(loginUnavailableNotice()?.title || "登录服务尚未配置")}
          </p>
          <p className="text-[13px] leading-relaxed text-neutral-500">
            {tt(
              loginUnavailableNotice()?.detail ||
                "本站还没有接入 OceanLeo 登录服务，请联系管理员。",
            )}
          </p>
        </div>
      ) : view === "forgot" ? (
        <ForgotPasswordForm tt={tt} onBack={() => setView("credentials")} />
      ) : view === "mfa" ? (
        <MfaChallengeForm tt={tt} onDone={finish} />
      ) : (
        <>
          {showOauthStack && (
            <div className="space-y-3" data-auth-oauth-stack="">
              {oauthMethods.map((id) => (
                <OauthPanel
                  key={id}
                  tt={tt}
                  provider={id}
                  redirect={wechatRedirect}
                />
              ))}
            </div>
          )}

          {showOauthStack && formMethods.length > 0 && (
            <div className="my-6 flex items-center gap-4 text-[13px] text-neutral-400" data-auth-or="">
              <span className="h-px flex-1 bg-neutral-300" />
              {tt("或")}
              <span className="h-px flex-1 bg-neutral-300" />
            </div>
          )}

          {showFormTabs && (
            <div
              className="mb-5 flex rounded-xl bg-neutral-100 p-1"
              role="tablist"
              aria-label={tt("登录方式")}
              data-auth-active-method={activeForm}
            >
              {formMethods.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={method === id}
                  data-auth-method-tab={id}
                  onClick={() => {
                    setMethod(id);
                    setEmailStep("identify");
                  }}
                  className={`flex-1 rounded-lg py-1.5 text-[13px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
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

          {activeForm === "email" && formMethods.includes("email") && (
            <EmailForm
              tt={tt}
              onDone={afterCredentials}
              onForgotPassword={() => setView("forgot")}
              onStepChange={setEmailStep}
            />
          )}
          {activeForm === "phone" && (
            <PhoneForm tt={tt} onDone={afterCredentials} />
          )}
          {activeForm === "wechat" && (
            <WechatPanel tt={tt} redirect={wechatRedirect} />
          )}
          <LegalNote tt={tt} />
        </>
      )}
    </div>
  );
}

type FormMethod = "email" | "phone" | "wechat";

function isFormMethod(method: AuthMethod): method is FormMethod {
  return method === "email" || method === "phone" || method === "wechat";
}

function isOauthMethod(method: AuthMethod): method is OauthProvider {
  return method === "google" || method === "microsoft" || method === "apple";
}

function methodLabel(method: AuthMethod): string {
  if (method === "email") return "邮箱";
  if (method === "phone") return "手机号";
  if (method === "wechat") return "微信";
  if (method === "google") return "Google";
  if (method === "microsoft") return "Microsoft";
  return "Apple";
}

const OAUTH_CONTINUE: Record<OauthProvider, string> = {
  google: "使用 Google 继续",
  microsoft: "使用 Microsoft 继续",
  apple: "使用 Apple 继续",
};

const FIELD_CLASS =
  "w-full rounded-2xl border-0 bg-white px-4 py-3.5 text-[15px] outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] placeholder:text-neutral-400";
const FIELD_STYLE = { boxShadow: "0 0 0 1px rgba(15,15,15,0.12)" };
const SUBMIT_CLASS =
  "w-full rounded-full py-3.5 text-[15px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed";
const SUBMIT_STYLE = SUBMIT_IDLE_STYLE;

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

function CaptchaBusyLabel({ tt }: { tt: UITranslate }) {
  return (
    <ButtonSpinner
      label={tt(isCaptchaConfigured() ? CAPTCHA_VERIFYING_MESSAGE : "处理中...")}
    />
  );
}

/** 凭据通过后的回调。可能要 await（要先问一次会话等级够不够）。 */
type CredentialsDone = () => void | Promise<void>;

/**
 * 只有「这组邮箱密码对不上已有账号」才接着尝试注册。
 * 网络、验证码、频率、邮箱未验证都停在登录失败，避免把一次故障再打成注册。
 */
function shouldCreateAccount(raw?: string): boolean {
  const text = (raw || "").trim();
  if (!text) return false;
  if (/email not confirmed/i.test(text)) return false;
  if (matchesAny(text, NETWORK_PATTERNS)) return false;
  if (matchesAny(text, RATE_LIMIT_PATTERNS)) return false;
  if (matchesAny(text, CAPTCHA_PATTERNS)) return false;
  return /invalid login credentials/i.test(text) || /invalid_credentials/i.test(text) || /user not found/i.test(text);
}

const ALREADY_REGISTERED = /already (been )?registered|user already exists|email address.+already/i;

function emailLooksValid(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function submitStyle(ready: boolean): { backgroundColor: string } {
  return ready ? SUBMIT_READY_STYLE : SUBMIT_IDLE_STYLE;
}

function LegalNote({ tt }: { tt: UITranslate }) {
  const template = tt("继续即表示你同意我们的{terms}，并已阅读{privacy}。");
  const termsLabel = tt("服务条款");
  const privacyLabel = tt("隐私政策");
  const nodes: Array<string | ReactElement> = [];
  const re = /\{(terms|privacy)\}/g;
  let last = 0;
  let match: RegExpExecArray | null = re.exec(template);
  while (match) {
    if (match.index > last) nodes.push(template.slice(last, match.index));
    if (match[1] === "terms") {
      nodes.push(
        <a
          key="terms"
          href={AUTH_TERMS_HREF}
          data-auth-terms=""
          className="underline underline-offset-2 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:text-neutral-700"
        >
          {termsLabel}
        </a>,
      );
    } else {
      nodes.push(
        <a
          key="privacy"
          href={AUTH_PRIVACY_HREF}
          data-auth-privacy=""
          className="underline underline-offset-2 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:text-neutral-700"
        >
          {privacyLabel}
        </a>,
      );
    }
    last = match.index + match[0].length;
    match = re.exec(template);
  }
  if (last < template.length) nodes.push(template.slice(last));
  return (
    <p
      data-auth-legal=""
      className="mt-8 text-center text-[12px] leading-relaxed text-neutral-400"
    >
      {nodes}
    </p>
  );
}

function CaptchaBox({ onToken }: { onToken: (token: string | null) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!isCaptchaConfigured()) {
      onTokenRef.current(null);
      return;
    }
    const el = hostRef.current;
    if (!el) return;
    return mountCheckboxCaptcha(el, (token) => {
      onTokenRef.current(token);
    });
  }, []);

  if (!isCaptchaConfigured()) return null;
  return (
    <div
      ref={hostRef}
      data-auth-captcha=""
      className="flex w-full items-center justify-center"
    />
  );
}

function EmailForm({
  tt,
  onDone,
  onForgotPassword,
  onStepChange,
}: {
  tt: UITranslate;
  onDone: CredentialsDone;
  onForgotPassword: () => void;
  onStepChange: (step: "identify" | "password") => void;
}) {
  const [step, setStep] = useState<"identify" | "password">("identify");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pendingVerify, setPendingVerify] = useState(false);
  const emailReady = emailLooksValid(email);
  const captchaRequired =
    currentDomainFamily() !== "cn" && isCaptchaConfigured();
  const identifyReady = emailReady && (!captchaRequired || Boolean(captchaToken));
  const passwordReady = password.trim().length >= 6;

  function goIdentify() {
    clearCaptchaToken();
    setCaptchaToken(null);
    setError("");
    setPendingVerify(false);
    setStep("identify");
    onStepChange("identify");
  }

  function continueToPassword(e: FormEvent) {
    e.preventDefault();
    if (!identifyReady) return;
    setError("");
    setStep("password");
    onStepChange("password");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!passwordReady) return;
    setError("");
    setPendingVerify(false);
    setLoading(true);
    const signed = await signIn(email, password);
    if (!signed.error) {
      setLoading(false);
      setDone(true);
      await onDone();
      return;
    }
    if (!shouldCreateAccount(signed.error)) {
      setLoading(false);
      setError(tt(authErrorCopy("email", signed.error)));
      return;
    }
    const created = await signUp(email, password);
    setLoading(false);
    if (created.error) {
      if (ALREADY_REGISTERED.test(created.error)) {
        setError(tt(ERROR_COPY.badCredentials));
        return;
      }
      setError(tt(authErrorCopy("email", created.error)));
      return;
    }
    if (!created.data?.session) {
      setPendingVerify(true);
      return;
    }
    setDone(true);
    await onDone();
  }

  if (step === "identify") {
    return (
      <form onSubmit={continueToPassword} className="space-y-4" data-auth-form="email" data-auth-email-step="identify">
        <input
          id="oceanleo-auth-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={FIELD_CLASS}
          style={FIELD_STYLE}
          placeholder={tt("输入你的邮箱地址")}
        />
        {captchaRequired ? <CaptchaBox onToken={setCaptchaToken} /> : null}
        <button
          type="submit"
          data-auth-submit
          data-auth-submit-ready={identifyReady ? "true" : "false"}
          disabled={!identifyReady}
          className={SUBMIT_CLASS}
          style={submitStyle(identifyReady)}
        >
          {tt("继续")}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-auth-form="email" data-auth-email-step="password">
      <p className="text-center text-[14px] text-neutral-500">{email}</p>
      <input
        id="oceanleo-auth-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={6}
        className={FIELD_CLASS}
        style={FIELD_STYLE}
        placeholder={tt("密码")}
      />
      {error && <ErrorNote text={error} />}
      {pendingVerify && <Notice text={tt("请查收验证邮件后再登录。")} />}
      {done && <Notice text={tt("登录成功")} />}
      <button
        type="submit"
        data-auth-submit
        data-auth-submit-ready={passwordReady && !loading ? "true" : "false"}
        disabled={loading || !passwordReady}
        className={SUBMIT_CLASS}
        style={submitStyle(passwordReady)}
      >
        {loading ? <CaptchaBusyLabel tt={tt} /> : tt("继续")}
      </button>
      <button
        type="button"
        data-auth-forgot
        onClick={onForgotPassword}
        className="w-full text-center text-[13px] text-neutral-500 underline-offset-2 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:text-neutral-800 hover:underline"
      >
        {tt("忘记密码？")}
      </button>
      <button
        type="button"
        data-auth-back
        onClick={goIdentify}
        className="w-full text-center text-[13px] text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:text-neutral-800"
      >
        {tt("返回登录")}
      </button>
    </form>
  );
}

/**
 * 找回密码的一屏。
 *
 * 发信这条路**现在能用但极其有限**：平台没配 SMTP，`rate_limit_email_sent`
 * 实测 2 封/小时。所以成功文案不写「已发送，请查收」然后让人干等，而是把
 * 「要等几分钟 / 可能进垃圾邮件 / 每小时只能发 2 封」如实写出来。
 */
function ForgotPasswordForm({ tt, onBack }: { tt: UITranslate; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError(tt("请先填写邮箱地址。"));
      return;
    }
    setLoading(true);
    const result = await sendPasswordReset(email);
    setLoading(false);
    if (result.error) {
      setError(tt(authErrorCopy("email", result.error)));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div data-auth-form="forgot-sent" className="space-y-3 py-2 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-2xl">
          ✉️
        </div>
        <p className="text-[14px] font-medium text-neutral-900">{tt("重置邮件已经发出去了")}</p>
        <p className="text-left text-[13px] leading-relaxed text-neutral-500">
          {tt(
            "邮件可能要几分钟才到，也可能被归进垃圾邮件。没收到就过一会儿再发一次——目前每小时最多发 2 封。",
          )}
        </p>
        <button
          type="button"
          data-auth-back
          onClick={onBack}
          className="w-full rounded-lg border border-neutral-200 py-2.5 text-[13px] text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50"
        >
          {tt("返回登录")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-auth-form="forgot">
      <div>
        <p className="mb-3 text-[13px] leading-relaxed text-neutral-500">
          {tt("输入你注册时用的邮箱，我们发一条重置链接过去。")}
        </p>
        <label
          className="mb-1.5 block text-[13px] font-medium text-neutral-700"
          htmlFor="oceanleo-auth-reset-email"
        >
          {tt("邮箱")}
        </label>
        <input
          id="oceanleo-auth-reset-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD_CLASS}
          style={FIELD_STYLE}
          placeholder="your@email.com"
        />
      </div>
      {error && <ErrorNote text={error} />}
      <button type="submit" disabled={loading} data-auth-submit className={SUBMIT_CLASS} style={SUBMIT_STYLE}>
        {loading ? <CaptchaBusyLabel tt={tt} /> : tt("发送重置链接")}
      </button>
      <button
        type="button"
        data-auth-back
        onClick={onBack}
        className="w-full text-center text-[12px] text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:text-neutral-800"
      >
        {tt("返回登录")}
      </button>
    </form>
  );
}

/**
 * 密码过了之后的第二屏（aal1 → aal2）。
 *
 * 只在 `needsMfaChallenge()` 为真时挂载。因子取不到时不把人卡在这里干瞪眼——
 * 报错照实说，但按钮保持可点，用户还能重试。
 */
function MfaChallengeForm({ tt, onDone }: { tt: UITranslate; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState("");
  const [loading, setLoading] = useState(false);
  // 存的是原始报错串，不是译好的句子：句子在渲染处才生成。否则 `tt` 得进
  // effect 依赖，用户中途换语言就会重新拉一次因子、把已经输了一半的这一屏冲掉。
  const [errorRaw, setErrorRaw] = useState("");

  useEffect(() => {
    let alive = true;
    listMfaFactors().then(({ factors, error: listError }) => {
      if (!alive) return;
      const verified = factors.find((f) => f.status === "verified");
      if (verified) setFactorId(verified.id);
      else if (listError) setErrorRaw(listError);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorRaw("");
    setLoading(true);
    const result = await challengeAndVerify(factorId, code);
    setLoading(false);
    if (result.error) {
      setErrorRaw(result.error);
      return;
    }
    onDone();
  }

  const error = errorRaw ? tt(totpErrorCopy(errorRaw)) : "";

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-auth-form="mfa">
      <div>
        <p className="text-[14px] font-medium text-neutral-900">{tt("再验一步")}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-500">
          {tt("这个账号开了两步验证。打开验证器 App，输入它现在显示的 6 位码。")}
        </p>
      </div>
      <input
        id="oceanleo-auth-mfa-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
        className={`${FIELD_CLASS} text-center text-[18px] tracking-[0.4em] tabular-nums`}
        style={FIELD_STYLE}
        placeholder={tt("6 位数字")}
      />
      {error && <ErrorNote text={error} />}
      <button type="submit" disabled={loading} data-auth-submit className={SUBMIT_CLASS} style={SUBMIT_STYLE}>
        {loading ? <ButtonSpinner label={tt("处理中...")} /> : tt("验证并登录")}
      </button>
    </form>
  );
}

function PhoneForm({ tt, onDone }: { tt: UITranslate; onDone: CredentialsDone }) {
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
    await onDone();
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
          style={FIELD_STYLE}
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
              style={FIELD_STYLE}
              placeholder={tt("6 位验证码")}
            />
            <button
              type="button"
              data-auth-resend
              onClick={() => void send()}
              disabled={cooldown > 0 || loading}
              className="shrink-0 whitespace-nowrap rounded-lg border border-neutral-200 px-3 text-[13px] text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 disabled:opacity-50"
            >
              {cooldown > 0 ? tt("重新发送（{seconds}s）", { seconds: cooldown }) : tt("重发")}
            </button>
          </div>
        </div>
      )}
      {error && <ErrorNote text={error} />}
      {!error && notice && <Notice text={notice} />}
      <button type="submit" disabled={loading} data-auth-submit className={SUBMIT_CLASS} style={SUBMIT_STYLE}>
        {loading ? (
          <CaptchaBusyLabel tt={tt} />
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
        className="w-full rounded-lg bg-[#07c160] py-2.5 text-[14px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-[#06ad56] active:scale-[0.99] disabled:opacity-60"
      >
        {loading ? <ButtonSpinner label={tt("跳转中...")} /> : tt("微信登录")}
      </button>
    </div>
  );
}

function OauthGlyph({ provider }: { provider: OauthProvider }) {
  if (provider === "google") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    );
  }
  if (provider === "microsoft") {
    return (
      <svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#F25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
        <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
        <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.37 12.23c-.03-3.04 2.48-4.5 2.59-4.57-1.41-2.06-3.61-2.34-4.39-2.37-1.87-.19-3.65 1.1-4.6 1.1-.95 0-2.41-1.07-3.97-1.04-2.04.03-3.92 1.19-4.97 3.01-2.12 3.68-.54 9.13 1.52 12.11 1.01 1.46 2.21 3.1 3.79 3.04 1.52-.06 2.09-.98 3.93-.98 1.84 0 2.36.98 3.97.95 1.64-.03 2.68-1.49 3.68-2.96 1.16-1.69 1.64-3.33 1.67-3.41-.04-.02-3.2-1.23-3.23-4.88zM13.5 3.72c.84-1.02 1.4-2.43 1.25-3.84-1.21.05-2.67.8-3.54 1.82-.78.9-1.46 2.35-1.28 3.74 1.35.1 2.73-.69 3.57-1.72z"
      />
    </svg>
  );
}

function OauthPanel({
  tt,
  provider,
  redirect,
}: {
  tt: UITranslate;
  provider: OauthProvider;
  redirect?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const label = OAUTH_CONTINUE[provider];

  async function go() {
    setError("");
    setLoading(true);
    const r = await startOauthSignIn(provider, wechatRedirectTarget(redirect));
    if (r.url) {
      if (typeof window !== "undefined") window.location.href = r.url;
      return;
    }
    setLoading(false);
    setError(tt(authErrorCopy(provider, r.error)));
  }

  return (
    <div className="space-y-2" data-auth-form={provider}>
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
        className="flex w-full items-center rounded-2xl bg-white py-3.5 pl-4 pr-4 text-[15px] font-medium text-neutral-900 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-50 active:scale-[0.99] disabled:opacity-60"
        style={{ boxShadow: "0 1px 2px rgba(15,15,15,0.06), 0 0 0 1px rgba(15,15,15,0.08)" }}
      >
        {loading ? (
          <ButtonSpinner label={tt("跳转中...")} />
        ) : (
          <>
            <span data-auth-oauth-mark="" className="flex w-8 shrink-0 items-center justify-start">
              <OauthGlyph provider={provider} />
            </span>
            <span className="min-w-0 flex-1 text-center">{tt(label)}</span>
            <span className="w-8 shrink-0" aria-hidden="true" />
          </>
        )}
      </button>
    </div>
  );
}
