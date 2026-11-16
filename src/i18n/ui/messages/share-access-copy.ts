import { LOCALES, type Locale } from "../../config";
import { SHARE_ACCESS_COPY_SOURCE, type ShareAccessCopy } from "./share-access-copy-source";
import { SHARE_ACCESS_WESTERN } from "./share-access-copy-western";
import { SHARE_ACCESS_EASTERN } from "./share-access-copy-eastern";

export { SHARE_ACCESS_COPY_SOURCE } from "./share-access-copy-source";
const translations: Record<Exclude<Locale, "zh">, ShareAccessCopy> = { ...SHARE_ACCESS_WESTERN, ...SHARE_ACCESS_EASTERN };
export const SHARE_ACCESS_COPY_KEYS = Object.values(SHARE_ACCESS_COPY_SOURCE);
export const SHARE_ACCESS_MESSAGES = Object.fromEntries(LOCALES.map((locale) => {
  const table = locale === "zh" ? { ...SHARE_ACCESS_COPY_SOURCE, collaborate: "协作" } : translations[locale];
  return [locale, Object.fromEntries((Object.keys(SHARE_ACCESS_COPY_SOURCE) as (keyof ShareAccessCopy)[]).map((key) => [SHARE_ACCESS_COPY_SOURCE[key], table[key]]))];
})) as Record<Locale, Record<string, string>>;
