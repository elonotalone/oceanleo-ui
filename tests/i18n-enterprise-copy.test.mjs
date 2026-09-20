// W19 —— 企业版 + MCP 能力面文案：16 语齐全、无中文残留、key ⊆ 七个 .tsx 的 tt() 字面。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const { LOCALES } = await import("../src/i18n/config.ts");
const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
const { ENTERPRISE_COPY_SOURCE, ENTERPRISE_COPY_KEYS } = await import(
  "../src/i18n/ui/messages/enterprise-copy-base.ts"
);
const { ENTERPRISE_COPY_MESSAGES } = await import(
  "../src/i18n/ui/messages/enterprise-copy.ts"
);

const TRANSLATED_LOCALES = LOCALES.filter((locale) => locale !== "zh");
const HAN = /[\u4e00-\u9fff]/;
const CJK_OK = new Set(["zh-TW", "ja", "ko"]);

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const TT_PAGES = [
  "src/pages/OrgPage.tsx",
  "src/pages/OrgMembership.tsx",
  "src/pages/AccountPage.tsx",
  "src/pages/ByokKeys.tsx",
  "src/pages/PluginsPage.tsx",
  "src/shell/PayerSelector.tsx",
  "src/shell/mcp-apps/ComposerAppsBar.tsx",
];

/** 七个页面里 `tt("…")` 的双引号字面（含换行折行）。 */
function ttLiteralsFrom(source) {
  const keys = new Set();
  const re = /\btt\(\s*"((?:\\.|[^"\\])*)"/g;
  let match;
  while ((match = re.exec(source))) {
    keys.add(JSON.parse(`"${match[1]}"`));
  }
  return keys;
}

function sevenPageTtLiterals() {
  const keys = new Set();
  for (const relative of TT_PAGES) {
    const source = readFileSync(path.join(REPO_ROOT, relative), "utf8");
    for (const key of ttLiteralsFrom(source)) keys.add(key);
  }
  return keys;
}

test("企业版词典 16 语种每个 key 都有非空值，中文站 key 等于值", () => {
  const names = Object.keys(ENTERPRISE_COPY_SOURCE);
  assert.equal(ENTERPRISE_COPY_KEYS.length, names.length);
  assert.ok(ENTERPRISE_COPY_KEYS.length > 100, `只收到 ${ENTERPRISE_COPY_KEYS.length} 条，SOURCE 疑似空了`);
  for (const key of ENTERPRISE_COPY_KEYS) {
    assert.equal(UI_MESSAGES.zh[key], key, `中文站 key 必须等于值：${key}`);
    assert.equal(ENTERPRISE_COPY_MESSAGES.zh[key], key);
    for (const locale of TRANSLATED_LOCALES) {
      const fromModule = ENTERPRISE_COPY_MESSAGES[locale][key];
      const fromIndex = UI_MESSAGES[locale][key];
      assert.ok(fromModule, `${locale} 缺译文（enterprise-copy）：${key}`);
      assert.ok(fromIndex, `${locale} 缺译文（index 未挂载）：${key}`);
      assert.equal(fromIndex, fromModule, `${locale} index 与 enterprise-copy 不一致：${key}`);
    }
  }
});

test("非中文语种不含 CJK；zh-TW/ja/ko 允许 CJK 但不得与简体原文逐字相同", () => {
  const leaked = [];
  const copied = [];
  for (const key of ENTERPRISE_COPY_KEYS) {
    for (const locale of TRANSLATED_LOCALES) {
      const value = ENTERPRISE_COPY_MESSAGES[locale][key];
      if (CJK_OK.has(locale)) {
        if (value === key) copied.push(`${locale}: ${key}`);
        continue;
      }
      if (HAN.test(value)) leaked.push(`${locale}: ${key} → ${value}`);
    }
  }
  assert.deepEqual(leaked.sort(), [], "非中日韩语种的译文里出现了汉字");
  assert.deepEqual(copied.sort(), [], "zh-TW/ja/ko 把中文原文逐字抄了一遍");
});

test("ENTERPRISE_COPY_KEYS ⊆ 七个 .tsx 里的 tt() 字面", () => {
  const literals = sevenPageTtLiterals();
  const extra = ENTERPRISE_COPY_KEYS.filter((key) => !literals.has(key));
  assert.deepEqual(
    extra.sort(),
    [],
    "词典里有 tt() 源码抽不到的 key——要么原文与 tsx 漂了，要么不该进这册",
  );
});
