import type { Locale } from "../../config";
import {
  assembleByokReauthCopy,
  BYOK_REAUTH_COPY_KEYS,
} from "./byok-reauth-copy-base";
import { BYOK_REAUTH_COPY_EASTERN } from "./byok-reauth-copy-eastern";
import { BYOK_REAUTH_COPY_WESTERN } from "./byok-reauth-copy-western";

export { BYOK_REAUTH_COPY_KEYS };

export const BYOK_REAUTH_MESSAGES: Record<Locale, Record<string, string>> =
  assembleByokReauthCopy({
    ...BYOK_REAUTH_COPY_WESTERN,
    ...BYOK_REAUTH_COPY_EASTERN,
  });
