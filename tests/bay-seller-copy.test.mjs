// W08：卖家分表 17 种语言写全。
//   - 分表每条 16 语齐全、占位符不丢、非中日韩语种不含汉字；
//   - 与基础词典同键时英文必须相同；
//   - seller 源码里的 tt("字面量") 都能在分表或已有词典里查到 16 语译文。
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { stripJsComments } from "./helpers/strip-js-comments.mjs";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const { BAY_SELLER_MESSAGES } = await import("../src/i18n/ui/messages/bay-seller-copy.ts");
const { BAY_MESSAGES } = await import("../src/i18n/ui/messages/bay-copy.ts");

const LOCALES = ["zh-TW", "en", "ja", "ko", "fr", "de", "it", "es", "es-419", "pt-BR", "pt-PT", "ar", "hi", "th", "tr", "vi"];
const HAN = /[\u4e00-\u9fff]/;

function headBase(locale) {
  return execFileSync("git", ["show", `HEAD:src/i18n/ui/messages/${locale}.ts`], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

const BASE = Object.fromEntries(LOCALES.map((locale) => [locale, headBase(locale)]));

function regexEscape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function baseHas(locale, key) {
  return new RegExp(`["']${regexEscape(key)}["']\\s*:`).test(BASE[locale]);
}

function baseEnglish(key) {
  const match = BASE.en.match(new RegExp(`["']${regexEscape(key)}["']\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return match ? JSON.parse(`"${match[1]}"`) : null;
}

test("卖家分表：16 语齐全、占位符不丢、非中日韩不含汉字", () => {
  const keys = Object.keys(BAY_SELLER_MESSAGES.zh);
  assert.ok(keys.length >= 200, `只有 ${keys.length} 条`);
  for (const key of keys) {
    assert.equal(BAY_SELLER_MESSAGES.zh[key], key, `中文站 key 应等于值：${key}`);
    const placeholders = (key.match(/\{\w+\}/g) || []).sort();
    for (const locale of LOCALES) {
      const value = BAY_SELLER_MESSAGES[locale][key];
      assert.ok(typeof value === "string" && value.trim(), `${locale} 缺译文：${key}`);
      assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), placeholders, `${locale} 占位符不对：${key}`);
      if (!["zh-TW", "ja", "ko"].includes(locale)) assert.equal(HAN.test(value), false, `${locale} 含汉字：${key} → ${value}`);
    }
  }
});

test("卖家分表不改基础词典里同一中文键的英文", () => {
  const conflicts = [];
  for (const [key, value] of Object.entries(BAY_SELLER_MESSAGES.en)) {
    const base = baseEnglish(key);
    if (base !== null && base !== value) conflicts.push(`${key}: base=${base} bay=${value}`);
  }
  assert.deepEqual(conflicts, []);
});

test("seller 源码里的 tt 字面量都有 16 语译文", () => {
  const dir = join(REPO, "src", "shell", "bay", "seller");
  const keys = new Set();
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))) {
    const code = stripJsComments(readFileSync(join(dir, name), "utf8"));
    for (const match of code.matchAll(/tt\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) keys.add(match[2]);
  }
  assert.ok(keys.size >= 180, `只收到 ${keys.size} 条`);
  const missing = [];
  for (const key of keys) {
    for (const locale of LOCALES) {
      if (BAY_SELLER_MESSAGES[locale]?.[key] || BAY_MESSAGES[locale]?.[key] || baseHas(locale, key)) continue;
      missing.push(`${locale}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});
