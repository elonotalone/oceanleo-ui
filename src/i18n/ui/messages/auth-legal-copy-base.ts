// Login-gate Terms / Privacy footnote. Missing a locale here prints Chinese
// on that locale under the Continue button.

import { LOCALES, type Locale } from "../../config";

export const AUTH_LEGAL_COPY_SOURCE = {
  legalFootnote: "继续即表示你同意我们的{terms}，并已阅读{privacy}。",
  termsOfService: "服务条款",
  privacyPolicy: "隐私政策",
} as const;

export type AuthLegalCopyName = keyof typeof AUTH_LEGAL_COPY_SOURCE;
export type AuthLegalCopyMessages = Record<AuthLegalCopyName, string>;

export const AUTH_LEGAL_COPY_KEYS: readonly string[] = Object.values(AUTH_LEGAL_COPY_SOURCE);

export function authLegalDictionaryFrom(
  messages: AuthLegalCopyMessages,
): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(AUTH_LEGAL_COPY_SOURCE) as AuthLegalCopyName[]).map((name) => [
      AUTH_LEGAL_COPY_SOURCE[name],
      messages[name],
    ]),
  );
}

export const AUTH_LEGAL_COPY_ZH: AuthLegalCopyMessages = { ...AUTH_LEGAL_COPY_SOURCE };

export function assembleAuthLegalCopy(
  translations: Record<Exclude<Locale, "zh">, AuthLegalCopyMessages>,
): Record<Locale, Record<string, string>> {
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      authLegalDictionaryFrom(locale === "zh" ? AUTH_LEGAL_COPY_ZH : translations[locale]),
    ]),
  ) as Record<Locale, Record<string, string>>;
}
