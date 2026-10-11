// U1：作品栏货架 / 卡片 / 钩子源码合同，以及分表 16 语译文。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const { BAY_APPS_SHELF_MESSAGES, BAY_APPS_SHELF_SOURCE } = await import(
  "../src/i18n/ui/messages/bay-apps-shelf-copy.ts"
);

const LOCALES = ["zh-TW", "en", "ja", "ko", "fr", "de", "it", "es", "es-419", "pt-BR", "pt-PT", "ar", "hi", "th", "tr", "vi"];
const HAN = /[\u4e00-\u9fff]/;

function src(rel) {
  return readFileSync(join(REPO, "src", rel), "utf8");
}

test("use-bay-apps / BayAppShelf / BayAppCard 只走 lib/bay/apps，有取消与封面约束", () => {
  const hook = src("shell/bay/apps/use-bay-apps.ts");
  const shelf = src("shell/bay/apps/BayAppShelf.tsx");
  const card = src("shell/bay/apps/BayAppCard.tsx");
  for (const [name, text] of [
    ["use-bay-apps.ts", hook],
    ["BayAppShelf.tsx", shelf],
    ["BayAppCard.tsx", card],
  ]) {
    assert.doesNotMatch(text, /fetch\(/, `${name} 不得自己 fetch`);
    assert.doesNotMatch(text, /\/v1\//, `${name} 不得手写接口地址`);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/, `${name} 不得注入 HTML`);
    assert.doesNotMatch(text, /innerHTML/, `${name} 不得写 innerHTML`);
  }
  assert.match(hook, /listBayApps/);
  assert.match(hook, /from "\.\.\/\.\.\/\.\.\/lib\/bay\/apps"/);
  assert.match(hook, /AbortController/);
  assert.match(hook, /requestRef/);
  assert.match(card, /referrerPolicy="no-referrer"/);
  assert.match(card, /startsWith\("https:\/\/"\)/);
  assert.match(shelf, /data-bay-app-shelf/);
  assert.match(shelf, /data-bay-app-empty/);
  assert.match(shelf, /data-bay-app-error/);
  assert.match(shelf, /data-bay-app-more/);
  assert.match(shelf, /data-bay-app-loading/);
  assert.match(card, /data-bay-app-card=\{app\.id\}/);
});

test("bay-apps-shelf-copy：每条原文 16 语非空，非中日韩不含汉字", () => {
  const keys = Object.values(BAY_APPS_SHELF_SOURCE);
  assert.ok(keys.length >= 8, `只有 ${keys.length} 条`);
  for (const key of keys) {
    assert.equal(BAY_APPS_SHELF_MESSAGES.zh[key], key, `中文站 key 应等于值：${key}`);
    const placeholders = (key.match(/\{\w+\}/g) || []).sort();
    for (const locale of LOCALES) {
      const value = BAY_APPS_SHELF_MESSAGES[locale][key];
      assert.ok(typeof value === "string" && value.trim(), `${locale} 缺译文：${key}`);
      assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), placeholders, `${locale} 占位符不对：${key}`);
      if (!["zh-TW", "ja", "ko"].includes(locale)) {
        assert.equal(HAN.test(value), false, `${locale} 含汉字：${key} → ${value}`);
      }
    }
  }
});
