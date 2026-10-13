import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (rel) => readFileSync(join(REPO, rel), "utf8");

const HAN = /[\u4e00-\u9fff]/;
const LOCALES = ["zh", "zh-TW", "en", "ja", "ko", "fr", "de", "it", "es", "es-419", "pt-BR", "pt-PT", "ar", "hi", "th", "tr", "vi"];

const { BAY_LESSONS_EDITOR_MESSAGES, BAY_LESSONS_EDITOR_SOURCE } = await import(
  "../src/i18n/ui/messages/bay-lessons-editor-copy.ts"
);

const EDITOR_FILES = [
  "src/shell/bay/lessons/LessonEditorPane.tsx",
  "src/shell/bay/lessons/BundleEditorPane.tsx",
  "src/shell/bay/lessons/ChapterList.tsx",
];

test("课程 / 套餐编辑只走 lib/bay/lessons，没有 fetch 或手拼 /v1/", () => {
  for (const rel of EDITOR_FILES) {
    const text = src(rel);
    assert.doesNotMatch(text, /\bfetch\s*\(/);
    assert.doesNotMatch(text, /\/v1\//);
    assert.match(text, /from ["']\.\.\/\.\.\/\.\.\/lib\/bay\/lessons["']/);
  }
});

test("章节来自作品选择窗，不是人手填 id", () => {
  const chapters = src("src/shell/bay/lessons/ChapterList.tsx");
  assert.match(chapters, /pickLibraryWork/);
  assert.match(chapters, /LibraryWorkPicker/);
  assert.match(chapters, /kind:\s*picked\.kind === "artifact" \? "artifact" : "task"/);
  assert.doesNotMatch(chapters, /work_task_id/);
  assert.match(chapters, /addBayLessonChapter/);
  assert.match(chapters, /reorderBayLessonChapters/);
  assert.match(chapters, /moveChapter/);
});

test("上架成功后去的是课程 / 套餐详情", () => {
  const lesson = src("src/shell/bay/lessons/LessonEditorPane.tsx");
  const bundle = src("src/shell/bay/lessons/BundleEditorPane.tsx");
  assert.match(lesson, /publishBayLesson/);
  assert.match(lesson, /openBay\(\{\s*kind:\s*"lesson"/);
  assert.match(bundle, /publishBayLessonBundle/);
  assert.match(bundle, /openBay\(\{\s*kind:\s*"bundle"/);
  assert.match(lesson, /openBay\(\{\s*kind:\s*"lesson-editor",\s*lessonId/);
  assert.match(bundle, /openBay\(\{\s*kind:\s*"bundle-editor",\s*bundleId/);
});

test("编辑页没有 iframe 或 dangerouslySetInnerHTML", () => {
  for (const rel of EDITOR_FILES) {
    const text = src(rel);
    assert.doesNotMatch(text, /<iframe/i);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/);
  }
});

test("发布页没有单独选类别屏；新发帖留在卖页，不跳课程编辑", () => {
  const pane = src("src/shell/bay/seller/ServiceEditorPane.tsx");
  const picker = src("src/shell/bay/form/PublishCategoryPicker.tsx");
  assert.doesNotMatch(pane, /data-bay-publish="pick"/);
  assert.match(pane, /BayPublishKindPair/);
  assert.match(picker, /data-bay-publish-category/);
  assert.match(picker, /BayMenuSelect/);
  assert.doesNotMatch(picker, /kind:\s*"lesson-editor"/);
  assert.match(picker, /kind:\s*"publish"/);
});

test("文案 17 语齐全、占位符不丢、非中日韩不含汉字", () => {
  const keys = Object.values(BAY_LESSONS_EDITOR_SOURCE);
  assert.ok(keys.length >= 20);
  const missing = [];
  for (const key of keys) {
    const placeholders = (key.match(/\{\w+\}/g) || []).sort();
    for (const locale of LOCALES) {
      const value = BAY_LESSONS_EDITOR_MESSAGES[locale]?.[key];
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

test("课程填写页交付条款有截止日期、向谁展示（含一群人）、用户自定义，并写入 lib 字段", () => {
  const editor = src("src/shell/bay/lessons/LessonEditorPane.tsx");
  const lib = src("src/lib/bay/lessons.ts");
  const model = src("src/shell/bay/lessons/lesson-editor-model.ts");
  assert.match(editor, /listingAudienceItem/);
  assert.match(editor, /BayCustomTerms/);
  assert.match(editor, /listingSectionGroups/);
  assert.match(editor, /howYouDeliverRow/);
  assert.match(editor, /id: "price"/);
  assert.match(editor, /用户自定义/);
  assert.match(editor, /截止日期/);
  assert.match(editor, /BayDeadlineField/);
  assert.doesNotMatch(editor, /type="date"/);
  assert.match(editor, /lessonTermsWrite/);
  assert.doesNotMatch(editor, /常见问题/);
  assert.doesNotMatch(editor, /授权范围/);
  assert.doesNotMatch(editor, /FAQ/);
  for (const field of ["custom_terms", "audience_mode", "audience_handle", "audience_member_ids", "deadline_at"]) {
    assert.match(lib, new RegExp(`\\b${field}\\b`));
    assert.match(model, new RegExp(`\\b${field}\\b`));
  }
});

test("填写页没有通道费托管说明、封面地址框、下一步添加章节", () => {
  const lesson = src("src/shell/bay/lessons/LessonEditorPane.tsx");
  const bundle = src("src/shell/bay/lessons/BundleEditorPane.tsx");
  assert.equal("escrowNote" in BAY_LESSONS_EDITOR_SOURCE, false);
  assert.equal("nextChapters" in BAY_LESSONS_EDITOR_SOURCE, false);
  for (const text of [lesson, bundle]) {
    assert.match(text, /BayRevealForm/);
    assert.match(text, /BayImageGallery/);
    assert.match(text, /from ["']\.\.\/form["']/);
    assert.doesNotMatch(text, /封面图地址/);
    assert.doesNotMatch(text, /Please enter/i);
    assert.doesNotMatch(text, /请填写标题/);
    assert.doesNotMatch(text, /请写一句话简介/);
    assert.doesNotMatch(text, /请选择类目/);
  }
  assert.doesNotMatch(lesson, /买家付款时另加支付通道费/);
  assert.doesNotMatch(lesson, /托管 7 天/);
  assert.doesNotMatch(lesson, /平台不抽成/);
  assert.doesNotMatch(lesson, /下一步：添加章节/);
  assert.match(lesson, /tt\("保存"\)/);
  assert.match(lesson, /ChapterList/);
});

test("课程填写页：分类不是所属分类，交付内容在交付条款上方，价格组是价格", () => {
  const lesson = src("src/shell/bay/lessons/LessonEditorPane.tsx");
  assert.doesNotMatch(lesson, /所属分类/);
  assert.doesNotMatch(lesson, /replaceBay/);
  assert.match(lesson, /BAY_CATEGORY_LABEL/);
  assert.match(lesson, /listingSectionGroups/);
  assert.match(lesson, /howYouDeliverRow\(tt, "lesson"/);
  assert.match(lesson, /disabled: true/);
  assert.match(lesson, /id: "price"/);
  assert.match(lesson, /offerItems/);
  assert.match(lesson, /audienceItems/);
});

test("课程 / 套餐填写页：页脚透底、灰字可读", () => {
  const lesson = src("src/shell/bay/lessons/LessonEditorPane.tsx");
  const bundle = src("src/shell/bay/lessons/BundleEditorPane.tsx");
  assert.match(lesson, /BayPublishKindPair/);
  for (const text of [lesson, bundle]) {
    assert.match(text, /BAY_FORM_PAGE_CLASS/);
    assert.match(text, /BAY_FORM_BAR_CLASS/);
    assert.doesNotMatch(text, /bg-white\/95/);
    assert.doesNotMatch(text, /-mx-4/);
    assert.doesNotMatch(text, /text-neutral-400/);
    assert.doesNotMatch(text, /text-stone-400/);
  }
});
