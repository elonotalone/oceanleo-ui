// W03（oceanleo-bay）：Bay 浮窗与 /bay 页各挂一个「我的库」挑作品宿主（仲裁 #20）。
// W04：标准页框与 17px 标题在 LeoChat 整页；LibraryWorkPickerHost 在 LeoBay 栏；BayPage 只转给整页。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");

test("LeoChat 整页：标准页框里的 17px 标题，没有介绍句", () => {
  const page = readFileSync(join(REPO, "src/shell/leochat/LeoChatPage.tsx"), "utf8");
  assert.match(page, /APP_PAGE_FRAME_CLASS/);
  assert.match(page, /APP_PAGE_TITLE_CLASS/);
  assert.doesNotMatch(page, /function PageHeader/);
  assert.doesNotMatch(page, /找人做事，或者接别人的需求/);
  assert.doesNotMatch(page, /text-\[22px\]/);
});

test("BayView 与 LeoBay 栏都挂了 LibraryWorkPickerHost", () => {
  const view = readFileSync(join(REPO, "src/shell/bay/shell/BayView.tsx"), "utf8");
  const leobay = readFileSync(join(REPO, "src/shell/leochat/page-leobay.tsx"), "utf8");
  assert.match(view, /import\s*\{\s*LibraryWorkPickerHost\s*\}\s*from\s*"\.\.\/needs"/);
  assert.match(leobay, /import\s*\{\s*LibraryWorkPickerHost\s*\}\s*from\s*"\.\.\/bay\/needs\/LibraryWorkPicker"/);
  assert.match(view, /<LibraryWorkPickerHost\s*\/>/);
  assert.match(leobay, /<LibraryWorkPickerHost\s*\/>/);
});

test("BayPage 转给 LeoChatPage，停在 LeoBay 栏", () => {
  const page = readFileSync(join(REPO, "src/shell/bay/shell/BayPage.tsx"), "utf8");
  assert.match(page, /LeoChatPage/);
  assert.match(page, /initialTab="bay"/);
  assert.doesNotMatch(page, /OceanLeo Bay/);
});
