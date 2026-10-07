// W03（oceanleo-bay）：Bay 外壳文案 17 种语言写全。
//   - 分表每条 16 语齐全、占位符不丢、非中日韩语种不含汉字；
//   - 与基础词典同键时英文必须相同（不悄悄改别人的意思）；
//   - 外壳源码里的每一句中文、以及 16 个交付类目名，都能在分表或基础词典里查到 16 语译文。
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { stripJsComments } from "./helpers/strip-js-comments.mjs";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const { BAY_SHELL_MESSAGES } = await import("../src/i18n/ui/messages/bay-shell-copy.ts");
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

test("分表：16 语齐全、占位符不丢、非中日韩不含汉字", () => {
  const keys = Object.keys(BAY_SHELL_MESSAGES.zh);
  assert.ok(keys.length >= 40, `只有 ${keys.length} 条`);
  for (const key of keys) {
    assert.equal(BAY_SHELL_MESSAGES.zh[key], key, `中文站 key 应等于值：${key}`);
    const placeholders = (key.match(/\{\w+\}/g) || []).sort();
    for (const locale of LOCALES) {
      const value = BAY_SHELL_MESSAGES[locale][key];
      assert.ok(typeof value === "string" && value.trim(), `${locale} 缺译文：${key}`);
      assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), placeholders, `${locale} 占位符不对：${key}`);
      if (!["zh-TW", "ja", "ko"].includes(locale)) assert.equal(HAN.test(value), false, `${locale} 含汉字：${key} → ${value}`);
    }
  }
});

test("分表不改基础词典里同一中文键的英文", () => {
  const conflicts = [];
  for (const [key, value] of Object.entries(BAY_SHELL_MESSAGES.en)) {
    const base = baseEnglish(key);
    if (base !== null && base !== value) conflicts.push(`${key}: base=${base} bay=${value}`);
  }
  assert.deepEqual(conflicts, []);
});

test("外壳源码里的每句中文与 16 个交付类目名都有 16 语译文", () => {
  const dir = join(REPO, "src", "shell", "bay", "shell");
  const keys = new Set();
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))) {
    const code = stripJsComments(readFileSync(join(dir, name), "utf8"));
    for (const match of code.matchAll(/"([^"\n]*[\u4e00-\u9fff][^"\n]*)"/g)) keys.add(match[1]);
  }
  for (const name of [
    "设计与视觉", "图像处理", "视频与动画", "音频与音乐", "文档与表格", "写作与翻译", "简历与作品集", "网站与前端",
    "代码与自动化", "数据与检索", "三维与建模", "游戏与互动", "Agent 与提示词搭建", "会议与纪要", "行程规划", "其他",
  ]) keys.add(name);
  assert.ok(keys.size >= 50, `只收到 ${keys.size} 条`);
  const missing = [];
  for (const key of keys) {
    for (const locale of LOCALES) {
      if (BAY_MESSAGES[locale]?.[key] || baseHas(locale, key)) continue;
      missing.push(`${locale}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});
