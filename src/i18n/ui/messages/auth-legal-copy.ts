import type { Locale } from "../../config";
import { assembleAuthLegalCopy, AUTH_LEGAL_COPY_KEYS } from "./auth-legal-copy-base";
import { AUTH_LEGAL_COPY_EASTERN } from "./auth-legal-copy-eastern";
import { AUTH_LEGAL_COPY_WESTERN } from "./auth-legal-copy-western";

export { AUTH_LEGAL_COPY_KEYS };

export const AUTH_LEGAL_MESSAGES: Record<Locale, Record<string, string>> = assembleAuthLegalCopy({
  ...AUTH_LEGAL_COPY_WESTERN,
  ...AUTH_LEGAL_COPY_EASTERN,
});
