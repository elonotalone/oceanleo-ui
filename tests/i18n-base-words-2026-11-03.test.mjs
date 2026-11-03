import assert from "node:assert/strict";
import test from "node:test";

import { LOCALES } from "../src/i18n/config.ts";
import { SHELL_OVERHAUL_MESSAGES } from "../src/i18n/ui/messages/shell-overhaul-copy.ts";

// 2026-11-03 build tables must never put English (or any other wording) over a word the base dictionary already
// translates for that locale; that silently changed shared buttons such as 重试/下载/发送 on the French site.
const TABLES = {
  ASSET_DETAIL_MESSAGES: "asset-detail-copy", ASSET_ACTIONS_MESSAGES: "asset-actions-copy", W3_L5D_MESSAGES: "w3-l5d-copy",
  W3_M3_MESSAGES: "w3-m3-copy", W3_M4_MESSAGES: "w3-m4-copy", CN_HOST_MESSAGES: "cn-host-copy", RDLOGIN_MESSAGES: "rdlogin-copy",
  RD_GATEWAY_MESSAGES: "rd-gateway-copy", HOME_ASSET_CARDS_MESSAGES: "home-asset-cards-copy", RD_BROKER_MESSAGES: "rd-broker-copy",
  TOOLUI_MESSAGES: "toolui-copy", W4_M5_MESSAGES: "w4-m5-copy", MOBILE_MIDTURN_MESSAGES: "mobile-midturn-copy",
  NATIVE_MIDTURN_MESSAGES: "native-midturn-copy", PUSH_NATIVE_MESSAGES: "push-native-copy",
  BUILD_1103_GAP_MESSAGES: "build-1103-gap-copy",
  RDLOGIN_ACT_MESSAGES: "rdlogin-act-copy",
};

test("2026-11-03 tables keep every base-dictionary translation in every locale", async () => {
  const conflicts = [];
  for (const locale of LOCALES) {
    const base = (await import(`../src/i18n/ui/messages/${locale}.ts`)).default;
    for (const [name, file] of Object.entries(TABLES)) {
      const table = (await import(`../src/i18n/ui/messages/${file}.ts`))[name];
      assert.ok(table?.[locale], `${name}.${locale}`);
      for (const key of Object.keys(table[locale])) {
        if (!base[key]) continue;
        const registered = SHELL_OVERHAUL_MESSAGES[locale][key];
        if (registered !== undefined && registered !== base[key]) conflicts.push(`${locale} ${name}:${key} base=${base[key]} registered=${registered}`);
      }
    }
  }
  assert.deepEqual(conflicts, []);
});
