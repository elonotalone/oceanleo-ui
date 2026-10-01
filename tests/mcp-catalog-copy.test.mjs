// W2：货架分类 / 产品名 / 简介 / 弹窗说明必须有 16 语。父还没登记 MCP_CATALOG_MESSAGES，
// 所以这里直接读分表，不走 UI_MESSAGES。

import assert from "node:assert/strict";
import test from "node:test";

const { LOCALES } = await import("../src/i18n/config.ts");
const { MCP_CATALOG_MESSAGES } = await import(
  "../src/i18n/ui/messages/mcp-catalog-copy.ts"
);

const TRANSLATED = LOCALES.filter((locale) => locale !== "zh");
const CATEGORY = "开发与部署";
const GITHUB_DESC =
  "在 GitHub 上克隆、推送代码，查看和管理仓库与 Pull Request，用自然语言完成代码协作。";
const CJK = /[\u4e00-\u9fff]/;

test("assembleCopy 16 个非 zh locale 都在，且货架键非空", () => {
  assert.ok(MCP_CATALOG_MESSAGES.zh[CATEGORY], "zh 缺分类 key，分表疑似空了");
  assert.equal(MCP_CATALOG_MESSAGES.zh[CATEGORY], CATEGORY);
  assert.equal(TRANSLATED.length, 16);
  for (const locale of TRANSLATED) {
    const table = MCP_CATALOG_MESSAGES[locale];
    assert.ok(table, `缺 locale：${locale}`);
    assert.ok(table[CATEGORY], `${locale} 缺分类：${CATEGORY}`);
    assert.notEqual(String(table[CATEGORY]).trim(), "", `${locale} 分类是空串`);
    assert.ok(table[GITHUB_DESC], `${locale} 缺 GitHub 简介`);
    assert.notEqual(String(table[GITHUB_DESC]).trim(), "", `${locale} GitHub 简介是空串`);
  }
});

test("开发与部署英文是 Development and deployment，不含汉字", () => {
  const en = MCP_CATALOG_MESSAGES.en[CATEGORY];
  assert.equal(en, "Development and deployment");
  assert.equal(CJK.test(en), false, `分类英文仍有汉字：${en}`);
});

test("GitHub 简介英文不含汉字", () => {
  const en = MCP_CATALOG_MESSAGES.en[GITHUB_DESC];
  assert.ok(en, "en 缺 GitHub 简介");
  assert.notEqual(en, GITHUB_DESC);
  assert.equal(CJK.test(en), false, `GitHub 简介英文仍有汉字：${en}`);
});
