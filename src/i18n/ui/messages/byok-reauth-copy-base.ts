// BYOK reauth copy requested by W5. Keys must match ByokKeys.tsx tt() literals.

import { LOCALES, type Locale } from "../../config";

export const BYOK_REAUTH_COPY_SOURCE = {
  signInAgain: "重新登录",
  protectKey: "为了保护你的钥匙，请重新登录后再添加",
} as const;

export type ByokReauthCopyName = keyof typeof BYOK_REAUTH_COPY_SOURCE;
export type ByokReauthCopyMessages = Record<ByokReauthCopyName, string>;

export const BYOK_REAUTH_COPY_KEYS: readonly string[] = Object.values(
  BYOK_REAUTH_COPY_SOURCE,
);

export function byokReauthDictionaryFrom(
  messages: ByokReauthCopyMessages,
): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(BYOK_REAUTH_COPY_SOURCE) as ByokReauthCopyName[]).map((name) => [
      BYOK_REAUTH_COPY_SOURCE[name],
      messages[name],
    ]),
  );
}

export const BYOK_REAUTH_COPY_ZH: ByokReauthCopyMessages = {
  ...BYOK_REAUTH_COPY_SOURCE,
};

export function assembleByokReauthCopy(
  translations: Record<Exclude<Locale, "zh">, ByokReauthCopyMessages>,
): Record<Locale, Record<string, string>> {
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      byokReauthDictionaryFrom(
        locale === "zh" ? BYOK_REAUTH_COPY_ZH : translations[locale],
      ),
    ]),
  ) as Record<Locale, Record<string, string>>;
}
