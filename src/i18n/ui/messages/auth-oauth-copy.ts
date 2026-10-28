import { LOCALES, type Locale } from "../../config";
import { assembleAuthOauthCopy, AUTH_OAUTH_COPY_KEYS } from "./auth-oauth-copy-base";
import { AUTH_OAUTH_COPY_EASTERN } from "./auth-oauth-copy-eastern";
import { AUTH_OAUTH_COPY_WESTERN } from "./auth-oauth-copy-western";

export { AUTH_OAUTH_COPY_KEYS };

export const AUTH_OAUTH_MESSAGES: Record<Locale, Record<string, string>> = assembleAuthOauthCopy({
  ...AUTH_OAUTH_COPY_WESTERN,
  ...AUTH_OAUTH_COPY_EASTERN,
});

// Chinese source, English and Traditional Chinese are complete; other locales use English.
const BROWSER_WARNING = "尚未收到页面打开确认，浏览器可能无法访问，请检查代理。";
for (const locale of LOCALES) {
  Object.assign(AUTH_OAUTH_MESSAGES[locale], locale === "zh" ? {
    [BROWSER_WARNING]: BROWSER_WARNING,
    "登录链接": "登录链接",
  } : locale === "zh-TW" ? {
    [BROWSER_WARNING]: "尚未收到頁面開啟確認，瀏覽器可能無法存取，請檢查代理設定。",
    "登录链接": "登入連結",
  } : {
    [BROWSER_WARNING]: "The login page has not confirmed it opened. Your browser may be unable to reach it. Check your proxy settings.",
    "登录链接": "Login link",
  });
}
