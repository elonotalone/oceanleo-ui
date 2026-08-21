"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  GATEWAY_BASE,
  cookieOptions,
  configured,
} from "./config";

// Browser Supabase client for the OceanLeo shared identity. Stores the auth
// session in a cookie scoped to .oceanleo.com (NOT localStorage), so a login on
// ANY *.oceanleo.com subdomain is instantly recognized on every other one.
//
// 这个客户端就是 cookie 不能是 HttpOnly 的原因：它通过 document.cookie 读写
// session。会话对同域 JS 可读是既定设计的代价，域边界是唯一的保护。
// 见 config.ts 顶部的 SESSION MODEL。

let _client: SupabaseClient | null = null;
let _accessToken: string | null = null;

export function browserClient(): SupabaseClient | null {
  if (!configured()) return null;
  if (_client) return _client;
  const host = typeof window !== "undefined" ? window.location.host : "";
  _client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: cookieOptions(host),
  });
  _client.auth.onAuthStateChange((_event, session) => {
    _accessToken = session?.access_token ?? null;
  });
  return _client;
}

export { configured as oceanleoConfigured };

export async function accessToken(): Promise<string | null> {
  const c = browserClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  _accessToken = data.session?.access_token ?? null;
  return _accessToken;
}

/** pagehide keepalive 必须尽量在事件回调内同步发起 fetch；仅返回内存中的最近有效 token。 */
export function cachedAccessToken(): string | null {
  return _accessToken;
}

export async function isSignedIn(): Promise<boolean> {
  return Boolean(await accessToken());
}

export async function getUserEmail(): Promise<string | null> {
  const c = browserClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.user?.email ?? null;
}

export async function getUserId(): Promise<string | null> {
  const c = browserClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.user?.id ?? null;
}

export async function signIn(email: string, password: string) {
  const c = browserClient();
  if (!c) return { error: "Supabase not configured" };
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  _accessToken = data.session?.access_token ?? null;
  return { data, error: error?.message };
}

// --- 中国手机号登录（短信验证码 OTP）-----------------------------------------
// 需要 Supabase Auth 配好 SMS provider（阿里云短信 / 腾讯云短信，操作员后配 key）。
// provider 未配时 Supabase 返回错误，调用方据此给「短信登录暂未开放」降级提示。

/** 把中国手机号统一成 E.164（+86…）。返回 "" 表示格式无效。 */
export function normalizeCnPhone(raw: string): string {
  const s = (raw || "").replace(/[\s\-()]/g, "");
  if (!s) return "";
  let digits = s;
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("0086")) digits = digits.slice(4);
  else if (digits.startsWith("86") && digits.length === 13) digits = digits.slice(2);
  return /^1[3-9]\d{9}$/.test(digits) ? `+86${digits}` : "";
}

/** 发送手机验证码。被邀请的新手机号也能注册（DB 触发器放行被邀请联系方式）。 */
export async function sendPhoneOtp(phone: string) {
  const c = browserClient();
  if (!c) return { error: "Supabase not configured" };
  const e164 = normalizeCnPhone(phone);
  if (!e164) return { error: "请输入有效的中国大陆手机号" };
  const { error } = await c.auth.signInWithOtp({ phone: e164 });
  return { error: error?.message };
}

/** 校验手机验证码并登录。 */
export async function verifyPhoneOtp(phone: string, token: string) {
  const c = browserClient();
  if (!c) return { error: "Supabase not configured" };
  const e164 = normalizeCnPhone(phone);
  if (!e164) return { error: "请输入有效的中国大陆手机号" };
  const { data, error } = await c.auth.verifyOtp({
    phone: e164,
    token: (token || "").trim(),
    type: "sms",
  });
  _accessToken = data.session?.access_token ?? null;
  return { data, error: error?.message };
}

// --- 微信登录（扫码）---------------------------------------------------------
// Supabase 无内置微信 provider，走我们网关自建 OAuth：
//   GET  {GATEWAY}/v1/auth/wechat/qrconnect  → { url } 微信带参二维码登录页
//   回调 {GATEWAY}/v1/auth/wechat/callback   → 换/建 Supabase 用户并下发 session
// 依赖微信开放平台 appid/secret（操作员后配）。未配时网关返回 501，调用方降级。

/** 取微信扫码登录跳转 URL。把当前页作为登录成功后的回跳地址。 */
export async function wechatLoginUrl(redirect?: string): Promise<{ url?: string; error?: string }> {
  const back = redirect || (typeof window !== "undefined" ? window.location.href : "");
  try {
    const res = await fetch(
      `${GATEWAY_BASE}/v1/auth/wechat/qrconnect?redirect=${encodeURIComponent(back)}`,
      { cache: "no-store" },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) return { error: (data as { detail?: string })?.detail || "微信登录暂未开放" };
    return { url: (data as { url?: string })?.url };
  } catch {
    return { error: "网络错误：无法连接到登录服务" };
  }
}

// --- 找回密码 / 改密码 ---------------------------------------------------------
// 2026-08-21 之前这个仓里一条都没有：忘了密码的用户永久进不来，被盗号的用户
// 没有任何自救手段。下面三个封装是「自救」的全部实现，仍然只调 Supabase 已有能力。
//
// 平台侧的真实限制（实测，界面必须如实表达而不是假装能用）：
//   - **没有配 SMTP**，`rate_limit_email_sent` = 2 封/小时。所以「已发送」这种
//     说法是骗人的，调用方必须给出「可能要几分钟；没收到就稍后再试一次」。
//   - W3 会打开「改密码需要重新验证身份」。所以 updatePassword 一定要能带
//     nonce / 旧密码走完整流程，而不是裸调 updateUser。

/** 用户点了邮件里的链接之后落在哪一页。各站路由一致，跟 AccountPage 同级。 */
export const PASSWORD_RESET_PATH = "/account/reset-password";

/**
 * 邮件里那条链接的落点。显式传 `origin` 只为可测；浏览器里取当前站点，
 * 于是「在哪个子站点的忘记密码，就回哪个子站」——与微信回跳同一条原则。
 * 拿不到 origin 时返回空串，由 Supabase 用它自己配置的 Site URL 兜底。
 */
export function passwordResetRedirectTo(origin?: string): string {
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : "")).trim();
  if (!base) return "";
  return `${base.replace(/\/+$/, "")}${PASSWORD_RESET_PATH}`;
}

/** 发找回密码邮件。成功不代表已送达——发信配额是每小时 2 封，文案要说实话。 */
export async function sendPasswordReset(
  email: string,
  origin?: string,
): Promise<{ error?: string }> {
  const c = browserClient();
  if (!c) return { error: "Supabase not configured" };
  const target = (email || "").trim();
  if (!target) return { error: "请输入邮箱地址。" };
  const redirectTo = passwordResetRedirectTo(origin);
  const { error } = await c.auth.resetPasswordForEmail(
    target,
    redirectTo ? { redirectTo } : undefined,
  );
  return { error: error?.message };
}

/**
 * 重新验证身份：让 Supabase 往当前账号的邮箱发一个一次性 nonce。
 * 这是「改密码之前先证明你是你」那一步的服务端腿；W3 把平台开关打开之后，
 * 不带 nonce 的 updateUser 会被上游直接拒。
 */
export async function reauthenticate(): Promise<{ error?: string }> {
  const c = browserClient();
  if (!c) return { error: "Supabase not configured" };
  const { error } = await c.auth.reauthenticate();
  return { error: error?.message };
}

export interface UpdatePasswordOptions {
  /** `reauthenticate()` 发到邮箱的一次性码。 */
  nonce?: string;
  /**
   * 旧密码。给了就先用它做一次真实的登录校验——「改密码要旧密码」这条在平台
   * 开关打开之前也能成立，而且失败时给的是「原密码不正确」而不是一句含糊的拒绝。
   */
  currentPassword?: string;
}

/** 改密码。两道验证（旧密码 / 邮箱 nonce）都是可选参数，调用方按当前流程给。 */
export async function updatePassword(
  newPassword: string,
  options: UpdatePasswordOptions = {},
): Promise<{ error?: string }> {
  const c = browserClient();
  if (!c) return { error: "Supabase not configured" };
  const next = newPassword || "";
  if (next.length < 6) return { error: "密码至少 6 位。" };
  if (options.currentPassword) {
    const email = await getUserEmail();
    if (!email) return { error: "登录状态已失效，请重新登录后再改密码。" };
    const check = await c.auth.signInWithPassword({
      email,
      password: options.currentPassword,
    });
    if (check.error) return { error: "原密码不正确。" };
  }
  const { error } = await c.auth.updateUser({
    password: next,
    ...(options.nonce ? { nonce: options.nonce } : {}),
  });
  return { error: error?.message };
}

// --- 两步验证（TOTP）-----------------------------------------------------------
// 平台侧实测 `mfa_totp_enroll_enabled=true` / `mfa_totp_verify_enabled=true`，
// 能力早就在，缺的一直是产品接线。下面五个封装就是那根线，不新写任何身份逻辑。

export interface MfaFactor {
  id: string;
  /** 用户自己起的名字（「我的手机」）。上游可能不回，调用方要能显示兜底名。 */
  friendlyName?: string;
  /** `verified` 才是真正生效的因子；`unverified` 是注册到一半的残留。 */
  status: "verified" | "unverified";
  createdAt?: string;
}

/** 已登记的 TOTP 因子。取不到时回空数组而不是抛——账号页不许因此白屏。 */
export async function listMfaFactors(): Promise<{ factors: MfaFactor[]; error?: string }> {
  const c = browserClient();
  if (!c) return { factors: [], error: "Supabase not configured" };
  const { data, error } = await c.auth.mfa.listFactors();
  if (error) return { factors: [], error: error.message };
  const raw = [...(data?.totp || []), ...(data?.all || [])];
  const seen = new Set<string>();
  const factors: MfaFactor[] = [];
  for (const f of raw) {
    const id = String((f as { id?: string })?.id || "");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const status = (f as { status?: string }).status === "verified" ? "verified" : "unverified";
    factors.push({
      id,
      friendlyName: (f as { friendly_name?: string }).friendly_name || undefined,
      status,
      createdAt: (f as { created_at?: string }).created_at || undefined,
    });
  }
  return { factors };
}

export interface TotpEnrollment {
  factorId: string;
  /** data: URI 的二维码，直接进 <img src>。 */
  qrCode: string;
  /** **可手抄的明文串**。没有相机、二维码扫不出来的人全靠它。 */
  secret: string;
  /** otpauth:// URI，给能直接粘链接的验证器。 */
  uri: string;
}

/** 开始登记一个新的 TOTP 因子。拿到 secret 之后必须再验一次才算生效。 */
export async function enrollTotp(
  friendlyName?: string,
): Promise<{ enrollment?: TotpEnrollment; error?: string }> {
  const c = browserClient();
  if (!c) return { error: "Supabase not configured" };
  const name = (friendlyName || "").trim();
  const { data, error } = await c.auth.mfa.enroll({
    factorType: "totp",
    ...(name ? { friendlyName: name } : {}),
  });
  if (error) return { error: error.message };
  const totp = (data as { totp?: { qr_code?: string; secret?: string; uri?: string } })?.totp;
  const factorId = String((data as { id?: string })?.id || "");
  if (!factorId || !totp?.secret) return { error: "两步验证暂时开通不了，请稍后重试。" };
  return {
    enrollment: {
      factorId,
      qrCode: totp.qr_code || "",
      secret: totp.secret,
      uri: totp.uri || "",
    },
  };
}

/** 用 6 位码验证一个因子（开通时验它、登录时也验它）。 */
export async function challengeAndVerify(
  factorId: string,
  code: string,
): Promise<{ error?: string }> {
  const c = browserClient();
  if (!c) return { error: "Supabase not configured" };
  const digits = (code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return { error: "请输入验证器上的 6 位数字。" };
  const { error } = await c.auth.mfa.challengeAndVerify({ factorId, code: digits });
  if (error) return { error: error.message };
  // 通过之后会话升到 aal2，access token 换了新的，缓存那份必须跟上。
  await accessToken();
  return {};
}

/** 移除一个因子。调用方必须先让用户验一次身份，别让拿到会话的人一键关掉 2FA。 */
export async function unenrollFactor(factorId: string): Promise<{ error?: string }> {
  const c = browserClient();
  if (!c) return { error: "Supabase not configured" };
  const { error } = await c.auth.mfa.unenroll({ factorId });
  return { error: error?.message };
}

export interface AalState {
  /** 这条会话现在的等级。 */
  current: "aal1" | "aal2" | null;
  /** 这个账号**应该**达到的等级。有已验证因子时是 aal2。 */
  next: "aal1" | "aal2" | null;
}

/** 当前会话的验证等级。取不到时两边都是 null —— 调用方据此保持现状，不许瞎猜。 */
export async function currentAal(): Promise<AalState> {
  const c = browserClient();
  if (!c) return { current: null, next: null };
  const { data, error } = await c.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return { current: null, next: null };
  const level = (v: unknown) => (v === "aal1" || v === "aal2" ? v : null);
  return { current: level(data.currentLevel), next: level(data.nextLevel) };
}

/**
 * 密码通过之后还差不差一屏 6 位码。
 *
 * 判据是 `current !== next` 而**不是**「有没有因子」：注册到一半的
 * unverified 因子不该把人拦在门外，而 aal2 已经拿到的会话不该再问一遍。
 * 取不到等级（未配 Supabase / 网络抖动）一律返回 false —— 这一屏做错的代价是
 * 把开了 2FA 的人锁在外面，所以宁可不拦也不能凭猜拦。
 */
export function needsMfaChallenge(aal: AalState): boolean {
  if (!aal.current || !aal.next) return false;
  return aal.current === "aal1" && aal.next === "aal2";
}

export async function signOutEverywhere(): Promise<void> {
  const c = browserClient();
  if (!c) {
    _accessToken = null;
    return;
  }
  // `global` scope revokes the refresh token server-side; the shared cookie is
  // cleared with the same cookieOptions used to set it, so all *.oceanleo.com
  // sites see the logout.
  const { error } = await c.auth.signOut({ scope: "global" });
  if (error) {
    // 上游 _signOut 在吊销请求失败时（网络/网关抖动，非 401/403/404）直接返回
    // 错误，**不会**清本地 session —— 用户点了退出，cookie 却还在，31 个站仍是
    // 登录态。这里兜底做一次本地登出，至少把这台设备上的会话清掉。
    // 注意：服务端 refresh token 此时仍然有效（见 residual risk）。
    await c.auth.signOut({ scope: "local" }).catch(() => {});
  }
  _accessToken = null;
}
