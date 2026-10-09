// W5（LeoBay 第二波）：任务书点名的常量表每一句，分表 16 语齐全、占位符不丢、非中日韩不含汉字。
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { stripJsComments } from "./helpers/strip-js-comments.mjs";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const { BAY_SHELL_MESSAGES } = await import("../src/i18n/ui/messages/bay-shell-copy.ts");
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

function unescapeString(raw) {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

function extractTt(code) {
  const keys = new Set();
  const stripped = stripJsComments(code);
  const re = /tt\(\s*(["'])((?:\\.|(?!\1).)*)\1/g;
  let match;
  while ((match = re.exec(stripped))) keys.add(unescapeString(match[2]));
  return keys;
}

function extractQuotedChinese(code) {
  const keys = new Set();
  const stripped = stripJsComments(code);
  for (const match of stripped.matchAll(/"([^"\n]*[\u4e00-\u9fff][^"\n]*)"/g)) keys.add(match[1]);
  return keys;
}

function sliceConst(code, marker) {
  const start = code.indexOf(marker);
  assert.ok(start >= 0, `找不到 ${marker}`);
  let depth = 0;
  let inStr = null;
  let begin = -1;
  for (let i = start; i < code.length; i += 1) {
    const ch = code[i];
    if (inStr) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      continue;
    }
    if (ch === "{" || ch === "[") {
      if (begin < 0) begin = i;
      depth += 1;
    } else if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0 && begin >= 0) return code.slice(begin, i + 1);
    }
  }
  throw new Error(`未闭合 ${marker}`);
}

function collectNamedConstants() {
  const keys = new Set();
  const pageDoc = readFileSync(join(REPO, "src/lib/bay/page-doc.ts"), "utf8");
  for (const marker of ["BAY_PAGE_BLOCK_LABELS", "BAY_PAGE_TONE_LABELS", "BAY_PAGE_FONT_LABELS"]) {
    for (const key of extractQuotedChinese(sliceConst(pageDoc, marker))) keys.add(key);
  }
  const newBlock = pageDoc.indexOf("export function newBlock");
  const defaultDoc = pageDoc.indexOf("export function defaultPageDoc");
  const normalize = pageDoc.indexOf("function normalizeBlock");
  assert.ok(newBlock >= 0 && defaultDoc >= 0 && normalize >= 0);
  for (const key of extractTt(pageDoc.slice(newBlock, defaultDoc))) keys.add(key);
  for (const key of extractTt(pageDoc.slice(defaultDoc, normalize))) keys.add(key);

  const detail = readFileSync(join(REPO, "src/shell/bay/shell/BayDetail.tsx"), "utf8");
  for (const key of extractQuotedChinese(sliceConst(detail, "DETAIL_TITLES"))) keys.add(key);
  keys.add("编辑");

  const mine = readFileSync(join(REPO, "src/shell/bay/shell/BayMine.tsx"), "utf8");
  for (const key of extractQuotedChinese(sliceConst(mine, "MINE_LABELS"))) keys.add(key);

  const pane = readFileSync(join(REPO, "src/shell/bay/seller/ServiceEditorPane.tsx"), "utf8");
  for (const marker of ["KIND_CARDS", "SECTION_HINT"]) {
    for (const key of extractQuotedChinese(sliceConst(pane, marker))) keys.add(key);
  }

  const model = readFileSync(join(REPO, "src/shell/bay/seller/editor-model.ts"), "utf8");
  for (const marker of ["SECTION_LABELS", "PUBLISH_KIND_LABELS"]) {
    for (const key of extractQuotedChinese(sliceConst(model, marker))) keys.add(key);
  }
  const missingStart = model.indexOf("export function sectionMissing");
  const missingEnd = model.indexOf("export function missingTotal");
  assert.ok(missingStart >= 0 && missingEnd > missingStart);
  for (const key of extractQuotedChinese(model.slice(missingStart, missingEnd))) keys.add(key);

  return [...keys];
}

test("常量表：16 语齐全、占位符不丢、非中日韩不含汉字", () => {
  const keys = collectNamedConstants();
  assert.ok(keys.length >= 50, `只收到 ${keys.length} 条`);
  const missing = [];
  for (const key of keys) {
    const placeholders = (key.match(/\{\w+\}/g) || []).sort();
    for (const locale of LOCALES) {
      const value =
        BAY_SHELL_MESSAGES[locale]?.[key] ||
        BAY_SELLER_MESSAGES[locale]?.[key] ||
        BAY_MESSAGES[locale]?.[key] ||
        null;
      const fromBase = baseHas(locale, key);
      if (!value && !fromBase) {
        missing.push(`${locale}: ${key}`);
        continue;
      }
      if (value) {
        assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), placeholders, `${locale} 占位符不对：${key}`);
        if (!["zh-TW", "ja", "ko"].includes(locale)) {
          assert.equal(HAN.test(value), false, `${locale} 含汉字：${key} → ${value}`);
        }
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("新加进外壳 / 卖家分表的键：中文站 key 等于值", () => {
  for (const table of [BAY_SHELL_MESSAGES, BAY_SELLER_MESSAGES]) {
    for (const key of Object.keys(table.zh)) {
      assert.equal(table.zh[key], key, `中文站 key 应等于值：${key}`);
    }
  }
});
