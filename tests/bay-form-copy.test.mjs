// 安全矩阵：不适用（填写页展开表单，无不可信注入）
import assert from "node:assert/strict";
import test from "node:test";

import { LOCALES } from "../src/i18n/config.ts";
import { BAY_FORM_MESSAGES, BAY_FORM_SOURCE } from "../src/i18n/ui/messages/bay-form-copy.ts";

const HAN = /[\u4e00-\u9fff]/;

test("分类不是所属分类，英文是 Category 不是 Subcategory", () => {
  assert.equal(BAY_FORM_SOURCE.subcategory, "分类");
  assert.equal(BAY_FORM_SOURCE.subcategory.includes("所属"), false);
  assert.equal(BAY_FORM_MESSAGES.zh["分类"], "分类");
  assert.equal(BAY_FORM_MESSAGES["zh-TW"]["分类"], "分類");
  assert.equal(BAY_FORM_MESSAGES.en["分类"], "Category");
  for (const locale of LOCALES) {
    const value = BAY_FORM_MESSAGES[locale]?.["分类"];
    assert.ok(value, `${locale} 缺「分类」`);
    assert.equal(
      /所属分类|所屬分類|Subcategor|Unterkategorie|Sous-catégorie|Sottocategoria|Subcategoria|Danh mục con|Alt kategori|サブカテゴリ|하위 카테고리|الفئة الفرعية|หมวดหมู่ย่อย|उप-श्रेणी/i.test(
        value,
      ),
      false,
      `${locale} 仍是旧词：${value}`,
    );
  }
});

test("bay-form 文案 17 语齐全、占位符不丢、非中日韩不含汉字", () => {
  const keys = Object.values(BAY_FORM_SOURCE);
  assert.equal(LOCALES.length, 17);
  assert.ok(keys.length > 0);
  for (const locale of LOCALES) {
    for (const key of keys) {
      const value = BAY_FORM_MESSAGES[locale]?.[key];
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
