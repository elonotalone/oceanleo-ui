// Login / reset hCaptcha copy. Missing a locale here prints Chinese on that locale.

import { LOCALES, type Locale } from "../../config";

export const AUTH_CAPTCHA_COPY_SOURCE = {
  verifying: "正在进行安全验证…",
  failed: "安全验证没有通过，请重试",
  loadFailed: "安全验证组件加载失败，请刷新页面重试",
} as const;

export type AuthCaptchaCopyName = keyof typeof AUTH_CAPTCHA_COPY_SOURCE;
export type AuthCaptchaCopyMessages = Record<AuthCaptchaCopyName, string>;

export const AUTH_CAPTCHA_COPY_KEYS: readonly string[] = Object.values(
  AUTH_CAPTCHA_COPY_SOURCE,
);

export function authCaptchaDictionaryFrom(
  messages: AuthCaptchaCopyMessages,
): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(AUTH_CAPTCHA_COPY_SOURCE) as AuthCaptchaCopyName[]).map((name) => [
      AUTH_CAPTCHA_COPY_SOURCE[name],
      messages[name],
    ]),
  );
}

export const AUTH_CAPTCHA_COPY_ZH: AuthCaptchaCopyMessages = {
  ...AUTH_CAPTCHA_COPY_SOURCE,
};

export function assembleAuthCaptchaCopy(
  translations: Record<Exclude<Locale, "zh">, AuthCaptchaCopyMessages>,
): Record<Locale, Record<string, string>> {
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      authCaptchaDictionaryFrom(
        locale === "zh" ? AUTH_CAPTCHA_COPY_ZH : translations[locale],
      ),
    ]),
  ) as Record<Locale, Record<string, string>>;
}
