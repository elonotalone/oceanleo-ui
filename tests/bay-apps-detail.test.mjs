// U2：作品详情窗格源码合同 + 文案 17 语。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { LOCALES } from "../src/i18n/config.ts";
import { BAY_APPS_DETAIL_MESSAGES, BAY_APPS_DETAIL_SOURCE } from "../src/i18n/ui/messages/bay-apps-detail-copy.ts";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const HAN = /[\u4e00-\u9fff]/;

function source(relativePath) {
  return readFileSync(join(REPO, relativePath), "utf8");
}

test("AppPane 只走 lib/bay/apps，window.open 带 noopener,noreferrer", () => {
  const pane = source("src/shell/bay/apps/AppPane.tsx");
  assert.doesNotMatch(pane, /fetch\(/);
  assert.doesNotMatch(pane, /\/v1\//);
  assert.match(pane, /from "\.\.\/\.\.\/\.\.\/lib\/bay\/apps"/);
  assert.match(pane, /getBayApp/);
  assert.match(pane, /window\.open\([^)]*"noopener,noreferrer"\)/);
});

test("AppPane 记 view/open，作者本人不上报，举报走 reportBayApp", () => {
  const pane = source("src/shell/bay/apps/AppPane.tsx");
  // 2026-10-11 起每次计数都带上访客的来源（流量来源统计）。
  assert.match(pane, /recordBayAppEvent\(app\.id, "view", currentBayAppSource\(app\.id, siteKey\)\)/);
  assert.match(pane, /recordBayAppEvent\(app\.id, "open", currentBayAppSource\(app\.id, siteKey\)\)/);
  assert.match(pane, /viewer\.is_owner/);
  assert.match(pane, /if \(owner \|\| viewedRef\.current\) return;/);
  assert.match(pane, /if \(owner \|\| openedRef\.current\) return;/);
  assert.match(pane, /<ReportBox onSubmit=\{\(reason, detail\) => reportBayApp\(app\.id, reason, detail\)\} \/>/);
});

test("三种回退卡的 data- 标记都在", () => {
  const pane = source("src/shell/bay/apps/AppPane.tsx");
  const frame = source("src/shell/bay/apps/AppEmbedFrame.tsx");
  assert.match(pane, /data-bay-app-fallback=\{marker === "blocked" \? "blocked"/);
  assert.match(pane, /"creator"/);
  assert.match(pane, /"first-party"/);
  assert.match(frame, /data-bay-app-fallback="timeout"/);
});

test("bay-apps-detail 文案 17 语齐全、占位符不丢、非中日韩不含汉字", () => {
  const keys = Object.values(BAY_APPS_DETAIL_SOURCE);
  assert.equal(LOCALES.length, 17);
  assert.ok(keys.length > 0);
  for (const locale of LOCALES) {
    for (const key of keys) {
      const value = BAY_APPS_DETAIL_MESSAGES[locale]?.[key];
      assert.ok(value && String(value).trim(), `${locale} 缺译文：${key}`);
      const placeholders = (key.match(/\{\w+\}/g) || []).sort();
      assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), placeholders, `${locale} 占位符不对：${key}`);
      if (locale === "zh") {
        assert.equal(value, key);
      }
      if (!["zh", "zh-TW", "ja", "ko"].includes(locale)) {
        assert.equal(HAN.test(value), false, `${locale} 含汉字：${key} → ${value}`);
      }
    }
  }
});
