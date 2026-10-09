// W6（LeoBay 第三波）：合同 §4 每一句在合并后的 Bay 词典或基础词典里 16 语齐全、
// 占位符不丢、非中日韩语种不含汉字。
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const { BAY_MESSAGES } = await import("../src/i18n/ui/messages/bay-copy.ts");

const LOCALES = ["zh-TW", "en", "ja", "ko", "fr", "de", "it", "es", "es-419", "pt-BR", "pt-PT", "ar", "hi", "th", "tr", "vi"];
const HAN = /[\u4e00-\u9fff]/;

const SECTION_4 = [
  "素材与服务",
  "看素材与服务还是看需求",
  "专业咨询",
  "搜素材、服务、需求…",
  "这里还没有素材和服务",
  "这里还没有需求",
  "返回 LeoBay",
  "素材",
  "服务",
  "需求",
  "图片、模板、文件，买家付款后立即拿到",
  "为买家做一件事，或者按次、按小时答疑",
  "说清你要做的事，别人来报价，你来挑",
  "要做什么",
  "预算和期限",
  "报价由你挑",
  "服务形式",
  "做一件事",
  "按约定的时间交付成果",
  "按次或按小时回答问题",
  "发需求",
  "我发布的",
  "我卖出的",
  "我买到的",
  "我的收藏",
  "个人卡片",
  "登录后查看你发布的、卖出的、买到的和收藏",
  "你还没有发布过东西。",
  "报价中",
  "卖出的订单",
  "你还没有卖出过东西。",
  "你还没有买过东西。",
  "去逛逛",
  "卖家",
  "你还没有收藏。",
  "看到喜欢的服务、卖家或需求，点「收藏」，就会出现在这里。",
  "取消收藏",
  "收藏列表没读出来，请稍后再试。",
  "买家看到的样子",
  "打开我的主页",
  "认证",
  "收款",
  "资料还没有公开。公开后买家才能看到这张卡片，你才能上架服务。",
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

test("合同 §4：16 语齐全、占位符不丢、非中日韩不含汉字", () => {
  assert.equal(SECTION_4.length, 43);
  const missing = [];
  for (const key of SECTION_4) {
    const placeholders = (key.match(/\{\w+\}/g) || []).sort();
    for (const locale of LOCALES) {
      const value = BAY_MESSAGES[locale]?.[key] || null;
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
