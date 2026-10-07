// W04（oceanleo-bay）：需求 / 报价 / 求助 / 叫真人 文案 17 种语言写全。
//   - 分表每条 16 语齐全、占位符不丢、非中日韩语种不含汉字、不等于中文原文（品牌名除外）；
//   - 与基础词典同键时英文必须相同；
//   - needs/ 与叫真人 Dialog/Status 里的每一句中文，都能在分表或基础词典里查到 16 语译文。
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { stripJsComments } from "./helpers/strip-js-comments.mjs";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const { BAY_NEEDS_MESSAGES } = await import("../src/i18n/ui/messages/bay-needs-copy.ts");
const { BAY_MESSAGES } = await import("../src/i18n/ui/messages/bay-copy.ts");

const LOCALES = ["zh-TW", "en", "ja", "ko", "fr", "de", "it", "es", "es-419", "pt-BR", "pt-PT", "ar", "hi", "th", "tr", "vi"];
const HAN = /[\u4e00-\u9fff]/;
const BRAND = /^(OceanLeo|Bay|PPT)$/;

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

test("需求分表：16 语齐全、占位符不丢、非中日韩不含汉字、不等于中文原文", () => {
  const keys = Object.keys(BAY_NEEDS_MESSAGES.zh);
  assert.ok(keys.length >= 180, `只有 ${keys.length} 条`);
  for (const key of keys) {
    assert.equal(BAY_NEEDS_MESSAGES.zh[key], key, `中文站 key 应等于值：${key}`);
    const placeholders = (key.match(/\{\w+\}/g) || []).sort();
    for (const locale of LOCALES) {
      const value = BAY_NEEDS_MESSAGES[locale][key];
      assert.ok(typeof value === "string" && value.trim(), `${locale} 缺译文：${key}`);
      assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), placeholders, `${locale} 占位符不对：${key}`);
      if (!["zh-TW", "ja", "ko"].includes(locale)) {
        assert.equal(HAN.test(value), false, `${locale} 含汉字：${key} → ${value}`);
      }
      if (!BRAND.test(key)) {
        assert.notEqual(value, key, `${locale} 等于中文原文：${key}`);
      }
    }
  }
});

test("分表不改基础词典里同一中文键的英文", () => {
  const conflicts = [];
  for (const [key, value] of Object.entries(BAY_NEEDS_MESSAGES.en)) {
    const base = baseEnglish(key);
    if (base !== null && base !== value) conflicts.push(`${key}: base=${base} bay=${value}`);
  }
  assert.deepEqual(conflicts, []);
});

test("needs 与叫真人源码里的每句中文都有 16 语译文（分表或基础词典）", () => {
  const files = [];
  const needsDir = join(REPO, "src", "shell", "bay", "needs");
  for (const name of readdirSync(needsDir).filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))) {
    files.push(join(needsDir, name));
  }
  files.push(join(REPO, "src", "shell", "HumanHandoffDialog.tsx"));
  files.push(join(REPO, "src", "shell", "HumanHandoffStatus.tsx"));
  const keys = new Set();
  for (const file of files) {
    const code = stripJsComments(readFileSync(file, "utf8"));
    for (const match of code.matchAll(/"([^"\n]*[\u4e00-\u9fff][^"\n]*)"/g)) keys.add(match[1]);
  }
  assert.ok(keys.size >= 180, `只收到 ${keys.size} 条`);
  const missing = [];
  for (const key of keys) {
    for (const locale of LOCALES) {
      if (BAY_MESSAGES[locale]?.[key] || baseHas(locale, key)) continue;
      missing.push(`${locale}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});
