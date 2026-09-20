import type { Locale } from "../../config";
import {
  assembleEnterpriseCopy,
  ENTERPRISE_COPY_KEYS,
} from "./enterprise-copy-base";
import { ENTERPRISE_COPY_EASTERN } from "./enterprise-copy-eastern";
import { ENTERPRISE_COPY_WESTERN } from "./enterprise-copy-western";

export { ENTERPRISE_COPY_KEYS };

export const ENTERPRISE_COPY_MESSAGES: Record<Locale, Record<string, string>> =
  assembleEnterpriseCopy({
    ...ENTERPRISE_COPY_WESTERN,
    ...ENTERPRISE_COPY_EASTERN,
  });
