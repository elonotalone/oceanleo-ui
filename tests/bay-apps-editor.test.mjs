import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(REPO, rel), "utf8");

const HAN = /[\u4e00-\u9fff]/;
const LOCALES = ["zh", "zh-TW", "en", "ja", "ko", "fr", "de", "it", "es", "es-419", "pt-BR", "pt-PT", "ar", "hi", "th", "tr", "vi"];

const { BAY_APPS_EDITOR_MESSAGES, BAY_APPS_EDITOR_SOURCE } = await import("../src/i18n/ui/messages/bay-apps-editor-copy.ts");

test("AppEditorPane / AppVerifyPanel / hosted-to-bay 只走合同客户端", () => {
  for (const rel of [
    "src/shell/bay/apps/AppEditorPane.tsx",
    "src/shell/bay/apps/AppVerifyPanel.tsx",
    "src/shell/bay/apps/hosted-to-bay.ts",
  ]) {
    const text = src(rel);
    assert.doesNotMatch(text, /\bfetch\s*\(/);
    assert.doesNotMatch(text, /\/v1\//);
    assert.match(text, /from ["']\.\.\/\.\.\/\.\.\/lib\/bay\/apps["']/);
  }
  assert.doesNotMatch(src("src/shell/bay/apps/AppEditorPane.tsx"), /hosted-sites/);
  assert.match(src("src/shell/bay/apps/hosted-to-bay.ts"), /from ["']\.\.\/\.\.\/\.\.\/api\/hosted-sites["']/);
});

test("409 的处理在：建 hosted 草稿冲突时找原来那个", () => {
  const hosted = src("src/shell/bay/apps/hosted-to-bay.ts");
  assert.match(hosted, /status === 409/);
  assert.match(hosted, /hosted_site_id/);
  assert.match(hosted, /listMyBayApps/);
});

test("上架成功后去的是作品详情", () => {
  const editor = src("src/shell/bay/apps/AppEditorPane.tsx");
  assert.match(editor, /openBay\(\{\s*kind:\s*"app"/);
  assert.match(editor, /publishBayApp/);
});

test("上架作品填写页没有下一步，用展开表单", () => {
  // 本任务要改掉的旧行为：下一步分页、封面图地址输入框、请选择类目占位、请先选定一个公开网址事先小字。
  const editor = src("src/shell/bay/apps/AppEditorPane.tsx");
  assert.match(editor, /data-bay-reveal/);
  assert.match(editor, /BayRevealForm/);
  assert.match(editor, /BayPublishKindPair/);
  assert.match(editor, /BayImageGallery/);
  assert.doesNotMatch(editor, /下一步/);
  assert.doesNotMatch(editor, /封面图地址/);
  assert.doesNotMatch(editor, /请选择类目/);
  assert.doesNotMatch(editor, /请先选定一个公开网址/);
});

test("核验面板里 meta 在 code 里，没有注入 HTML", () => {
  const panel = src("src/shell/bay/apps/AppVerifyPanel.tsx");
  assert.match(panel, /<code[\s\S]*\{proof\.meta_tag\}/);
  assert.doesNotMatch(panel, /dangerouslySetInnerHTML/);
});

test("发布页没有单独选类别屏；新发帖留在卖页，不跳作品编辑", () => {
  const pane = src("src/shell/bay/seller/ServiceEditorPane.tsx");
  const picker = src("src/shell/bay/form/PublishCategoryPicker.tsx");
  assert.doesNotMatch(pane, /data-bay-publish="pick"/);
  assert.match(pane, /BayPublishKindPair/);
  assert.match(picker, /data-bay-publish-category/);
  assert.match(picker, /BayMenuSelect/);
  assert.doesNotMatch(picker, /kind:\s*"app-editor"/);
  assert.match(picker, /kind:\s*"publish"/);
});

test("账户已发布网站的按钮受 bayEnabledHere 控制", () => {
  const section = src("src/pages/settings/sections/AutomationSettingsSection.tsx");
  assert.match(section, /bayEnabledHere\(/);
  assert.match(section, /上架到 Bay/);
  assert.match(section, /listHostedSiteOnBay/);
  assert.match(section, /kind:\s*"app-editor"/);
});

test("文案 17 语齐全、占位符不丢、非中日韩不含汉字", () => {
  const keys = Object.values(BAY_APPS_EDITOR_SOURCE);
  assert.ok(keys.length >= 20);
  const missing = [];
  for (const key of keys) {
    const placeholders = (key.match(/\{\w+\}/g) || []).sort();
    for (const locale of LOCALES) {
      const value = BAY_APPS_EDITOR_MESSAGES[locale]?.[key];
      if (!value || !String(value).trim()) {
        missing.push(`${locale}: ${key}`);
        continue;
      }
      if (locale === "zh") assert.equal(value, key);
      assert.deepEqual((value.match(/\{\w+\}/g) || []).sort(), placeholders, `${locale} 占位符不对：${key}`);
      if (!["zh", "zh-TW", "ja", "ko"].includes(locale)) {
        assert.equal(HAN.test(value), false, `${locale} 含汉字：${key} → ${value}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("作品填写页交付条款有截止日期、向谁展示（含一群人）、用户自定义，并写入 lib 字段", () => {
  const editor = src("src/shell/bay/apps/AppEditorPane.tsx");
  const lib = src("src/lib/bay/apps.ts");
  const model = src("src/shell/bay/apps/app-editor-model.ts");
  assert.match(editor, /listingAudienceItem/);
  assert.match(editor, /BayCustomTerms/);
  assert.match(editor, /listingSectionGroups/);
  assert.match(editor, /howYouDeliverRow/);
  assert.match(editor, /用户自定义/);
  assert.match(editor, /截止日期/);
  assert.match(editor, /BayDeadlineField/);
  assert.doesNotMatch(editor, /type="date"/);
  assert.doesNotMatch(editor, /id: "source"/);
  assert.doesNotMatch(editor, /data-bay-app-source/);
  assert.doesNotMatch(editor, /常见问题/);
  assert.doesNotMatch(editor, /授权范围/);
  assert.doesNotMatch(editor, /FAQ/);
  for (const field of ["custom_terms", "audience_mode", "audience_handle", "audience_member_ids", "deadline_at"]) {
    assert.match(lib, new RegExp(`\\b${field}\\b`));
    assert.match(model, new RegExp(`\\b${field}\\b`));
  }
});

test("上架作品填写页：没有网站/外链产品字段，三块分组，页脚透底、灰字可读", () => {
  const editor = src("src/shell/bay/apps/AppEditorPane.tsx");
  assert.doesNotMatch(editor, /我在 OceanLeo 上的网站/);
  assert.doesNotMatch(editor, /我的链接/);
  assert.doesNotMatch(editor, /tt\("网站"\)/);
  assert.doesNotMatch(editor, /所属分类/);
  assert.doesNotMatch(editor, /replaceBay/);
  assert.match(editor, /BAY_CATEGORY_LABEL/);
  assert.match(editor, /listingSectionGroups/);
  assert.match(editor, /howYouDeliverRow\(tt, "app"/);
  assert.match(editor, /disabled: true/);
  assert.match(editor, /计价方式/);
  assert.match(editor, /一次买断/);
  assert.match(editor, /按月/);
  assert.match(editor, /saveBayAppPricing/);
  assert.match(editor, /id: "price"/);
  assert.doesNotMatch(editor, /data-bay-app-source="hosted"/);
  assert.doesNotMatch(editor, /data-bay-app-source="external"/);
  assert.doesNotMatch(editor, /选一个来源/);
  assert.doesNotMatch(editor, /打开方式/);
  assert.doesNotMatch(editor, /AppVerifyPanel/);
  assert.doesNotMatch(editor, /source_kind:\s*"computer"/);
  assert.match(editor, /<BayChoice/);
  assert.match(editor, /BAY_FORM_PAGE_CLASS/);
  assert.match(editor, /BAY_FORM_BAR_CLASS/);
  assert.doesNotMatch(editor, /type="radio"/);
  assert.doesNotMatch(editor, /bg-white\/95/);
  assert.doesNotMatch(editor, /-mx-4/);
  assert.doesNotMatch(editor, /text-neutral-400/);
  assert.doesNotMatch(editor, /text-stone-400/);
});
