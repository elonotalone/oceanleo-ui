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
  assert.match(chapters, /kind:\s*"task"/);
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

test("发布 pick 屏有通往 lesson-editor 的课程卡", () => {
  const pane = src("src/shell/bay/seller/ServiceEditorPane.tsx");
  assert.match(pane, /data-bay-publish="pick"/);
  assert.match(pane, /kind:\s*"lesson-editor"/);
  assert.match(pane, /把你的视频、文档、幻灯片编成一门课来卖/);
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
