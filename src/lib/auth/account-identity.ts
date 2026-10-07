"use client";

import {
  AUTH_STATE_EVENT,
  accessToken,
  browserClient,
  getAuthPhoneUser,
  getUserEmail,
  getUserId,
  maskCnPhone,
  reauthenticate,
  wechatLoginUrl,
  type OauthProvider,
} from "./client";
import { GATEWAY_BASE } from "./config";

/** 微信扫码用户在 GoTrue 里的合成邮箱，账户页 Email 行不准出现。 */
const WECHAT_EMAIL_HOST = "@wechat.oceanleo.com";

const OAUTH_TO_SUPABASE = {
  google: "google",
  apple: "apple",
  microsoft: "azure",
} as const;

export type SessionContactKind = "email" | "phone" | "wechat" | "none";

export interface SessionContact {
  kind: SessionContactKind;
  value: string;
  provider: string;
}

export interface AccountIdentity {
  id: string;
  identityId: string;
  provider: string;
  email: string;
  lastSignInAt: string;
}

export interface AccountProfile {
  userId: string;
  displayName: string;
  avatarUrl: string;
  sessionContact: SessionContact;
  identities: AccountIdentity[];
  deviceLabels: Record<string, string>;
}

export type SignInMethodProvider = OauthProvider | "wechat";

export interface AccountIdentitySource {
  id?: string | null;
  identity_id?: string | null;
  provider?: string | null;
  last_sign_in_at?: string | null;
  identity_data?: Record<string, unknown> | null;
}

export interface AccountUserLike {
  id?: string | null;
  email?: string | null;
  phone?: string | null;
  phone_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
  identities?: AccountIdentitySource[] | null;
}

export type UnlinkIdentityInput =
  | AccountIdentity
  | AccountIdentitySource
  | {
      identityId?: string;
      identity_id?: string;
      id?: string;
    };

const CONFIG_UNAVAILABLE = "登录服务尚未配置";
const SESSION_GONE = "登录状态失效了，请重新登录。";
const NETWORK = "网络错误：无法连接到登录服务";
const KEEP_ONE = "至少保留一种登录方式。";
const BIND_FAILED = "绑定失败，请稍后重试。";
const SAVE_FAILED = "保存失败，请稍后再试。";
const BAD_OTP = "验证码不正确或已过期，请重新获取。";
const RATE_LIMITED = "操作过于频繁，请稍后再试。";
const ENTER_EMAIL = "请先填写邮箱地址。";
const DELETE_FAILED = "现在删不了这个账户，请稍后再试。";

function hasHan(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isWechatSyntheticEmail(email: string): boolean {
  const value = str(email).toLowerCase();
  return value.endsWith(WECHAT_EMAIL_HOST) || value.includes("wechat.oceanleo.com");
}

function metaString(meta: Record<string, unknown> | null | undefined, key: string): string {
  if (!meta) return "";
  return str(meta[key]);
}

function identityEmail(identity: AccountIdentitySource | null | undefined, user: AccountUserLike | null | undefined): string {
  const fromData = str(identity?.identity_data?.email);
  if (fromData) return fromData;
  return str(user?.email);
}

function identityPhone(identity: AccountIdentitySource | null | undefined, user: AccountUserLike | null | undefined): string {
  const fromData = str(identity?.identity_data?.phone);
  if (fromData) return fromData;
  return str(user?.phone);
}

function productProvider(
  identity: AccountIdentitySource | null | undefined,
  user: AccountUserLike | null | undefined,
): string {
  const raw = str(identity?.provider).toLowerCase();
  if (raw === "azure" || raw === "microsoft") return "microsoft";
  if (raw === "google" || raw === "apple" || raw === "phone") return raw;
  const email = identityEmail(identity, user);
  if (isWechatSyntheticEmail(email) || raw === "wechat") return "wechat";
  if (raw === "email" || raw === "email_password") return "email";
  return raw || (email ? "email" : "");
}

function signInAtMs(identity: AccountIdentitySource): number {
  const stamp = str(identity.last_sign_in_at);
  if (!stamp) return 0;
  const ms = Date.parse(stamp);
  return Number.isFinite(ms) ? ms : 0;
}

function latestIdentity(user: AccountUserLike | null | undefined): AccountIdentitySource | null {
  const list = Array.isArray(user?.identities) ? user!.identities! : [];
  if (!list.length) return null;
  let best = list[0];
  let bestMs = signInAtMs(best);
  for (const identity of list.slice(1)) {
    const ms = signInAtMs(identity);
    if (ms >= bestMs) {
      best = identity;
      bestMs = ms;
    }
  }
  return best;
}

function wechatContactValue(user: AccountUserLike | null | undefined): string {
  const meta = user?.user_metadata;
  const name = metaString(meta, "full_name") || metaString(meta, "name");
  if (!name || isWechatSyntheticEmail(name)) return "";
  return name;
}

function noneContact(): SessionContact {
  return { kind: "none", value: "", provider: "" };
}

export function avatarUrlFromUser(user: AccountUserLike | null | undefined): string {
  if (!user) return "";
  const meta = user.user_metadata;
  const custom = metaString(meta, "avatar_url");
  if (custom.startsWith("data:image/") || /^https?:\/\//i.test(custom)) return custom;
  const picture = metaString(meta, "picture");
  if (picture.startsWith("data:image/") || /^https?:\/\//i.test(picture)) return picture;
  return "";
}

export function displayNameFromUser(user: AccountUserLike | null | undefined): string {
  if (!user) return "";
  const full = metaString(user.user_metadata, "full_name");
  if (full) return full;
  const name = metaString(user.user_metadata, "name");
  if (name) return name;
  const email = str(user.email);
  if (email) {
    const prefix = str(email.split("@")[0]);
    if (prefix) return prefix;
  }
  const phone = str(user.phone);
  if (phone) return maskCnPhone(phone);
  return "";
}

export function sessionContactFromUser(user: AccountUserLike | null | undefined): SessionContact {
  if (!user) return noneContact();
  const identity = latestIdentity(user);
  if (identity) {
    const provider = productProvider(identity, user);
    if (provider === "wechat") {
      return { kind: "wechat", value: wechatContactValue(user), provider: "wechat" };
    }
    if (provider === "phone") {
      return {
        kind: "phone",
        value: maskCnPhone(identityPhone(identity, user)),
        provider: "phone",
      };
    }
    const email = identityEmail(identity, user);
    if (isWechatSyntheticEmail(email)) {
      return { kind: "wechat", value: wechatContactValue(user), provider: "wechat" };
    }
    if (email) {
      return { kind: "email", value: email, provider: provider || "email" };
    }
  }
  const email = str(user.email);
  if (email && isWechatSyntheticEmail(email)) {
    return { kind: "wechat", value: wechatContactValue(user), provider: "wechat" };
  }
  if (email) {
    return { kind: "email", value: email, provider: "email" };
  }
  const phone = str(user.phone);
  if (phone) {
    return { kind: "phone", value: maskCnPhone(phone), provider: "phone" };
  }
  return noneContact();
}

export function identitiesFromUser(user: AccountUserLike | null | undefined): AccountIdentity[] {
  const list = Array.isArray(user?.identities) ? user!.identities! : [];
  return list.map((identity, index) => {
    const provider = productProvider(identity, user) || str(identity.provider) || "email";
    const email = identityEmail(identity, user);
    return {
      id: str(identity.id) || str(identity.identity_id) || `identity-${index}`,
      identityId: str(identity.identity_id) || str(identity.id),
      provider,
      email: isWechatSyntheticEmail(email) ? "" : email,
      lastSignInAt: str(identity.last_sign_in_at),
    };
  });
}

function deviceLabelsFromUser(user: AccountUserLike | null | undefined): Record<string, string> {
  const raw = user?.user_metadata?.device_labels;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const label = str(value);
    if (key && label) out[key] = label;
  }
  return out;
}

function profileFromUser(user: AccountUserLike, userId: string): AccountProfile {
  return {
    userId,
    displayName: displayNameFromUser(user),
    avatarUrl: avatarUrlFromUser(user),
    sessionContact: sessionContactFromUser(user),
    identities: identitiesFromUser(user),
    deviceLabels: deviceLabelsFromUser(user),
  };
}

function mapAuthError(raw: unknown, fallback: string): string {
  const text = str(raw);
  if (!text) return fallback;
  if (hasHan(text)) return text;
  if (/identity already (linked|exists|associated)|already linked|already been linked/i.test(text)) {
    return BIND_FAILED;
  }
  if (/manual linking|linking is not enabled|identity linking/i.test(text)) {
    return BIND_FAILED;
  }
  if (/last identity|single identity|cannot unlink|unlinking.*not allowed/i.test(text)) {
    return KEEP_ONE;
  }
  if (
    /token has expired or is invalid/i.test(text) ||
    /invalid[^.]{0,24}(otp|token|code|nonce)/i.test(text) ||
    /otp_expired|expired.*otp/i.test(text)
  ) {
    return BAD_OTP;
  }
  if (/rate\s*limit|too many requests|over_email_send_rate_limit/i.test(text)) {
    return RATE_LIMITED;
  }
  if (/not authenticated|session missing|invalid session|jwt expired|user not found/i.test(text)) {
    return SESSION_GONE;
  }
  if (/invalid e-?mail|email address is invalid|unable to validate email/i.test(text)) {
    return ENTER_EMAIL;
  }
  if (/failed to fetch|networkerror|network request/i.test(text)) {
    return NETWORK;
  }
  return fallback;
}

function announceAuthState(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_STATE_EVENT));
}

async function currentUser(): Promise<{ user: AccountUserLike | null; error?: string }> {
  const client = browserClient();
  if (!client) return { user: null, error: CONFIG_UNAVAILABLE };
  const { data, error } = await client.auth.getUser();
  if (!error && data?.user) return { user: data.user as AccountUserLike };
  const session = await client.auth.getSession();
  const fromSession = session.data?.session?.user as AccountUserLike | undefined;
  if (fromSession) return { user: fromSession };
  return { user: null, error: error?.message ? mapAuthError(error.message, SESSION_GONE) : SESSION_GONE };
}

function metadataRecord(user: AccountUserLike | null): Record<string, unknown> {
  const meta = user?.user_metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  return { ...meta };
}

export async function getAccountProfile(): Promise<{ profile?: AccountProfile; error?: string }> {
  const got = await currentUser();
  if (!got.user) return { error: got.error || SESSION_GONE };
  const userId = str(got.user.id) || (await getUserId()) || "";
  if (!userId) return { error: SESSION_GONE };
  const profile = profileFromUser(got.user, userId);
  if (!str(got.user.phone) && profile.sessionContact.kind === "none") {
    const phoneBox = await getAuthPhoneUser().catch(() => ({ user: null as { phone?: string | null } | null }));
    const phoneUser = phoneBox && "user" in phoneBox ? phoneBox.user : phoneBox;
    const phone = str((phoneUser as { phone?: string | null } | null)?.phone);
    if (phone) {
      return {
        profile: {
          ...profile,
          displayName: profile.displayName || maskCnPhone(phone),
          sessionContact: { kind: "phone", value: maskCnPhone(phone), provider: "phone" },
        },
      };
    }
  }
  return { profile };
}

export async function updateAvatar(url: string): Promise<{ error?: string }> {
  const client = browserClient();
  if (!client) return { error: CONFIG_UNAVAILABLE };
  const got = await currentUser();
  if (!got.user) return { error: got.error || SESSION_GONE };
  const next = String(url ?? "").trim();
  if (!next.startsWith("data:image/") && !/^https?:\/\//i.test(next)) {
    return { error: "请选择图片文件（JPG / PNG）。" };
  }
  const { error } = await client.auth.updateUser({
    data: {
      ...metadataRecord(got.user),
      avatar_url: next,
    },
  });
  if (error) return { error: mapAuthError(error.message, SAVE_FAILED) };
  announceAuthState();
  return {};
}

export async function updateDisplayName(name: string): Promise<{ error?: string }> {
  const client = browserClient();
  if (!client) return { error: CONFIG_UNAVAILABLE };
  const got = await currentUser();
  if (!got.user) return { error: got.error || SESSION_GONE };
  const next = String(name ?? "").trim();
  const { error } = await client.auth.updateUser({
    data: {
      ...metadataRecord(got.user),
      full_name: next,
      name: next,
    },
  });
  if (error) return { error: mapAuthError(error.message, SAVE_FAILED) };
  announceAuthState();
  return {};
}

export async function updateDeviceLabel(
  sessionId: string,
  label: string,
): Promise<{ error?: string }> {
  const id = str(sessionId);
  if (!id) return { error: SAVE_FAILED };
  const client = browserClient();
  if (!client) return { error: CONFIG_UNAVAILABLE };
  const got = await currentUser();
  if (!got.user) return { error: got.error || SESSION_GONE };
  const labels = deviceLabelsFromUser(got.user);
  const nextLabel = String(label ?? "").trim();
  if (nextLabel) labels[id] = nextLabel;
  else delete labels[id];
  const { error } = await client.auth.updateUser({
    data: {
      ...metadataRecord(got.user),
      device_labels: labels,
    },
  });
  if (error) return { error: mapAuthError(error.message, SAVE_FAILED) };
  announceAuthState();
  return {};
}

export async function requestEmailChange(): Promise<{ error?: string }> {
  const result = await reauthenticate();
  if (result.error) return { error: mapAuthError(result.error, SAVE_FAILED) };
  return {};
}

export async function verifyEmailChange(code: string): Promise<{ error?: string }> {
  const token = String(code ?? "").trim();
  if (!/^\d{6}$/.test(token)) return { error: BAD_OTP };
  const email = await getUserEmail();
  if (!email) return { error: SESSION_GONE };
  return {};
}

export async function completeEmailChange(
  newEmail: string,
  nonce?: string,
): Promise<{ error?: string }> {
  const email = str(newEmail);
  if (!email) return { error: ENTER_EMAIL };
  const client = browserClient();
  if (!client) return { error: CONFIG_UNAVAILABLE };
  const payload: { email: string; nonce?: string } = { email };
  const token = str(nonce);
  if (token) payload.nonce = token;
  const { error } = await client.auth.updateUser(payload);
  if (error) return { error: mapAuthError(error.message, SAVE_FAILED) };
  announceAuthState();
  return {};
}

function asOauthProvider(provider: string): OauthProvider | null {
  if (provider === "google" || provider === "apple" || provider === "microsoft") return provider;
  if (provider === "azure") return "microsoft";
  return null;
}

export async function linkSignInMethod(
  provider: SignInMethodProvider | string,
): Promise<{ url?: string; error?: string }> {
  const key = str(provider).toLowerCase();
  if (key === "wechat") {
    const result = await wechatLoginUrl();
    if (result.error) return { error: mapAuthError(result.error, BIND_FAILED) };
    if (result.url) return { url: result.url };
    return { error: BIND_FAILED };
  }
  const oauth = asOauthProvider(key);
  if (!oauth) return { error: BIND_FAILED };
  const client = browserClient();
  if (!client) return { error: CONFIG_UNAVAILABLE };
  const redirectTo =
    typeof window !== "undefined" ? String(window.location.href || "").trim() : "";
  try {
    const { data, error } = await client.auth.linkIdentity({
      provider: OAUTH_TO_SUPABASE[oauth],
      options: {
        redirectTo: redirectTo || undefined,
        skipBrowserRedirect: true,
        ...(oauth === "microsoft" ? { scopes: "email profile offline_access" } : {}),
      },
    });
    if (error) return { error: mapAuthError(error.message, BIND_FAILED) };
    if (data?.url) return { url: data.url };
    return { error: BIND_FAILED };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    return { error: mapAuthError(message, NETWORK) };
  }
}

function identityKey(input: UnlinkIdentityInput | null | undefined): string {
  if (!input) return "";
  const rec = input as AccountIdentity & AccountIdentitySource;
  return str(rec.identityId) || str(rec.identity_id) || str(rec.id);
}

export async function unlinkSignInMethod(
  identity: UnlinkIdentityInput,
): Promise<{ error?: string }> {
  const client = browserClient();
  if (!client) return { error: CONFIG_UNAVAILABLE };
  const got = await currentUser();
  if (!got.user) return { error: got.error || SESSION_GONE };
  const list = Array.isArray(got.user.identities) ? got.user.identities : [];
  if (list.length <= 1) return { error: KEEP_ONE };
  const wanted = identityKey(identity);
  const found = list.find((item) => {
    const key = str(item.identity_id) || str(item.id);
    return wanted && key === wanted;
  });
  if (!found || !str(found.identity_id || found.id)) return { error: BIND_FAILED };
  try {
    const { error } = await client.auth.unlinkIdentity({
      id: str(found.id) || str(found.identity_id),
      identity_id: str(found.identity_id) || str(found.id),
      user_id: str(got.user.id),
      provider: str(found.provider),
      identity_data: found.identity_data ?? {},
      last_sign_in_at: found.last_sign_in_at ?? undefined,
    });
    if (error) return { error: mapAuthError(error.message, BIND_FAILED) };
    announceAuthState();
    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    return { error: mapAuthError(message, BIND_FAILED) };
  }
}

/** 注销当前登录用户。成功后会话应立刻退出。失败不甩 GoTrue 英文。 */
export async function deleteOceanLeoAccount(): Promise<{ error?: string }> {
  const token = await accessToken();
  if (!token) return { error: SESSION_GONE };
  try {
    const res = await fetch(`${GATEWAY_BASE}/v1/account/delete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return { error: DELETE_FAILED };
    return {};
  } catch {
    return { error: NETWORK };
  }
}
