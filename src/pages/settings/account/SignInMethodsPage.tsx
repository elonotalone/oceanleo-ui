"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { currentDomainFamily, type DomainFamily } from "../../../contracts/domain-family";
import { useUI, type UITranslate } from "../../../i18n/ui/useUI";
import {
  getAccountProfile,
  linkSignInMethod,
  unlinkSignInMethod,
} from "../../../lib/auth/account-identity";
import {
  AUTH_STATE_EVENT,
  cnPhoneIsBound,
  getAuthPhoneUser,
  maskCnPhone,
  wechatLoginUrl,
  type AuthPhoneUser,
} from "../../../lib/auth/client";
import { ConfirmDialog } from "../../../ui";
import {
  AUTH_METHODS_CN,
  authMethodsForFamily,
  type AuthMethod,
} from "../../AuthDialog";
import { PhoneBindForm } from "../../PhoneBindGate";
import { SignInMethodIcon, type SignInMethodId } from "./sign-in-method-icons";

/** 合同：国外三行 Google / Microsoft / Apple，不含邮箱。 */
const INTL_METHODS: readonly AuthMethod[] = ["google", "microsoft", "apple"];

const WECHAT_SYNTHETIC = /@wechat\.oceanleo\.com$/i;

const MARK_WRAP =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-neutral-800";
const MARK_SHADOW =
  "0 1px 2px rgba(15,15,15,0.06), 0 0 0 1px rgba(15,15,15,0.08)";
const PILL =
  "shrink-0 rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-[13px] font-medium text-neutral-800 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 active:scale-[0.99] active:duration-[var(--leo-dur-1)] disabled:cursor-not-allowed disabled:opacity-50";

export type LinkedIdentity = {
  id?: string;
  identityId?: string;
  identity_id?: string;
  provider: string;
  email?: string;
  identity_data?: Record<string, unknown> | null;
};

type SessionContact = {
  kind: "email" | "phone" | "wechat" | "none";
  value: string;
  provider: string;
};

export type SignInMethodsProfile = {
  userId: string;
  displayName: string;
  sessionContact: SessionContact;
  identities: LinkedIdentity[];
};

export type SignInMethodsPageProps = {
  family?: DomainFamily;
};

export function isSyntheticWechatEmail(email: string | null | undefined): boolean {
  return WECHAT_SYNTHETIC.test(String(email || "").trim());
}

export function signInMethodsForFamily(
  family: DomainFamily | undefined,
): readonly AuthMethod[] {
  if (family === "cn") {
    const listed = authMethodsForFamily("cn");
    return listed.length ? listed : AUTH_METHODS_CN;
  }
  return INTL_METHODS;
}

function providerAliases(method: AuthMethod): string[] {
  if (method === "microsoft") return ["microsoft", "azure"];
  if (method === "wechat") return ["wechat", "weixin"];
  return [method];
}

export function identityEmail(identity: LinkedIdentity | null | undefined): string {
  const direct = String(identity?.email || "").trim();
  if (direct) return direct;
  const data = identity?.identity_data;
  if (!data || typeof data !== "object") return "";
  return String(data.email || "").trim();
}

export function countBoundLoginMethods(
  profile: SignInMethodsProfile | null | undefined,
  phoneUser: AuthPhoneUser | null | undefined,
): number {
  const providers = new Set<string>();
  for (const identity of profile?.identities || []) {
    const provider = String(identity?.provider || "").toLowerCase();
    if (!provider) continue;
    if (provider === "azure") providers.add("microsoft");
    else if (provider === "weixin") providers.add("wechat");
    else if (isSyntheticWechatEmail(identityEmail(identity))) providers.add("wechat");
    else providers.add(provider);
  }
  if (cnPhoneIsBound(phoneUser)) providers.add("phone");
  if (profile?.sessionContact.kind === "wechat") providers.add("wechat");
  return providers.size;
}

export function findIdentity(
  identities: readonly LinkedIdentity[] | null | undefined,
  method: AuthMethod,
): LinkedIdentity | null {
  const list = Array.isArray(identities) ? identities : [];
  for (const identity of list) {
    const email = identityEmail(identity);
    if (method !== "wechat" && isSyntheticWechatEmail(email)) continue;
    const provider = String(identity?.provider || "").toLowerCase();
    if (providerAliases(method).includes(provider)) return identity;
    if (method === "wechat" && isSyntheticWechatEmail(email)) {
      return identity;
    }
  }
  return null;
}

function asProfile(value: unknown): SignInMethodsProfile | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const boxed =
    rec.profile && typeof rec.profile === "object"
      ? (rec.profile as Record<string, unknown>)
      : rec;
  if (typeof rec.error === "string" && rec.error && !boxed.identities && !boxed.userId) {
    return null;
  }
  const contact = boxed.sessionContact as SessionContact | undefined;
  const rawIdentities = Array.isArray(boxed.identities)
    ? (boxed.identities as LinkedIdentity[])
    : [];
  return {
    userId: String(boxed.userId || ""),
    displayName: String(boxed.displayName || ""),
    sessionContact: {
      kind: contact?.kind || "none",
      value: String(contact?.value || ""),
      provider: String(contact?.provider || ""),
    },
    identities: rawIdentities,
  };
}

function methodLabel(tt: UITranslate, method: AuthMethod): string {
  if (method === "google") return "Google";
  if (method === "microsoft") return "Microsoft";
  if (method === "apple") return "Apple";
  if (method === "email") return tt("邮箱登录");
  if (method === "phone") return tt("手机号");
  return tt("微信");
}

function goTo(url: string) {
  if (typeof window === "undefined") return;
  try {
    window.location.assign(url);
  } catch {
    // jsdom cannot leave the page; a real browser has already started navigation.
  }
}

function phoneDigits(user: AuthPhoneUser | null | undefined): string {
  return String(user?.phone || "").trim();
}

export function SignInMethodsPage({ family }: SignInMethodsPageProps = {}) {
  const tt = useUI();
  const resolvedFamily = family ?? currentDomainFamily();
  const methods = useMemo(
    () => signInMethodsForFamily(resolvedFamily),
    [resolvedFamily],
  );

  const [profile, setProfile] = useState<SignInMethodsProfile | null>(null);
  const [phoneUser, setPhoneUser] = useState<AuthPhoneUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busyMethod, setBusyMethod] = useState<AuthMethod | null>(null);
  const [phoneBindOpen, setPhoneBindOpen] = useState(false);
  const [pendingUnlink, setPendingUnlink] = useState<AuthMethod | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const [nextProfile, phone] = await Promise.all([
      getAccountProfile(),
      getAuthPhoneUser(),
    ]);
    const parsed = asProfile(nextProfile);
    setProfile(parsed);
    if (
      !parsed &&
      nextProfile &&
      typeof nextProfile === "object" &&
      "error" in nextProfile &&
      typeof (nextProfile as { error?: unknown }).error === "string"
    ) {
      setError(String((nextProfile as { error: string }).error));
    }
    const user =
      phone && typeof phone === "object" && "user" in phone
        ? (phone as { user: AuthPhoneUser | null }).user
        : null;
    setPhoneUser(user);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    function onAuth() {
      void reload();
    }
    if (typeof window === "undefined") return;
    window.addEventListener(AUTH_STATE_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_STATE_EVENT, onAuth);
  }, [reload]);

  function boundFor(method: AuthMethod): boolean {
    if (findIdentity(profile?.identities, method)) return true;
    if (method === "phone" && cnPhoneIsBound(phoneUser)) return true;
    if (method === "wechat" && profile?.sessionContact.kind === "wechat") return true;
    if (method === "email") {
      const session = profile?.sessionContact;
      if (session?.kind === "email" && session.value && !isSyntheticWechatEmail(session.value)) {
        return true;
      }
    }
    return false;
  }

  function subtitleFor(method: AuthMethod): string {
    if (method === "wechat") return "";
    if (method === "phone") {
      const masked = maskCnPhone(phoneDigits(phoneUser));
      if (cnPhoneIsBound(phoneUser) && masked && masked !== "****") return masked;
      const fromIdentity = identityEmail(findIdentity(profile?.identities, "phone"));
      return fromIdentity && !isSyntheticWechatEmail(fromIdentity) ? fromIdentity : "";
    }
    const identity = findIdentity(profile?.identities, method);
    const fromIdentity = identityEmail(identity);
    if (fromIdentity && !isSyntheticWechatEmail(fromIdentity)) return fromIdentity;
    if (method === "email") {
      const session = profile?.sessionContact;
      if (session?.kind === "email" && session.value && !isSyntheticWechatEmail(session.value)) {
        return session.value;
      }
    }
    return "";
  }

  const boundCount = countBoundLoginMethods(profile, phoneUser);

  async function connect(method: AuthMethod) {
    setError("");
    setNotice("");
    if (method === "email") return;
    if (method === "phone") {
      setPhoneBindOpen(true);
      return;
    }
    setBusyMethod(method);
    if (method === "wechat") {
      const result = await wechatLoginUrl();
      if (result.url) {
        goTo(result.url);
        return;
      }
      setBusyMethod(null);
      setError(result.error || "绑定失败，请稍后重试。");
      return;
    }
    const result = await linkSignInMethod(method);
    if (result?.url) {
      goTo(result.url);
      return;
    }
    setBusyMethod(null);
    setError(result?.error || "绑定失败，请稍后重试。");
  }

  async function confirmUnlink() {
    const method = pendingUnlink;
    setPendingUnlink(null);
    if (!method) return;
    if (boundCount <= 1) {
      setError("至少保留一种登录方式。");
      return;
    }
    setError("");
    setNotice("");
    setBusyMethod(method);
    const identity =
      findIdentity(profile?.identities, method) || ({ provider: method } as LinkedIdentity);
    const result = await unlinkSignInMethod(identity);
    setBusyMethod(null);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setNotice("已断开。");
    await reload();
  }

  function unlinkButton(method: AuthMethod) {
    const last = boundCount <= 1;
    return (
      <button
        type="button"
        data-sign-in-disconnect={method}
        className={PILL}
        disabled={busyMethod === method}
        aria-disabled={last ? "true" : undefined}
        title={last ? tt("至少保留一种登录方式。") : undefined}
        onClick={() => {
          if (last) {
            setError("至少保留一种登录方式。");
            return;
          }
          setPendingUnlink(method);
        }}
      >
        {tt("断开")}
      </button>
    );
  }

  function connectButton(method: AuthMethod) {
    if (method === "email") return null;
    return (
      <button
        type="button"
        data-sign-in-connect={method}
        className={PILL}
        disabled={busyMethod === method}
        onClick={() => void connect(method)}
      >
        {tt("连接")}
      </button>
    );
  }

  return (
    <div
      data-sign-in-methods=""
      data-sign-in-family={resolvedFamily}
      aria-label={tt("管理登录方式")}
    >
      {!loaded && (
        <p className="px-0 py-4 text-[13px] text-neutral-500">{tt("加载中…")}</p>
      )}
      {loaded && (
        <div className="divide-y divide-neutral-200">
          {methods.map((method) => {
            const bound = boundFor(method);
            const subtitle = subtitleFor(method);
            return (
              <div key={method} data-sign-in-method={method}>
                <div className="flex items-center justify-between gap-3 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={MARK_WRAP} style={{ boxShadow: MARK_SHADOW }}>
                      <SignInMethodIcon method={method as SignInMethodId} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[14px] font-medium text-neutral-900">
                        {methodLabel(tt, method)}
                      </div>
                      {subtitle ? (
                        <div
                          className="truncate text-[13px] text-neutral-400"
                          data-sign-in-email={method}
                        >
                          {subtitle}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {method === "email"
                    ? null
                    : bound
                      ? unlinkButton(method)
                      : connectButton(method)}
                </div>
                {method === "phone" && phoneBindOpen && !bound ? (
                  <div className="pb-4" data-sign-in-phone-form="">
                    <PhoneBindForm
                      tt={tt}
                      submitLabel={tt("验证并绑定")}
                      onSuccess={() => {
                        setPhoneBindOpen(false);
                        setNotice("已连接。");
                        void reload();
                      }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {error ? (
        <p
          role="alert"
          data-sign-in-error=""
          className="mt-3 text-[13px] text-red-600"
        >
          {tt(error)}
        </p>
      ) : null}
      {!error && notice ? (
        <p
          role="status"
          data-sign-in-notice=""
          className="mt-3 text-[13px] text-emerald-700"
        >
          {tt(notice)}
        </p>
      ) : null}
      {pendingUnlink ? (
        <ConfirmDialog
          title={tt("断开")}
          body={tt("断开后将不能再用这个方式登录。")}
          confirmLabel={tt("断开")}
          cancelLabel={tt("取消")}
          danger
          onConfirm={() => void confirmUnlink()}
          onCancel={() => setPendingUnlink(null)}
        />
      ) : null}
    </div>
  );
}

export default SignInMethodsPage;
