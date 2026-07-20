import type { Locale } from "../../config";
import {
  CLOUD_BROWSER_EN,
  CLOUD_BROWSER_KEYS,
  CLOUD_BROWSER_ZH,
  type CloudBrowserDictionary,
} from "./cloud-browser-copy-base";
import { CLOUD_BROWSER_EASTERN } from "./cloud-browser-copy-eastern";
import { CLOUD_BROWSER_WESTERN } from "./cloud-browser-copy-western";

export { CLOUD_BROWSER_KEYS };

export const CLOUD_BROWSER_MESSAGES: Record<
  Locale,
  CloudBrowserDictionary
> = {
  zh: CLOUD_BROWSER_ZH,
  en: CLOUD_BROWSER_EN,
  ...Object.fromEntries(
    Object.entries({
      ...CLOUD_BROWSER_WESTERN,
      ...CLOUD_BROWSER_EASTERN,
    }).map(([locale, overrides]) => [
      locale,
      { ...CLOUD_BROWSER_EN, ...overrides },
    ]),
  ),
} as Record<Locale, CloudBrowserDictionary>;
