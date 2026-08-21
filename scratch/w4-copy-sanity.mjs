import { LOCALES } from "../src/i18n/config.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { ACCOUNT_SECURITY_COPY_KEYS } from "../src/i18n/ui/messages/account-security-copy.ts";
const CJK = new Set(["zh", "zh-TW", "ja", "ko"]);
let missing = 0, han = 0, ph = 0, same = 0;
for (const key of ACCOUNT_SECURITY_COPY_KEYS) {
  const want = [...key.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");
  for (const loc of LOCALES) {
    const v = UI_MESSAGES[loc][key];
    if (!v) { console.log("MISSING", loc, key); missing++; continue; }
    if (loc === "zh") { if (v !== key) { console.log("ZH-DRIFT", key); same++; } continue; }
    if (v === key) { console.log("UNTRANSLATED", loc, key); same++; }
    if (!CJK.has(loc) && /[\u4e00-\u9fff]/.test(v)) { console.log("HAN", loc, key, "->", v); han++; }
    const got = [...v.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(",");
    if (got !== want) { console.log("PLACEHOLDER", loc, key, want, "!=", got); ph++; }
  }
}
console.log(`keys=${ACCOUNT_SECURITY_COPY_KEYS.length} locales=${LOCALES.length} entries=${ACCOUNT_SECURITY_COPY_KEYS.length*LOCALES.length} missing=${missing} han=${han} placeholder=${ph} untranslated=${same}`);
