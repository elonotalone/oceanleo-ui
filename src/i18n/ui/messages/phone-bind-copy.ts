import type { Locale } from "../../config";
import {
  assemblePhoneBindCopy,
  PHONE_BIND_COPY_KEYS,
} from "./phone-bind-copy-base";
import { PHONE_BIND_COPY_EASTERN } from "./phone-bind-copy-eastern";
import { PHONE_BIND_COPY_WESTERN } from "./phone-bind-copy-western";

export { PHONE_BIND_COPY_KEYS };

export const PHONE_BIND_MESSAGES: Record<Locale, Record<string, string>> =
  assemblePhoneBindCopy({
    ...PHONE_BIND_COPY_WESTERN,
    ...PHONE_BIND_COPY_EASTERN,
  });
