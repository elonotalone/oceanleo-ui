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

let _client: SupabaseClient | null = null;

export function browserClient(): SupabaseClient | null {
  if (!configured()) return null;
  if (_client) return _client;
  const host = typeof window !== "undefined" ? window.location.host : "";
  _client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: cookieOptions(host),
  });
  return _client;
}

export { configured as oceanleoConfigured };

export async function accessToken(): Promise<string | null> {
  const c = browserClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.access_token ?? null;
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

export async function signOutEverywhere(): Promise<void> {
  const c = browserClient();
  // `global` scope revokes the refresh token server-side; the shared cookie is
  // cleared with the same cookieOptions used to set it, so all *.oceanleo.com
  // sites see the logout.
  await c?.auth.signOut({ scope: "global" });
}
