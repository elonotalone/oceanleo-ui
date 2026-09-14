// 国内版绑手机文案。缺一个语种或少一条 key，assemble 的入参类型会让 tsc 编不过。
// 已经在登录门 / 账号安全词典里的句子（「手机号」「获取验证码」等）不在这里重复。

import { LOCALES, type Locale } from "../../config";

export const PHONE_BIND_COPY_SOURCE = {
  bindTitle: "绑定手机号",
  bindIntro:
    "国内版需要把一个已验证的中国大陆手机号绑在当前账号上，才能继续使用。",
  verifyAndBind: "验证并绑定",
  bindSuccess: "手机号已经绑到当前账号。",
  sectionDesc: "国内版账号必须绑一个已验证的中国大陆手机号。",
  boundAs: "当前号码 {phone}",
  changePhone: "换绑",
  changeIntro: "换绑要先验证当前号码，再验证新号码。两轮都会发短信。",
  verifyCurrent: "验证当前号码",
  currentVerified: "当前号码已验证。请输入新的中国大陆手机号。",
  phoneChanged: "手机号已经换绑。",
  lostPhoneTitle: "手机号丢了怎么办",
  lostPhoneBody:
    "手机丢了或者换不了号，写信到 support@oceanleo.com，我们人工核实身份之后帮你换绑。",
  smsUnconfigured: "短信服务尚未配置，请稍后再试。",
} as const;

export type PhoneBindCopyName = keyof typeof PHONE_BIND_COPY_SOURCE;
export type PhoneBindCopyMessages = Record<PhoneBindCopyName, string>;

export const PHONE_BIND_COPY_KEYS: readonly string[] = Object.values(
  PHONE_BIND_COPY_SOURCE,
);

export function phoneBindDictionaryFrom(
  messages: PhoneBindCopyMessages,
): Record<string, string> {
  return Object.fromEntries(
    (Object.keys(PHONE_BIND_COPY_SOURCE) as PhoneBindCopyName[]).map((name) => [
      PHONE_BIND_COPY_SOURCE[name],
      messages[name],
    ]),
  );
}

export const PHONE_BIND_COPY_ZH: PhoneBindCopyMessages = {
  ...PHONE_BIND_COPY_SOURCE,
};

export function assemblePhoneBindCopy(
  translations: Record<Exclude<Locale, "zh">, PhoneBindCopyMessages>,
): Record<Locale, Record<string, string>> {
  return Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      phoneBindDictionaryFrom(
        locale === "zh" ? PHONE_BIND_COPY_ZH : translations[locale],
      ),
    ]),
  ) as Record<Locale, Record<string, string>>;
}
