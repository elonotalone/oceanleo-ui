import type { Locale } from "../../config";
import {
  assembleAuthCaptchaCopy,
  AUTH_CAPTCHA_COPY_KEYS,
} from "./auth-captcha-copy-base";
import { AUTH_CAPTCHA_COPY_EASTERN } from "./auth-captcha-copy-eastern";
import { AUTH_CAPTCHA_COPY_WESTERN } from "./auth-captcha-copy-western";

export { AUTH_CAPTCHA_COPY_KEYS };

export const AUTH_CAPTCHA_MESSAGES: Record<Locale, Record<string, string>> =
  assembleAuthCaptchaCopy({
    ...AUTH_CAPTCHA_COPY_WESTERN,
    ...AUTH_CAPTCHA_COPY_EASTERN,
  });
