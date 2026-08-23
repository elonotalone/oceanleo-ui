// Google / Apple 登录门面文案。单独成册：少一条译文，非中文用户点这两钮会看到中文。
// 已经在词典里的「跳转中...」「邮箱」「登录失败，请稍后重试。」不在这里重复。

import { LOCALES, type Locale } from "../../config";

export const AUTH_OAUTH_COPY_SOURCE = {
  google: "Google",
  apple: "Apple",
  googleContinue: "使用 Google 继续",
  appleContinue: "使用 Apple 继续",
  googleUnconfigured: "Google 登录暂未开放：还没有配置，请改用邮箱登录。",
  appleUnconfigured: "Apple 登录暂未开放：还没有配置，请改用邮箱登录。",
} as const;

export type AuthOauthCopyName = keyof typeof AUTH_OAUTH_COPY_SOURCE;
export type AuthOauthCopyMessages = Record<AuthOauthCopyName, string>;

export const AUTH_OAUTH_COPY_KEYS: readonly string[] = Object.values(AUTH_OAUTH_COPY_SOURCE);

export function authOauthDictionaryFrom(
  messages: AuthOauthCopyMessages,
): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(AUTH_OAUTH_COPY_SOURCE) as AuthOauthCopyName[]).map((name) => [
      AUTH_OAUTH_COPY_SOURCE[name],
      messages[name],
    ]),
  );
}

export const AUTH_OAUTH_COPY_ZH: AuthOauthCopyMessages = { ...AUTH_OAUTH_COPY_SOURCE };

export function assembleAuthOauthCopy(
  translations: Record<Exclude<Locale, "zh">, AuthOauthCopyMessages>,
): Record<Locale, Record<string, string>> {
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      authOauthDictionaryFrom(locale === "zh" ? AUTH_OAUTH_COPY_ZH : translations[locale]),
    ]),
  ) as Record<Locale, Record<string, string>>;
}
