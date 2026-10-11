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
  assert.match(src("src/shell/bay/apps/AppEditorPane.tsx"), /from ["']\.\.\/\.\.\/\.\.\/api\/hosted-sites["']/);
  assert.match(src("src/shell/bay/apps/hosted-to-bay.ts"), /from ["']\.\.\/\.\.\/\.\.\/api\/hosted-sites["']/);
});

test("409 的处理在：建 hosted 草稿冲突时找原来那个", () => {
  const editor = src("src/shell/bay/apps/AppEditorPane.tsx");
  const hosted = src("src/shell/bay/apps/hosted-to-bay.ts");
  assert.match(editor, /status === 409/);
  assert.match(editor, /hosted_site_id/);
  assert.match(editor, /listMyBayApps/);
  assert.match(hosted, /status === 409/);
  assert.match(hosted, /hosted_site_id/);
  assert.match(hosted, /listMyBayApps/);
});

test("上架成功后去的是作品详情", () => {
  const editor = src("src/shell/bay/apps/AppEditorPane.tsx");
  assert.match(editor, /openBay\(\{\s*kind:\s*"app"/);
  assert.match(editor, /publishBayApp/);
});

test("核验面板里 meta 在 code 里，没有注入 HTML", () => {
  const panel = src("src/shell/bay/apps/AppVerifyPanel.tsx");
  assert.match(panel, /<code[\s\S]*\{proof\.meta_tag\}/);
  assert.doesNotMatch(panel, /dangerouslySetInnerHTML/);
});

test("发布 pick 屏有通往 app-editor 的作品卡", () => {
  const pane = src("src/shell/bay/seller/ServiceEditorPane.tsx");
  assert.match(pane, /data-bay-publish="pick"/);
  assert.match(pane, /kind:\s*"app-editor"/);
  assert.match(pane, /把你做的应用或网站放上来，别人点开就能用/);
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
