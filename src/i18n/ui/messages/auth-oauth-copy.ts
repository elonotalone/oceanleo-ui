import type { Locale } from "../../config";
import { assembleAuthOauthCopy, AUTH_OAUTH_COPY_KEYS } from "./auth-oauth-copy-base";
import { AUTH_OAUTH_COPY_EASTERN } from "./auth-oauth-copy-eastern";
import { AUTH_OAUTH_COPY_WESTERN } from "./auth-oauth-copy-western";

export { AUTH_OAUTH_COPY_KEYS };

export const AUTH_OAUTH_MESSAGES: Record<Locale, Record<string, string>> = assembleAuthOauthCopy({
  ...AUTH_OAUTH_COPY_WESTERN,
  ...AUTH_OAUTH_COPY_EASTERN,
});
