// W5（LeoBay 第四波）：合同 §4 前三行 16 句在合并词典 16 语齐全；
// 本分表每条 16 语齐全、占位符不丢、非中日韩不含汉字、中文站 key 等于值；
// 不与基础词典或别的 Bay 分表重复。例外：「云端浏览器」基础词典只有英文。
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./ts-extension-loader.mjs", import.meta.url);

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const { LEOBAY4_MESSAGES } = await import("../src/i18n/ui/messages/leobay4-copy.ts");
const { BAY_SHELL_MESSAGES } = await import("../src/i18n/ui/messages/bay-shell-copy.ts");
const { BAY_NEEDS_MESSAGES } = await import("../src/i18n/ui/messages/bay-needs-copy.ts");
const { BAY_SUPPLY_MESSAGES } = await import("../src/i18n/ui/messages/bay-supply-copy.ts");
const { BAY_DEAL_MESSAGES } = await import("../src/i18n/ui/messages/bay-deal-copy.ts");
const { BAY_ORDERS_MESSAGES } = await import("../src/i18n/ui/messages/bay-orders-copy.ts");
const { BAY_SELLER_MESSAGES } = await import("../src/i18n/ui/messages/bay-seller-copy.ts");
const { BAY_MONEY_MESSAGES } = await import("../src/i18n/ui/messages/bay-money-copy.ts");
const { BAY_PORTAL_MESSAGES } = await import("../src/i18n/ui/messages/bay-portal-copy.ts");
const { LEOCHAT_PAGE_MESSAGES } = await import("../src/i18n/ui/messages/leochat-page-copy.ts");
const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");

const LOCALES = [
  "zh-TW",
  "en",
  "ja",
  "ko",
  "fr",
  "de",
  "it",
  "es",
  "es-419",
  "pt-BR",
  "pt-PT",
  "ar",
  "hi",
  "th",
  "tr",
  "vi",
];
const HAN = /[\u4e00-\u9fff]/;
const CLOUD_BROWSER = "云端浏览器";

const SECTION_4_NEW = [
  "看这个应用怎么用，从示例开始",
  "这次对话里生成的内容",
  "平台精选的模板和素材",
  "你保存和上传的文件",
  "看 AI 在浏览器里的操作",
  "找真人做事：逛服务、发需求",
  "和联系人、卖家聊天",
  "回到卡片",
  "与我的问题相关的服务",
  "关键词：{q}",
  "没有直接匹配的服务，下面是 {site} 这个类目里的服务。",
  "还没有相关的服务。",
  "你可以发一条需求，让会做的人来找你。",
  "逛全部 LeoBay",
  "全部类目",
  "相关服务没读出来，请稍后再试。",
];

const ALREADY_COMPLETE = [
  "生成",
  "素材库",
  "我的库",
  "工作区",
  "返回",
  "发需求",
  "发布",
  "我的",
  "类目",
  "其他",
  "专业咨询",
  "素材与服务",
  "需求",
  "搜素材、服务、需求…",
  "搜索",
  "正在加载…",
  "重试",
  "加载更多",
  "聊天",
  "联系人",
  "登录后查看聊天和联系人",
  "此功能暂未在本站开放",
  "选一个聊天开始。",
  "{n} 条未读",
];

const OTHER_BAY = [
  ["bay-shell-copy", BAY_SHELL_MESSAGES],
  ["bay-needs-copy", BAY_NEEDS_MESSAGES],
  ["bay-supply-copy", BAY_SUPPLY_MESSAGES],
  ["bay-deal-copy", BAY_DEAL_MESSAGES],
  ["bay-orders-copy", BAY_ORDERS_MESSAGES],
  ["bay-seller-copy", BAY_SELLER_MESSAGES],
  ["bay-money-copy", BAY_MONEY_MESSAGES],
  ["bay-portal-copy", BAY_PORTAL_MESSAGES],
  ["leochat-page-copy", LEOCHAT_PAGE_MESSAGES],
];

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

test("合同 §4 前三行 16 句在 UI_MESSAGES 16 语都有非空译文", () => {
  assert.equal(SECTION_4_NEW.length, 16);
  const missing = [];
  for (const key of SECTION_4_NEW) {
    for (const locale of LOCALES) {
      const value = UI_MESSAGES[locale]?.[key];
      if (typeof value !== "string" || !value.trim()) missing.push(`${locale}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("分表：16 语齐全、占位符不丢、非中日韩不含汉字、中文站 key 等于值", () => {
  const keys = Object.keys(LEOBAY4_MESSAGES.zh);
  assert.ok(keys.length >= 18, `只有 ${keys.length} 条`);
  for (const key of SECTION_4_NEW) {
    assert.ok(keys.includes(key), `分表缺合同新句：${key}`);
  }
  assert.ok(keys.includes("灵感"), "分表缺「灵感」");
  assert.ok(keys.includes(CLOUD_BROWSER), "分表缺「云端浏览器」");
  for (const key of ALREADY_COMPLETE) {
    assert.equal(keys.includes(key), false, `已有齐全的句子不应再进本表：${key}`);
  }
  for (const key of keys) {
    assert.equal(LEOBAY4_MESSAGES.zh[key], key, `中文站 key 应等于值：${key}`);
    const placeholders = (key.match(/\{\w+\}/g) || []).sort();
    for (const locale of LOCALES) {
      const value = LEOBAY4_MESSAGES[locale][key];
      assert.ok(typeof value === "string" && value.trim(), `${locale} 缺译文：${key}`);
      assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), placeholders, `${locale} 占位符不对：${key}`);
      if (!["zh-TW", "ja", "ko"].includes(locale)) {
        assert.equal(HAN.test(value), false, `${locale} 含汉字：${key} → ${value}`);
      }
    }
  }
});

test("分表不与基础词典或别的 Bay 分表重复（「云端浏览器」除外）", () => {
  const conflicts = [];
  for (const key of Object.keys(LEOBAY4_MESSAGES.zh)) {
    if (key === CLOUD_BROWSER) {
      const inBase = LOCALES.filter((locale) => baseHas(locale, key));
      assert.deepEqual(
        inBase,
        ["en"],
        `「云端浏览器」应按基础词典只有英文：实际 ${inBase.join(",") || "无"}`,
      );
      assert.equal(baseEnglish(key), "Cloud browser");
      assert.equal(LEOBAY4_MESSAGES.en[key], "Cloud browser", "英文必须照抄基础词典");
      continue;
    }
    for (const locale of LOCALES) {
      if (baseHas(locale, key)) conflicts.push(`基础词典 ${locale}: ${key}`);
    }
    for (const [name, table] of OTHER_BAY) {
      if (table.zh?.[key] || table.en?.[key]) conflicts.push(`${name}: ${key}`);
    }
  }
  assert.deepEqual(conflicts, []);
});

test("「灵感」和「云端浏览器」在 UI_MESSAGES 16 语都有非空译文", () => {
  const missing = [];
  for (const key of ["灵感", CLOUD_BROWSER]) {
    for (const locale of LOCALES) {
      const value = UI_MESSAGES[locale]?.[key];
      if (typeof value !== "string" || !value.trim()) missing.push(`${locale}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});
