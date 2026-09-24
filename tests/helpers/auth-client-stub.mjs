// AppShell / LeoComposer 编译图会走进 AuthDialog、AccountSecurityPage、
// PhoneBindGate、account.ts。auth/client 桩必须带上产品真实在用的具名出口，
// 缺一个就会在加载期（或测试结束后的异步 import）把整份文件打死。

import { dataModule } from "./module-bench.mjs";

export const AUTH_CLIENT_STUB_SOURCE = `
export const AUTH_STATE_EVENT = "oceanleo:auth-state";
export const PHONE_REQUIRED_EVENT = "oceanleo:phone-required";
export const PASSWORD_RESET_PATH = "/account?reset=1";

export function oceanleoConfigured() { return false; }
export function browserClient() { return null; }
export function cachedAccessToken() { return null; }
export async function accessToken() { return null; }
export async function isSignedIn() { return false; }
export async function getUserId() { return null; }
export async function getUserEmail() { return null; }

export function announcePhoneRequired() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PHONE_REQUIRED_EVENT));
}

export function normalizeCnPhone(raw) {
  const s = String(raw || "").replace(/[\\s\\-()]/g, "");
  if (!s) return "";
  let digits = s.startsWith("+") ? s.slice(1) : s;
  if (digits.startsWith("0086")) digits = digits.slice(4);
  else if (digits.startsWith("86") && digits.length === 13) digits = digits.slice(2);
  return /^1[3-9]\\d{9}$/.test(digits) ? "+86" + digits : "";
}

export function cnPhoneIsBound(user) {
  if (!user) return false;
  return Boolean(String(user.phone || "").trim() && String(user.phone_confirmed_at || "").trim());
}

export function maskCnPhone(phone) {
  const normalized = normalizeCnPhone(phone);
  const digits = (normalized || String(phone || "").replace(/[\\s\\-()]/g, "")).replace(/^\\+86/, "");
  if (digits.length < 7) return "****";
  return digits.slice(0, 3) + "****" + digits.slice(-4);
}

export async function getAuthPhoneUser() { return null; }
export async function requestPhoneChange() { return { error: "登录服务尚未配置" }; }
export async function verifyPhoneChange() { return { error: "登录服务尚未配置" }; }
export async function sendPhoneOtp() { return { error: "登录服务尚未配置" }; }
export async function verifyPhoneOtp() { return { error: "登录服务尚未配置" }; }
export async function signIn() { return { error: "登录服务尚未配置" }; }
export async function wechatLoginUrl() { return { error: "登录服务尚未配置" }; }
export async function startOauthSignIn() { return { error: "登录服务尚未配置" }; }
export async function sendPasswordReset() { return { error: "登录服务尚未配置" }; }
export async function reauthenticate() { return { error: "登录服务尚未配置" }; }
export async function updatePassword() { return { error: "登录服务尚未配置" }; }
export async function listMfaFactors() { return { factors: [] }; }
export async function enrollTotp() { return { error: "登录服务尚未配置" }; }
export async function challengeAndVerify() { return { error: "登录服务尚未配置" }; }
export async function unenrollFactor() { return { error: "登录服务尚未配置" }; }
export async function currentAal() { return { current: null, next: null }; }
export function needsMfaChallenge(aal) {
  if (!aal || !aal.current || !aal.next) return false;
  return aal.current === "aal1" && aal.next === "aal2";
}
export function isPasswordResetLanding(href) {
  return /[?&]reset=1(?:[#&]|$)/.test(String(href || "").trim());
}
export function passwordResetRedirectTo(origin) {
  const base = String(origin ?? (typeof window !== "undefined" ? window.location.origin : "")).trim();
  if (!base) return "";
  return base.replace(/\\/+$/, "") + PASSWORD_RESET_PATH;
}
export async function signOutEverywhere() {}
`;

export const authClientStubUrl = dataModule(AUTH_CLIENT_STUB_SOURCE);
